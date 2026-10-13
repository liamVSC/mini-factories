import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState} from '../dist/state.js';
import {saveRecoveredState,loadRecoveredState,SAVE_KEY,BACKUP_KEY,RECOVERY_KEY} from '../dist/persistence/recovery.js';

function storage(){
  const data=new Map();
  return{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
}

test('recovery save can be loaded from a valid primary snapshot',()=>{
  const store=storage(),s=freshState();s.buildings=[];s.roads=[];s.cash=1234;
  assert.equal(saveRecoveredState(s,store,100),true);
  const loaded=loadRecoveredState(store);
  assert.equal(loaded.cash,1234);
  assert.ok(store.getItem(SAVE_KEY));
  assert.equal(store.getItem(RECOVERY_KEY),null);
});

test('corrupt primary falls back to the last valid backup',()=>{
  const store=storage(),s=freshState();s.buildings=[];s.roads=[];s.cash=800;
  saveRecoveredState(s,store,100);
  s.cash=1200;
  saveRecoveredState(s,store,200);
  store.setItem(SAVE_KEY,'{not valid json');
  const loaded=loadRecoveredState(store);
  assert.equal(loaded.cash,800);
  assert.ok(store.getItem(BACKUP_KEY));
});

test('incomplete recovery snapshot is ignored',()=>{
  const store=storage(),s=freshState();s.buildings=[];s.roads=[];
  store.setItem(RECOVERY_KEY,JSON.stringify({schema:1,savedAt:999,state:{version:6,buildings:[],roads:null}}));
  assert.equal(loadRecoveredState(store),null);
});


test('hydration resets runtime state and clears orphaned contract in-flight cargo',()=>{
  const store=storage(),s=freshState();
  s.buildings=[{
    id:'shop-1',x:100,y:100,r:25,kind:'shop',type:'Market',need:'Food',level:1,stock:0,max:8,production:0,demand:3,served:0,satisfaction:100,loading:0,logistics:0,
    contract:{id:7,type:'Food',qty:4,initial:4,remaining:3,reward:120,expires:20,inFlight:3,urgent:true}
  }];
  s.roads=[];s.cash=900;s.mode='build';s.paused=true;s.gameOver=true;s.buildMode={name:'Market'};
  assert.equal(saveRecoveredState(s,store,500),true);
  const loaded=loadRecoveredState(store);
  assert.equal(loaded.mode,'select');
  assert.equal(loaded.paused,false);
  assert.equal(loaded.gameOver,false);
  assert.equal(loaded.buildMode,null);
  assert.equal(loaded.buildings[0].contract.inFlight,0);
  assert.equal(loaded.buildings[0].contract.remaining,3);
});


test('in-flight cargo and contract accounting survive save/reload without duplicate stock or rewards', async () => {
  const { serialise } = await import('../dist/persistence/save.js');
  const { hydrate } = await import('../dist/persistence/load.js');
  const { makeBuilding, TYPES } = await import('../dist/state.js');
  const { buildingRoadEntrance } = await import('../dist/world/buildings/index.js');
  const factory = makeBuilding(TYPES.find(type => type.name === 'Food'), 0, -108, 'persist-factory');
  const shop = makeBuilding(TYPES.find(type => type.name === 'Market'), 360, 99, 'persist-shop');
  factory.stock = 1; // two units were already dispatched from the original stock
  factory.max = 4;
  shop.contract = { id: 88, type: 'Food', qty: 4, initial: 4, remaining: 4, reward: 120, expires: 100, inFlight: 2, urgent: false };
  const start = buildingRoadEntrance(factory);
  const end = buildingRoadEntrance(shop);
  assert.ok(start && end);
  const state = freshState();
  state.buildings = [factory, shop];
  state.roads = [{ id: 'persist-road', points: [{x:start.x,y:start.y},{x:180,y:start.y},{x:180,y:end.y},{x:end.x,y:end.y}], age: 0, bridge: false, condition: 1 }];
  state.trucks = [{
    id: 'persist-truck', source: factory, to: shop, cargo: 2, cargoType: 'Food', contractId: 88,
    stage: 'delivery', value: 40, t: 0.35, speed: 0.085, currentSpeed: 0.085,
    route: [{x:start.x,y:start.y},{x:180,y:start.y},{x:180,y:end.y},{x:end.x,y:end.y}],
    centerlineRoute: [{x:start.x,y:start.y},{x:180,y:start.y},{x:180,y:end.y},{x:end.x,y:end.y}],
    laneRoute: [{x:start.x,y:start.y},{x:180,y:start.y},{x:180,y:end.y},{x:end.x,y:end.y}],
    laneIds: [], laneRoadIds: [], routeNetworkRevision: state.roadNetworkRevision, wait: 0, dead: false
  }];
  const originalFactoryStock = factory.stock;
  const originalCash = state.cash;
  const snapshot = JSON.parse(JSON.stringify(serialise(state)));
  const loaded = hydrate(snapshot);
  assert.ok(loaded);
  const loadedFactory = loaded.buildings.find(building => building.id === factory.id);
  const loadedShop = loaded.buildings.find(building => building.id === shop.id);
  assert.ok(loadedFactory && loadedShop);
  assert.equal(loaded.trucks.length, 1);
  assert.equal(loaded.trucks[0].source, loadedFactory, 'truck source must reference the canonical loaded factory');
  assert.equal(loaded.trucks[0].to, loadedShop, 'truck destination must reference the canonical loaded shop');
  assert.equal(loaded.trucks[0].cargo, 2);
  assert.equal(loadedFactory.stock, originalFactoryStock, 'save/reload must not refund cargo that remains in flight');
  assert.equal(loadedShop.contract?.remaining, 4, 'dispatch must not count as completed contract progress');
  assert.equal(loadedShop.contract?.inFlight, 2, 'contract inFlight must be reconstructed from active cargo');
  assert.equal(loaded.cash, originalCash, 'loading in-flight cargo must not credit money');
  assert.equal(loaded.orders, 0);
  assert.equal(loaded.deliveryIncome, 0);
  assert.equal(loaded.trucks[0].routeNetworkRevision, loaded.roadNetworkRevision);
});

test('save/reload preserves return trucks without reintroducing delivered cargo', async () => {
  const { serialise } = await import('../dist/persistence/save.js');
  const { hydrate } = await import('../dist/persistence/load.js');
  const { makeBuilding, TYPES } = await import('../dist/state.js');
  const { buildingRoadEntrance } = await import('../dist/world/buildings/index.js');
  const factory = makeBuilding(TYPES.find(type => type.name === 'Food'), 0, -108, 'return-factory');
  const shop = makeBuilding(TYPES.find(type => type.name === 'Market'), 360, 99, 'return-shop');
  const start = buildingRoadEntrance(factory);
  const end = buildingRoadEntrance(shop);
  assert.ok(start && end);
  const state = freshState();
  state.buildings = [factory, shop];
  state.roads = [{ id: 'return-road', points: [{x:start.x,y:start.y},{x:180,y:start.y},{x:180,y:end.y},{x:end.x,y:end.y}], age: 0, bridge: false, condition: 1 }];
  state.trucks = [{
    id: 'return-truck', source: shop, to: factory, cargo: 0, cargoType: 'Food', contractId: 0,
    stage: 'return', value: 0, t: 0.2, speed: 0.085, currentSpeed: 0.085,
    route: [{x:end.x,y:end.y},{x:180,y:end.y},{x:180,y:start.y},{x:start.x,y:start.y}],
    centerlineRoute: [{x:end.x,y:end.y},{x:180,y:end.y},{x:180,y:start.y},{x:start.x,y:start.y}],
    laneRoute: [{x:end.x,y:end.y},{x:180,y:end.y},{x:180,y:start.y},{x:start.x,y:start.y}],
    laneIds: [], laneRoadIds: [], routeNetworkRevision: state.roadNetworkRevision, wait: 0, dead: false
  }];
  const loaded = hydrate(JSON.parse(JSON.stringify(serialise(state))));
  assert.ok(loaded);
  assert.equal(loaded.trucks.length, 1);
  assert.equal(loaded.trucks[0].stage, 'return');
  assert.equal(loaded.trucks[0].cargo, 0);
  assert.equal(loaded.trucks[0].value, 0);
});


test('malformed persisted truck cargo is refunded instead of being discarded during serialization', async () => {
  const { serialise } = await import('../dist/persistence/save.js');
  const { hydrate } = await import('../dist/persistence/load.js');
  const { makeBuilding, TYPES } = await import('../dist/state.js');
  const { buildingRoadEntrance } = await import('../dist/world/buildings/index.js');
  const factory = makeBuilding(TYPES.find(type => type.name === 'Food'), 0, -108, 'malformed-cargo-factory');
  const shop = makeBuilding(TYPES.find(type => type.name === 'Market'), 360, 99, 'malformed-cargo-shop');
  factory.stock = 1;
  shop.contract = { id: 89, type: 'Food', qty: 4, initial: 4, remaining: 4, reward: 120, expires: 100, inFlight: 2, urgent: false };
  const start = buildingRoadEntrance(factory);
  const end = buildingRoadEntrance(shop);
  assert.ok(start && end);
  const state = freshState();
  state.buildings = [factory, shop];
  state.roads = [{ id: 'malformed-cargo-road', points: [{x:start.x,y:start.y},{x:180,y:start.y},{x:180,y:end.y},{x:end.x,y:end.y}], age: 0, bridge: false, condition: 1 }];
  state.trucks = [{
    id: 'malformed-cargo-truck',
    source: factory,
    to: shop,
    cargo: 2,
    cargoType: 'Food',
    contractId: 89,
    stage: 'delivery',
    value: 40,
    t: 0.35,
    speed: 0.085,
    route: [{x: start.x, y: start.y}], // invalid route must be handled by hydration recovery
  }];

  const persisted = JSON.parse(JSON.stringify(serialise(state)));
  assert.equal(persisted.trucks.length, 1, 'serialization must retain the record for recovery');
  const loaded = hydrate(persisted);
  assert.ok(loaded);
  const loadedFactory = loaded.buildings.find(building => building.id === factory.id);
  const loadedShop = loaded.buildings.find(building => building.id === shop.id);
  assert.ok(loadedFactory && loadedShop);
  assert.equal(loaded.trucks.length, 0, 'invalid truck must not be resumed');
  assert.equal(loadedFactory.stock, 3, 'cargo must be refunded to its canonical source exactly once');
  assert.equal(loadedShop.contract?.inFlight, 0, 'discarded delivery cargo must not remain inFlight');
  assert.equal(loadedShop.contract?.remaining, 4, 'recovery must not count as a completed delivery');
  assert.equal(loaded.cash, state.cash, 'recovery must not award sale proceeds');
  assert.equal(loaded.orders, 0);
  assert.equal(loaded.deliveryIncome, 0);
});
