import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.innerWidth=1280;
globalThis.innerHeight=720;

const {freshState,makeBuilding,hydrate,serialise}=await import('../src/state.js');
const {pointOnRoute,length,dist,addRoad,eraseRoad,routeOnRoadNetwork,roadPreview,roadTarget}=await import('../src/world.js');
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
  assert.equal(s.trucks[0].source.id,'factory-1');
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

  const clear=roadPreview(s,{x:4,y:0},{x:236,y:0});
  assert.equal(clear.path.length,2);
  assert.equal(clear.blocked,false);

  const obstacle=makeBuilding({name:'Warehouse',kind:'warehouse',need:null,color:'#fff'},120,0,'warehouse-1');
  s.buildings.push(obstacle);
  const blocked=roadPreview(s,{x:4,y:0},{x:236,y:0});
  assert.ok(blocked.path.length>=3);
  assert.equal(blocked.blocked,false);
  for(let i=2;i<blocked.path.length;i++){
    const a=blocked.path[i-2],b=blocked.path[i-1],c=blocked.path[i];
    const ab={x:b.x-a.x,y:b.y-a.y},bc={x:c.x-b.x,y:c.y-b.y};
    assert.equal(ab.x*bc.x+ab.y*bc.y,0);
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
  assert.ok(preview.path.every((p,i)=>i===0||Math.abs(p.x-preview.path[i-1].x)<1e-9||Math.abs(p.y-preview.path[i-1].y)<1e-9));

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
