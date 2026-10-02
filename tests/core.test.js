import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.innerWidth=1280;
globalThis.innerHeight=720;

const {freshState,makeBuilding}=await import('../src/state.js');
const {hydrate}=await import('../src/persistence/load.js');
const {serialise}=await import('../src/persistence/save.js');
const {pointOnRoute,length,dist,addRoad,eraseRoad,routeOnRoadNetwork,roadPreview,roadTarget,roadEndpointPreview,editRoadEndpoint,editRoadSegment,roadNetwork,roadTopology,cleanupRoadNetwork,WORLD_BOUNDS,WORLD_MARGIN}=await import('../src/world.js');
const {updateEconomy}=await import('../src/economy.js');
await import('../src/version.js');
const {segmentCrossesRiver}=await import('../src/world/roads/placement.js');

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

test('bridge classification only occurs when a road crosses the river',()=>{
  assert.equal(segmentCrossesRiver({x:-200,y:360},{x:200,y:360}),false);
  assert.equal(segmentCrossesRiver({x:-200,y:480},{x:200,y:480}),false);
  assert.equal(segmentCrossesRiver({x:-200,y:300},{x:200,y:520}),true);
  assert.equal(segmentCrossesRiver({x:0,y:300},{x:0,y:540}),true);
});

test('game version has one central runtime source',()=>{
  assert.equal(globalThis.MINI_FACTORIES_VERSION,'3');
  assert.equal(globalThis.MINI_FACTORIES_VERSION_DATE,'2 Oct 2026');
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


test('serialise and hydrate preserve persistent progression while clearing transient runtime state',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Parts',kind:'factory',need:null,color:'#fff'},120,80,'factory-1');
  factory.level=3;
  factory.max=10;
  factory.stock=7;
  factory.loading=2;
  const shop=makeBuilding({name:'Garage',kind:'shop',need:'Parts',color:'#fff'},260,80,'shop-1');
  shop.level=2;
  shop.demand=6;
  shop.served=11;
  shop.contract={id:9,type:'Parts',qty:3,remaining:3,reward:240,expires:40,initial:3,urgent:true,inFlight:0};
  s.buildings.push(factory,shop);
  s.roads=[{id:'road-1',points:[{x:120,y:80},{x:260,y:80}],bridge:false,condition:.8,age:12}];
  s.cash=4321;
  s.orders=27;
  s.companyLevel=4;
  s.xp=73;
  s.xpToNext=162;
  s.reputation=88;
  s.objective=3;
  s.deliveryIncome=1940;
  s.deliveredBy={Food:12,Parts:7};
  s.longContracts=2;
  s.contractId=10;
  s.research={automation:2,logistics:1,industry:3};
  s.renderVersion=17;
  s.trucks=[{id:'runtime-truck',route:route,t:.5}];
  s.particles=[{x:1,y:2}];
  const loaded=hydrate(serialise(s));
  assert.ok(loaded);
  for(const key of ['cash','orders','companyLevel','xp','xpToNext','reputation','objective','deliveryIncome','longContracts','contractId','renderVersion']){
    assert.deepEqual(loaded[key],s[key]);
  }
  assert.deepEqual(loaded.research,s.research);
  assert.deepEqual(loaded.deliveredBy,s.deliveredBy);
  assert.equal(loaded.buildings.length,2);
  assert.equal(loaded.buildings[0].level,3);
  assert.equal(loaded.buildings[0].stock,7);
  assert.equal(loaded.buildings[1].contract.reward,240);
  assert.equal(loaded.roads.length,1);
  assert.deepEqual(loaded.trucks,[]);
  assert.deepEqual(loaded.particles,[]);
});

test('fresh state does not contain the removed road budget mechanic',()=>{
  const s=freshState();
  assert.equal('roadBudget' in s,false);
});

test('company level-up does not create a road budget',()=>{
  const s=freshState();
  s.xp=s.xpToNext;
  assert.doesNotThrow(()=>updateEconomy(s,0,()=>{}));
  assert.equal(s.companyLevel,2);
  assert.equal('roadBudget' in s,false);
});


test('factory to warehouse to shop completes without losing cargo',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const warehouse=makeBuilding({name:'Warehouse',kind:'warehouse',need:null,color:'#fff'},100,0,'warehouse-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},200,0,'shop-1');
  factory.stock=4;
  warehouse.max=10;
  shop.demand=4;
  s.buildings.push(factory,warehouse,shop);
  s.roads.push(
    {id:'road-1',points:[{x:0,y:0},{x:100,y:0}],bridge:false,condition:1,age:0},
    {id:'road-2',points:[{x:100,y:0},{x:200,y:0}],bridge:false,condition:1,age:0}
  );
  updateEconomy(s,1.2,()=>{});
  assert.equal(s.trucks.length,1);
  assert.equal(s.trucks[0].stage,'warehouse');
  assert.equal(factory.stock,1);
  s.trucks[0].t=.999;
  updateEconomy(s,.1,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(warehouse.inventory.Food,3);
  assert.equal(warehouse.storage,3);
});

test('warehouse delivery to a connected shop consumes stored inventory',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const warehouse=makeBuilding({name:'Warehouse',kind:'warehouse',need:null,color:'#fff'},100,0,'warehouse-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},200,0,'shop-1');
  warehouse.inventory={Food:5};
  warehouse.storage=5;
  shop.demand=5;
  s.buildings.push(factory,warehouse,shop);
  s.roads.push(
    {id:'road-1',points:[{x:0,y:0},{x:100,y:0}],bridge:false,condition:1,age:0},
    {id:'road-2',points:[{x:100,y:0},{x:200,y:0}],bridge:false,condition:1,age:0}
  );
  updateEconomy(s,1.2,()=>{});
  assert.equal(s.trucks.length,1);
  assert.equal(s.trucks[0].source.id,'warehouse-1');
  assert.equal(s.trucks[0].to.id,'shop-1');
  assert.equal(s.trucks[0].cargo,3);
  assert.equal(warehouse.inventory.Food,2);
  assert.equal(warehouse.storage,2);
});

test('expired contract can remove the contract while a delivery is still in flight without crashing',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},100,0,'shop-1');
  shop.contract={id:12,type:'Food',qty:2,remaining:2,reward:100,expires:.01,initial:2,urgent:false,inFlight:0};
  const t=truck({source:factory,to:shop,cargo:2,value:40,contractId:12,t:.999});
  s.buildings.push(factory,shop);
  s.trucks.push(t);
  const messages=[];
  assert.doesNotThrow(()=>updateEconomy(s,.1,m=>messages.push(m)));
  assert.equal(shop.contract,null);
  assert.equal(s.trucks.length,0);
  assert.equal(s.cash,540);
  assert.equal(s.reputation,96);
  assert.ok(messages.some(m=>m.includes('expired')));
});

test('multiple trucks on the same route do not corrupt each other',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},100,0,'shop-1');
  s.buildings.push(factory,shop);
  const sharedRoute=[{x:0,y:0},{x:100,y:0}];
  s.trucks.push(
    truck({id:'truck-a',route:sharedRoute,t:.40,source:factory,to:shop,value:10,cargo:1}),
    truck({id:'truck-b',route:sharedRoute,t:.45,source:factory,to:shop,value:20,cargo:1})
  );
  updateEconomy(s,.1,()=>{});
  assert.equal(s.trucks.length,2);
  assert.ok(s.trucks.every(t=>Number.isFinite(t.t)));
});

test('routing through a road intersection produces a usable route',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},200,200,'shop-1');
  factory.stock=4;
  s.buildings.push(factory,shop);
  s.roads.push(
    {id:'road-a',points:[{x:0,y:0},{x:200,y:0}],bridge:false,condition:1,age:0},
    {id:'road-b',points:[{x:100,y:-100},{x:100,y:200}],bridge:false,condition:1,age:0},
    {id:'road-c',points:[{x:100,y:200},{x:200,y:200}],bridge:false,condition:1,age:0}
  );
  updateEconomy(s,1.2,()=>{});
  assert.equal(s.trucks.length,1);
  assert.ok(s.trucks[0].route.length>=3);
  assert.ok(s.trucks[0].route.some(p=>Math.abs(p.x-100)<1&&Math.abs(p.y-200)<1));
});


test('truck follows an intersection route across the junction instead of stopping at the branch',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},200,200,'shop-1');
  s.buildings.push(factory,shop);
  s.roads.push(
    {id:'road-a',points:[{x:0,y:0},{x:200,y:0}],bridge:false,condition:1,age:0},
    {id:'road-b',points:[{x:100,y:-100},{x:100,y:200}],bridge:false,condition:1,age:0},
    {id:'road-c',points:[{x:100,y:200},{x:200,y:200}],bridge:false,condition:1,age:0}
  );
  factory.dispatchTimer=100;

  const routed=routeOnRoadNetwork(s,factory,shop);
  assert.ok(routed);
  assert.ok(routed.points.some(p=>Math.abs(p.x-100)<1&&Math.abs(p.y)<1));
  assert.ok(routed.points.some(p=>Math.abs(p.x-100)<1&&Math.abs(p.y-200)<1));

  const firstJunctionIndex=routed.points.findIndex(p=>Math.abs(p.x-100)<1&&Math.abs(p.y)<1);
  assert.ok(firstJunctionIndex>0);
  const distanceToJunction=length(routed.points.slice(0,firstJunctionIndex+1));
  const routeFraction=distanceToJunction/length(routed.points);

  const t=truck({
    id:'intersection-truck',
    route:routed.points,
    routeKey:routed.points.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join('|'),
    t:Math.max(0,routeFraction-.001),
    speed:.085,
    value:25,
    cargo:1,
    source:factory,
    to:shop
  });
  s.trucks.push(t);

  updateEconomy(s,.1,()=>{});
  const p=pointOnRoute(routed.points,t.t);
  assert.ok(p.x>=99&&p.x<=101);
  assert.ok(p.y>0&&p.y<15);

  t.t=.999;
  updateEconomy(s,.1,()=>{});
  assert.equal(s.trucks.length,0);
  assert.ok(s.cash>500);
  assert.equal(s.orders,1);
});

test('disconnected buildings cannot be routed together',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},300,0,'shop-1');
  s.buildings.push(factory,shop);
  s.roads.push({id:'road-1',points:[{x:0,y:0},{x:80,y:0}],bridge:false,condition:1,age:0});
  assert.equal(routeOnRoadNetwork(s,factory,shop),null);
});

test('deleting a road under an active truck reroutes it without teleporting',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},200,0,'shop-1');
  s.buildings.push(factory,shop);
  const direct={id:'direct',points:[{x:0,y:0},{x:200,y:0}],bridge:false,condition:1,age:0};
  const upper={id:'upper-a',points:[{x:0,y:0},{x:0,y:100}],bridge:false,condition:1,age:0};
  const upper2={id:'upper-b',points:[{x:0,y:100},{x:200,y:100}],bridge:false,condition:1,age:0};
  const upper3={id:'upper-c',points:[{x:200,y:100},{x:200,y:0}],bridge:false,condition:1,age:0};
  s.roads.push(direct,upper,upper2,upper3);
  const routed=routeOnRoadNetwork(s,factory,shop);
  assert.ok(routed);
  const t=truck({id:'reroute-truck',route:routed.points,routeKey:'direct',t:.35,speed:.05,value:25,cargo:1,source:factory,to:shop});
  s.trucks.push(t);
  const before=pointOnRoute(t.route,t.t);
  assert.equal(eraseRoad(s,{x:100,y:0}),true);
  assert.equal(t.routeInvalidated,true);
  updateEconomy(s,.01,()=>{});
  assert.equal(t.routeInvalidated,false);
  const after=pointOnRoute(t.route,t.t);
  assert.ok(dist(before,after)<12);
  assert.ok(t.route.some(p=>Math.abs(p.y-100)<1));
  assert.equal(t.dead,undefined);
});

test('deleting a multi-segment road reroutes a truck through an intersecting alternate road',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},240,0,'shop-1');
  s.buildings.push(factory,shop);
  const main={id:'main-bend',points:[{x:0,y:0},{x:120,y:0},{x:240,y:0}],bridge:false,condition:1,age:0};
  const north={id:'north-a',points:[{x:0,y:0},{x:0,y:100}],bridge:false,condition:1,age:0};
  const north2={id:'north-b',points:[{x:0,y:100},{x:240,y:100}],bridge:false,condition:1,age:0};
  const north3={id:'north-c',points:[{x:240,y:100},{x:240,y:0}],bridge:false,condition:1,age:0};
  s.roads.push(main,north,north2,north3);
  const routed=routeOnRoadNetwork(s,factory,shop);
  assert.ok(routed);
  const t=truck({id:'multi-segment-reroute',route:routed.points,routeKey:'main-bend',t:.45,speed:.05,cargo:1,source:factory,to:shop});
  s.trucks.push(t);
  const before=pointOnRoute(t.route,t.t);
  assert.equal(eraseRoad(s,{x:120,y:0}),true);
  updateEconomy(s,.01,()=>{});
  const after=pointOnRoute(t.route,t.t);
  assert.ok(dist(before,after)<18);
  assert.ok(t.route.some(p=>Math.abs(p.y-100)<1));
  assert.equal(t.dead,undefined);
});

test('intersection reroute reconnects through the nearest surviving junction',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},300,0,'shop-1');
  s.buildings.push(factory,shop);
  s.roads.push(
    {id:'deleted',points:[{x:0,y:0},{x:300,y:0}],bridge:false,condition:1,age:0},
    {id:'surviving-approach',points:[{x:0,y:0},{x:150,y:0},{x:150,y:100}],bridge:false,condition:1,age:0},
    {id:'upper',points:[{x:150,y:100},{x:300,y:100},{x:300,y:0}],bridge:false,condition:1,age:0}
  );
  const routed=routeOnRoadNetwork(s,factory,shop);
  assert.ok(routed);
  const t=truck({id:'junction-reroute',route:routed.points,routeKey:'deleted',t:.5,speed:.05,cargo:1,source:factory,to:shop});
  s.trucks.push(t);
  assert.equal(eraseRoad(s,{x:150,y:0}),true);
  updateEconomy(s,.01,()=>{});
  assert.equal(t.routeInvalidated,false);
  assert.ok(t.route.some(p=>Math.abs(p.x-150)<1&&Math.abs(p.y-100)<1));
});

test('deleting a bridge under a truck safely returns its cargo',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,350,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},0,500,'shop-1');
  s.buildings.push(factory,shop);
  const bridge={id:'bridge-road',points:[{x:0,y:350},{x:0,y:500}],bridge:true,condition:1,age:0};
  s.roads.push(bridge);
  const routed=routeOnRoadNetwork(s,factory,shop);
  assert.ok(routed);
  factory.stock=0;
  const t=truck({id:'bridge-active',route:routed.points,routeKey:'bridge',t:.5,speed:.05,cargo:2,source:factory,to:shop});
  s.trucks.push(t);
  assert.equal(eraseRoad(s,{x:0,y:425}),true);
  assert.equal(t.routeInvalidated,true);
  updateEconomy(s,.01,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(factory.stock,2);
});

test('deleting a warehouse route returns cargo from an in-flight warehouse transfer',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const warehouse=makeBuilding({name:'Depot',kind:'warehouse',need:null,color:'#fff'},100,0,'warehouse-1');
  s.buildings.push(factory,warehouse);
  s.roads.push({id:'warehouse-road',points:[{x:0,y:0},{x:100,y:0}],bridge:false,condition:1,age:0});
  const routed=routeOnRoadNetwork(s,factory,warehouse);
  assert.ok(routed);
  factory.stock=1;
  const t=truck({id:'warehouse-active',route:routed.points,routeKey:'warehouse',t:.5,speed:.05,cargo:1,source:factory,to:warehouse,stage:'warehouse'});
  s.trucks.push(t);
  assert.equal(eraseRoad(s,{x:50,y:0}),true);
  updateEconomy(s,.01,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(factory.stock,2);
});

test('deleting the only road safely cancels an active delivery and returns cargo',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},100,0,'shop-1');
  s.buildings.push(factory,shop);
  s.roads.push({id:'only-road',points:[{x:0,y:0},{x:100,y:0}],bridge:false,condition:1,age:0});
  const routed=routeOnRoadNetwork(s,factory,shop);
  assert.ok(routed);
  const t=truck({id:'cancelled-truck',route:routed.points,routeKey:'only',t:.5,speed:.05,value:25,cargo:2,source:factory,to:shop,contractId:0});
  factory.stock=1;
  s.trucks.push(t);
  assert.equal(eraseRoad(s,{x:50,y:0}),true);
  updateEconomy(s,.01,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(factory.stock,3);
});

test('erasing a connecting road removes the route and prevents new dispatches',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},100,0,'shop-1');
  s.buildings.push(factory,shop);
  s.roads.push({id:'road-1',points:[{x:0,y:0},{x:100,y:0}],bridge:false,condition:1,age:0});
  assert.ok(routeOnRoadNetwork(s,factory,shop));
  assert.equal(eraseRoad(s,{x:50,y:0}),true);
  assert.equal(s.roads.length,0);
  assert.equal(routeOnRoadNetwork(s,factory,shop),null);
  factory.stock=4;
  shop.demand=4;
  updateEconomy(s,2,()=>{});
  assert.equal(s.trucks.length,0);
});

test('truck delivery completes across a river bridge route',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,350,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},0,500,'shop-1');
  s.buildings.push(factory,shop);

  const path=[{x:0,y:350},{x:0,y:500}];
  assert.equal(addRoad(s,path,{startBuilding:factory,endBuilding:shop}),true);
  assert.equal(s.roads.length,1);
  assert.equal(s.roads[0].bridge,true);

  const routed=routeOnRoadNetwork(s,factory,shop);
  assert.ok(routed);

  const t=truck({
    id:'bridge-truck',
    route:routed.points,
    routeKey:routed.points.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join('|'),
    t:.999,
    speed:.1,
    value:25,
    cargo:1,
    source:factory,
    to:shop
  });
  s.trucks.push(t);

  updateEconomy(s,.1,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(s.orders,1);
  assert.ok(s.cash>500);
});

test('roads crossing the river are marked as bridges and remain routable',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,350,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},0,500,'shop-1');
  s.buildings.push(factory,shop);
  const path=[{x:0,y:350},{x:0,y:500}];
  assert.equal(addRoad(s,path,{startBuilding:factory,endBuilding:shop}),true);
  assert.equal(s.roads.length,1);
  assert.equal(s.roads[0].bridge,true);
  const routed=routeOnRoadNetwork(s,factory,shop);
  assert.ok(routed);
  assert.ok(routed.distance>0);
});

test('road endpoint targeting uses tight building and road snap zones',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  s.buildings.push(factory);
  s.roads.push({id:'road-1',points:[{x:120,y:-80},{x:120,y:80}],bridge:false,condition:1,age:0});

  const building=roadTarget(s,{x:50,y:0});
  assert.equal(building.building,factory);

  const road=roadTarget(s,{x:120,y:30});
  assert.ok(road.road);

  const free=roadTarget(s,{x:400,y:401});
  assert.equal(free.gridSnapped,true);
  assert.equal(free.x%12,0);
  assert.equal(free.y%12,0);
});

test('road snapping stays stable at building edges and road intersections',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  s.buildings.push(factory);
  s.roads.push(
    {id:'road-a',points:[{x:120,y:-80},{x:120,y:80}],bridge:false,condition:1,age:0},
    {id:'road-b',points:[{x:40,y:0},{x:200,y:0}],bridge:false,condition:1,age:0}
  );

  const building=roadTarget(s,{x:42,y:0});
  assert.equal(building.building,factory);
  assert.ok(Number.isFinite(building.x)&&Number.isFinite(building.y));

  const intersection=roadTarget(s,{x:121,y:1});
  assert.ok(intersection.road);
  assert.ok(Math.abs(intersection.x-120)<2);
  assert.ok(Math.abs(intersection.y)<2);

  const preview=roadPreview(s,{x:121,y:1},{x:300,y:0});
  assert.equal(preview.start.road.id,'road-a');
  assert.ok(preview.path.length>=2);
  assert.equal(preview.blocked,false);
});

test('road targeting snaps cleanly to all four world edges',()=>{
  const s=freshState();
  const minX=WORLD_BOUNDS.minX+WORLD_MARGIN,maxX=WORLD_BOUNDS.maxX-WORLD_MARGIN;
  const minY=WORLD_BOUNDS.minY+WORLD_MARGIN,maxY=WORLD_BOUNDS.maxY-WORLD_MARGIN;
  const left=roadTarget(s,{x:WORLD_BOUNDS.minX+8,y:120});
  const right=roadTarget(s,{x:WORLD_BOUNDS.maxX-8,y:-120});
  const top=roadTarget(s,{x:320,y:WORLD_BOUNDS.minY+8});
  const bottom=roadTarget(s,{x:-320,y:WORLD_BOUNDS.maxY-8});
  assert.equal(left.edgeSnapped,true);
  assert.equal(right.edgeSnapped,true);
  assert.equal(top.edgeSnapped,true);
  assert.equal(bottom.edgeSnapped,true);
  assert.equal(left.x,minX);
  assert.equal(right.x,maxX);
  assert.equal(top.y,minY);
  assert.equal(bottom.y,maxY);
});

test('road endpoint dragging snaps to every world edge',()=>{
  const s=freshState();
  const road={id:'edge-road',points:[{x:-900,y:0},{x:-600,y:0}],bridge:false,condition:1,age:0};
  s.roads.push(road);
  const targets=[
    {p:{x:WORLD_BOUNDS.minX+6,y:0},expected:{x:WORLD_BOUNDS.minX+WORLD_MARGIN,y:0}},
    {p:{x:WORLD_BOUNDS.maxX-6,y:0},expected:{x:WORLD_BOUNDS.maxX-WORLD_MARGIN,y:0}},
    {p:{x:0,y:WORLD_BOUNDS.minY+6},expected:{x:0,y:WORLD_BOUNDS.minY+WORLD_MARGIN}},
    {p:{x:0,y:WORLD_BOUNDS.maxY-6},expected:{x:0,y:WORLD_BOUNDS.maxY-WORLD_MARGIN}}
  ];
  for(const {p,expected} of targets){
    const preview=roadEndpointPreview(s,road,0,p);
    assert.ok(preview);
    assert.equal(preview.edgeSnapped,true);
    assert.equal(preview.blocked,false);
    assert.ok(Math.abs(preview.target.x-expected.x)<1e-9);
    assert.ok(Math.abs(preview.target.y-expected.y)<1e-9);
  }
  const result=editRoadEndpoint(s,road.id,0,targets[0].p);
  assert.ok(result);
  assert.equal(result.point.x,WORLD_BOUNDS.minX+WORLD_MARGIN);
});

test('junctions remain routable when created close to the world edge',()=>{
  const s=freshState();
  s.roads.push(
    {id:'edge-horizontal',points:[{x:1180,y:0},{x:WORLD_BOUNDS.maxX-WORLD_MARGIN,y:0}],bridge:false,condition:1,age:0},
    {id:'edge-vertical',points:[{x:1240,y:-120},{x:1240,y:120}],bridge:false,condition:1,age:0}
  );
  const network=roadNetwork(s);
  const junction=network.nodes.find(p=>Math.abs(p.x-1240)<1e-9&&Math.abs(p.y)<1e-9);
  assert.ok(junction);
  assert.ok((network.adjacency.get(junction)||[]).length>=4);
  const snapped=roadTarget(s,{x:1241,y:1});
  assert.ok(snapped.road);
  assert.ok(Math.abs(snapped.x-1240)<2);
  assert.ok(Math.abs(snapped.y)<2);
});

test('canonical road topology identifies three-way and four-way junctions',()=>{
  const s=freshState();
  s.roads.push(
    {id:'north',points:[{x:0,y:-180},{x:0,y:0}],bridge:false,condition:1,age:0},
    {id:'south',points:[{x:0,y:0},{x:0,y:180}],bridge:false,condition:1,age:0},
    {id:'east',points:[{x:0,y:0},{x:180,y:0}],bridge:false,condition:1,age:0}
  );
  const three=roadTopology(s);
  assert.equal(three.threeWayJunctions.length,1);
  assert.equal(three.fourWayJunctions.length,0);
  assert.equal(three.topologyJunctions[0].degree,3);
  assert.equal(three.topologyJunctions[0].type,'junction');

  s.roads.push({id:'west',points:[{x:-180,y:0},{x:0,y:0}],bridge:false,condition:1,age:0});
  const four=roadTopology(s);
  assert.equal(four.threeWayJunctions.length,0);
  assert.equal(four.fourWayJunctions.length,1);
  assert.ok(four.fourWayJunctions[0].roadIds.includes('north'));
  assert.ok(four.fourWayJunctions[0].roadIds.includes('west'));
});

test('canonical topology preserves boundary nodes without misclassifying a two-road boundary turn as a junction',()=>{
  const s=freshState();
  const edgeX=WORLD_BOUNDS.maxX-WORLD_MARGIN;
  s.roads.push(
    {id:'edge-main',points:[{x:1000,y:0},{x:edgeX,y:0}],bridge:false,condition:1,age:0},
    {id:'edge-branch',points:[{x:edgeX,y:0},{x:edgeX,y:160}],bridge:false,condition:1,age:0}
  );
  const topology=roadTopology(s);
  assert.ok(topology.boundaryNodes.length>=1);
  assert.equal(topology.topologyJunctions.some(n=>n.type==='boundary-junction'),false);
  assert.ok(topology.boundaryNodes.some(n=>Math.abs(n.x-edgeX)<1e-9));
});

test('road editing deliberately rejects the removed split action',()=>{
  const s=freshState();
  const road={id:'no-split',points:[{x:-120,y:0},{x:120,y:0}],bridge:false,condition:1,age:0};
  s.roads.push(road);
  const before=JSON.stringify(s.roads);
  assert.equal(editRoadSegment(s,{x:0,y:0},'split'),false);
  assert.equal(JSON.stringify(s.roads),before);
});

test('road preview snaps to buildings, roads and the placement grid',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},240,0,'shop-1');
  s.buildings.push(factory,shop);
  s.roads.push({id:'road-1',points:[{x:120,y:-80},{x:120,y:80}],bridge:false,condition:1,age:0});

  const buildingPreview=roadPreview(s,{x:4,y:3},{x:236,y:-2});
  assert.equal(buildingPreview.start.building,factory);
  assert.equal(buildingPreview.end.building,shop);
  assert.equal(buildingPreview.snappedStart,true);
  assert.equal(buildingPreview.snappedEnd,true);
  assert.ok(Number.isFinite(buildingPreview.length));
  assert.ok(Number.isFinite(buildingPreview.cost));

  const roadPreviewResult=roadPreview(s,{x:118,y:12},{x:190,y:180});
  assert.ok(roadPreviewResult.start.road);
  assert.ok(Number.isFinite(roadPreviewResult.length));
  assert.ok(Number.isFinite(roadPreviewResult.cost));

  const gridPreview=roadPreview(s,{x:173,y:177},{x:350,y:355});
  assert.equal(gridPreview.start.gridSnapped,true);
  assert.equal(gridPreview.end.gridSnapped,true);
  assert.equal(gridPreview.start.x%12,0);
  assert.equal(gridPreview.start.y%12,0);
  assert.equal(gridPreview.end.x%12,0);
  assert.equal(gridPreview.end.y%12,0);
  assert.ok(Number.isFinite(gridPreview.cost));
});

test('clear road preview stays direct while blocked preview uses a clean 90 degree route',()=>{
  const s=freshState();
  const a=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const b=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},240,0,'shop-1');
  s.buildings.push(a,b);

  const clear=roadPreview(s,{x:60,y:0},{x:180,y:0});
  assert.equal(clear.path.length,2);
  assert.equal(clear.blocked,false);

  const obstacle=makeBuilding({name:'Warehouse',kind:'warehouse',need:null,color:'#fff'},120,0,'warehouse-1');
  s.buildings.push(obstacle);
  const blocked=roadPreview(s,{x:60,y:0},{x:180,y:0});
  assert.ok(blocked.path.length>=3);
  assert.equal(blocked.blocked,false);
  for(let i=2;i<blocked.path.length;i++){
    const a=blocked.path[i-2],b=blocked.path[i-1],c=blocked.path[i];
    const ab={x:b.x-a.x,y:b.y-a.y},bc={x:c.x-b.x,y:c.y-b.y};
    assert.equal(Math.abs(ab.x*bc.x+ab.y*bc.y),0);
  }
});



test('building road endpoints stay outside the rendered footprint and cannot route back through the building',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},220,0,'shop-1');
  const obstacle=makeBuilding({name:'Warehouse',kind:'warehouse',need:null,color:'#fff'},0,90,'warehouse-1');
  s.buildings.push(factory,shop,obstacle);

  const preview=roadPreview(s,factory,shop);
  assert.ok(preview);
  assert.equal(preview.blocked,false);
  assert.ok(Math.hypot(preview.start.x-factory.x,preview.start.y-factory.y)>39);
  assert.ok(Math.hypot(preview.end.x-shop.x,preview.end.y-shop.y)>35);
  assert.ok(preview.path.length>=2);
  assert.ok(preview.path.every((p,i)=>i===0||Math.hypot(p.x-preview.path[i-1].x,p.y-preview.path[i-1].y)>0));

  const reverseIntoBuilding=[{x:70,y:0},{x:0,y:0}];
  assert.equal(addRoad(s,reverseIntoBuilding,{startBuilding:factory}),'blocked');
});

test('road preview routes around multiple buildings without cutting through them',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},-220,0,'factory-route');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},220,0,'shop-route');
  const obstacleA=makeBuilding({name:'Steel',kind:'factory',need:null,color:'#fff'},-60,0,'obstacle-a');
  const obstacleB=makeBuilding({name:'Parts',kind:'factory',need:null,color:'#fff'},60,0,'obstacle-b');
  s.buildings.push(factory,shop,obstacleA,obstacleB);
  const preview=roadPreview(s,factory,shop);
  assert.ok(preview);
  assert.ok(preview.path.length>2);
  assert.equal(preview.blocked,false);
  assert.ok(preview.path.every((p,i)=>i===0||Math.abs(p.x-preview.path[i-1].x)<1e-9||Math.abs(p.y-preview.path[i-1].y)<1e-9));
  assert.equal(addRoad(s,preview.path,{startBuilding:factory,endBuilding:shop}),true);
});

test('road preview path is exactly the path committed by road construction',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},240,0,'shop-1');
  const obstacle=makeBuilding({name:'Warehouse',kind:'warehouse',need:null,color:'#fff'},120,0,'warehouse-1');
  s.buildings.push(factory,shop,obstacle);

  const preview=roadPreview(s,{x:4,y:0},{x:236,y:0});
  assert.ok(preview);
  assert.equal(preview.blocked,false);

  const result=addRoad(s,preview.path,{
    startBuilding:preview.start.building,
    endBuilding:preview.end.building
  });
  assert.equal(result,true);
  assert.deepEqual(s.roads[0].points,preview.path);
});

test('road construction rejects a duplicate road without charging twice',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},100,0,'shop-1');
  s.buildings.push(factory,shop);
  const before=s.cash;
  assert.equal(addRoad(s,[{x:0,y:0},{x:100,y:0}],{startBuilding:factory,endBuilding:shop}),true);
  const afterFirst=s.cash;
  assert.equal(addRoad(s,[{x:0,y:0},{x:100,y:0}],{startBuilding:factory,endBuilding:shop}),'duplicate');
  assert.equal(s.cash,afterFirst);
  assert.ok(afterFirst<before);
});

test('repeated road creation and removal leaves the road list bounded',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},180,0,'shop-1');
  s.buildings.push(factory,shop);
  for(let i=0;i<50;i++){
    assert.equal(addRoad(s,[{x:0,y:0},{x:180,y:0}],{startBuilding:factory,endBuilding:shop}),true);
    assert.equal(s.roads.length,1);
    assert.equal(eraseRoad(s,{x:90,y:0}),true);
    assert.equal(s.roads.length,0);
  }
  assert.equal(s.roads.length,0);
});


test('economy remains finite during a sustained multi-truck simulation',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},240,0,'shop-1');
  s.buildings.push(factory,shop);
  s.roads.push({id:'road-1',points:[{x:0,y:0},{x:240,y:0}],bridge:false,condition:1,age:0});
  factory.stock=4;
  for(let i=0;i<80;i++){
    s.trucks.push({
      id:'stress-'+i,
      route:[{x:0,y:0},{x:240,y:0}],
      routeKey:'stress-route',
      t:(i%20)/25,
      speed:.085,
      value:10,
      cargo:1,
      to:shop,
      source:factory,
      contractId:0,
      longDistance:false,
      wait:0,
      stage:'delivery'
    });
  }
  for(let i=0;i<120;i++)updateEconomy(s,.05,()=>{});
  assert.ok(Number.isFinite(s.cash));
  assert.ok(Number.isFinite(s.congestion));
  assert.ok(Number.isFinite(s.xp));
  assert.ok(s.trucks.every(t=>Number.isFinite(t.t)));
  assert.ok(s.trucks.length<=80);
});


test('road graph canonicalises duplicate discovered edges at a junction',()=>{
  const s=freshState();
  s.roads.push(
    {id:'west',points:[{x:-120,y:0},{x:0,y:0}],bridge:false,condition:1,age:0},
    {id:'east',points:[{x:0,y:0},{x:120,y:0}],bridge:false,condition:1,age:0},
    {id:'north',points:[{x:0,y:0},{x:0,y:120}],bridge:false,condition:1,age:0},
    {id:'south',points:[{x:0,y:-120},{x:0,y:0}],bridge:false,condition:1,age:0}
  );
  const network=roadNetwork(s);
  const junction=network.junctions.find(n=>Math.abs(n.x)<1e-9&&Math.abs(n.y)<1e-9);
  assert.ok(junction);
  assert.equal((network.adjacency.get(junction)||[]).length,4);
  assert.equal(network.junctions.filter(n=>Math.abs(n.x)<1e-9&&Math.abs(n.y)<1e-9).length,1);
});

test('stale traffic reservations expire on simulation time rather than browser time',()=>{
  const s=freshState();
  const source={type:'Food',level:1,loading:0,logistics:0,stock:0,max:10};
  const destination={contract:null};
  s.roads.push(
    {id:'west',points:[{x:-120,y:0},{x:0,y:0}],bridge:false,condition:1,age:0},
    {id:'east',points:[{x:0,y:0},{x:120,y:0}],bridge:false,condition:1,age:0},
    {id:'north',points:[{x:0,y:-120},{x:0,y:0}],bridge:false,condition:1,age:0},
    {id:'south',points:[{x:0,y:0},{x:0,y:120}],bridge:false,condition:1,age:0}
  );
  s.trafficClock=5;
  s.trafficReservations={'0,0':{truckId:'old',until:4}};
  s.trucks=[{
    id:'new',
    route:[{x:-100,y:0},{x:0,y:0},{x:100,y:0}],
    routeKey:'new',
    t:.45,
    speed:.1,
    value:0,
    cargo:1,
    source,
    to:destination,
    wait:0,
    stage:'delivery'
  }];
  updateEconomy(s,.1,()=>{});
  assert.ok(s.trucks[0].t>.45);
  assert.equal(s.trafficReservations['0,0']?.truckId,'new');
});


test('play-sequence regression: build, dispatch, delete road, reroute, save/load, and resume dispatch',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-seq');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},240,0,'shop-seq');
  factory.stock=4;
  s.buildings.push(factory,shop);

  const direct={id:'seq-direct',points:[{x:0,y:0},{x:240,y:0}],bridge:false,condition:1,age:0};
  const northA={id:'seq-north-a',points:[{x:0,y:0},{x:0,y:120}],bridge:false,condition:1,age:0};
  const northB={id:'seq-north-b',points:[{x:0,y:120},{x:240,y:120}],bridge:false,condition:1,age:0};
  const northC={id:'seq-north-c',points:[{x:240,y:120},{x:240,y:0}],bridge:false,condition:1,age:0};
  s.roads.push(direct,northA,northB,northC);

  updateEconomy(s,1.2,()=>{});
  assert.equal(s.trucks.length,1);
  const active=s.trucks[0];
  active.t=.35;
  const before=pointOnRoute(active.route,active.t);

  assert.equal(eraseRoad(s,{x:120,y:0}),true);
  assert.equal(active.routeInvalidated,true);
  updateEconomy(s,.01,()=>{});
  assert.equal(active.routeInvalidated,false);
  assert.equal(active.dead,undefined);
  const after=pointOnRoute(active.route,active.t);
  assert.ok(dist(before,after)<20);
  assert.ok(active.route.some(p=>Math.abs(p.y-120)<1));

  const snapshot=serialise(s);
  const loaded=hydrate(snapshot);
  assert.ok(loaded);
  assert.equal(loaded.roads.length,3);
  assert.equal(loaded.roads.some(r=>r.id==='seq-direct'),false);
  assert.deepEqual(loaded.trucks,[]);
  assert.equal(loaded.buildings.find(b=>b.id==='factory-seq').stock,factory.stock);

  const loadedFactory=loaded.buildings.find(b=>b.id==='factory-seq');
  const loadedShop=loaded.buildings.find(b=>b.id==='shop-seq');
  loadedFactory.stock+=3;
  loadedShop.demand=3;
  updateEconomy(loaded,1.2,()=>{});
  assert.equal(loaded.trucks.length,1);
  assert.ok(loaded.trucks[0].route.length>=2);
  assert.ok(loaded.trucks[0].route.some(p=>Math.abs(p.y-120)<1));
});
