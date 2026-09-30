import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.innerWidth=1280;
globalThis.innerHeight=720;

const {freshState,makeBuilding,hydrate,serialise}=await import('../src/state.js');
const {pointOnRoute,length,addRoad,eraseRoad,routeOnRoadNetwork,roadPreview,roadTarget}=await import('../src/world.js');
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


test('disconnected buildings cannot be routed together',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},300,0,'shop-1');
  s.buildings.push(factory,shop);
  s.roads.push({id:'road-1',points:[{x:0,y:0},{x:80,y:0}],bridge:false,condition:1,age:0});
  assert.equal(routeOnRoadNetwork(s,factory,shop),null);
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
