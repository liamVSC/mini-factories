import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.innerWidth=1280;
globalThis.innerHeight=720;

const {freshState,makeBuilding,hydrate,serialise}=await import('../src/state.js');
const {pointOnRoute,length}=await import('../src/world.js');
const {updateEconomy}=await import('../src/economy.js');

const route=[{x:0,y:0},{x:100,y:0}];
const truck=(overrides={})=>({
  id:'test-truck',
  route,
  routeKey:'0.0,0.0|100.0,0.0',
  t:.999,
  speed:.1,
  value:50,
  cargo:2,
  to:null,
  source:null,
  contractId:0,
  longDistance:false,
  wait:0,
  stage:'delivery',
  ...overrides
});

test('route interpolation follows distance, not point index',()=>{
  const path=[{x:0,y:0},{x:100,y:0},{x:100,y:300}];
  assert.equal(length(path),400);
  assert.deepEqual(pointOnRoute(path,0),{x:0,y:0});
  assert.deepEqual(pointOnRoute(path,.25),{x:100,y:0});
  assert.deepEqual(pointOnRoute(path,.5),{x:100,y:100});
  assert.deepEqual(pointOnRoute(path,1),{x:100,y:300});
});

test('fresh state contains render version and empty truck list',()=>{
  const s=freshState();
  assert.equal(s.renderVersion,0);
  assert.deepEqual(s.trucks,[]);
});

test('hydrate preserves valid buildings and normalises render state',()=>{
  const s=freshState();
  s.buildings.push(makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},100,200,'factory-1'));
  const saved=serialise(s);
  saved.renderVersion='12';
  saved.trucks=[{id:'stale'}];
  const loaded=hydrate(saved);
  assert.ok(loaded);
  assert.equal(loaded.renderVersion,12);
  assert.equal(loaded.buildings.length,1);
  assert.equal(loaded.buildings[0].x,100);
  assert.deepEqual(loaded.trucks,[]);
});

test('connected factory dispatches a truck that survives the first economy tick',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},200,0,'shop-1');
  factory.stock=4;
  s.buildings.push(factory,shop);
  s.roads.push({id:'road-1',points:[{x:0,y:0},{x:200,y:0}],bridge:false,condition:1,age:0});
  updateEconomy(s,1.2,()=>{});
  assert.equal(s.trucks.length,1);
  assert.ok(s.trucks[0].t>0);
  assert.ok(s.trucks[0].route.length>=2);
});

test('malformed active truck data is discarded without crashing the economy tick',()=>{
  const s=freshState();
  s.trucks.push({id:'bad-1',route:null,t:0});
  s.trucks.push({id:'bad-2',route:[{x:0,y:0}],t:0});
  s.trucks.push({id:'bad-3',route:[{x:0,y:0},{x:1,y:1}],t:NaN});
  assert.doesNotThrow(()=>updateEconomy(s,.1,()=>{}));
  assert.equal(s.trucks.length,0);
});

test('completed delivery updates cash, orders, income and shop service',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},100,0,'shop-1');
  const t=truck({source:factory,to:shop});
  s.buildings.push(factory,shop);
  s.trucks.push(t);
  updateEconomy(s,.1,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(s.cash,550);
  assert.equal(s.orders,2);
  assert.equal(s.deliveryIncome,50);
  assert.equal(s.deliveredBy.Food,2);
  assert.equal(shop.served,2);
});

test('completed warehouse transfer increases inventory and storage',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const warehouse=makeBuilding({name:'Warehouse',kind:'warehouse',need:null,color:'#fff'},100,0,'warehouse-1');
  const t=truck({source:factory,to:warehouse,stage:'warehouse',cargo:3,value:0});
  s.buildings.push(factory,warehouse);
  s.trucks.push(t);
  updateEconomy(s,.1,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(warehouse.inventory.Food,3);
  assert.equal(warehouse.storage,3);
  assert.equal(s.orders,0);
});

test('completed contract delivery clears in-flight cargo and pays the contract reward',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},100,0,'shop-1');
  shop.contract={id:7,type:'Food',qty:2,remaining:2,reward:125,expires:30,initial:2,urgent:false,inFlight:2};
  const t=truck({source:factory,to:shop,cargo:2,value:50,contractId:7});
  s.buildings.push(factory,shop);
  s.trucks.push(t);
  updateEconomy(s,.1,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(shop.contract,null);
  assert.equal(s.cash,675);
  assert.equal(s.orders,2);
  assert.equal(s.deliveryIncome,50);
  assert.equal(s.reputation,100);
});
