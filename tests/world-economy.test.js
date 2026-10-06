import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.innerWidth = 390;
globalThis.innerHeight = 844;

const {freshState, makeBuilding, TYPES} = await import('../dist/state.js');
const {
  addRoad,
  eraseRoad,
  editRoadSegment,
  roadSegmentAtPoint,
  roadEndpointAtPoint,
  roadEndpointPreview,
  editRoadEndpoint,
  roadAttachment,
  routeOnRoadNetwork,
  buildingLogisticsAccess,
  roadNetwork,
  cleanupRoadNetwork,
  roadPreview,
  buildingPhysicalPlacementReason,
  seed,
  FACTORY_MIN_DISTANCE,
  FACTORY_MIN_SPAWN_RADIUS,
  factorySpawnCandidates,
  validateBuildingLayout,
  layoutIsValid
} = await import('../dist/world.js');
const {route, updateEconomy} = await import('../dist/economy.js');
const buildingModule = await import('../dist/world/buildings/index.js');
const {hydrate} = await import('../dist/persistence/load.js');
const {serialise} = await import('../dist/persistence/save.js');
const {roadPathIntersectsBuildingFootprint,roadPathBlocked} = await import('../dist/world/roads/placement.js');
const {routeNetworkValid} = await import('../dist/world/roads/routing.js');

function road(points) {
  return {id: crypto.randomUUID(), points, age:0, bridge:false, condition:1};
}

function baseState() {
  const s = freshState();
  s.cash = 10000;
  s.roads = [];
  s.buildings = [];
  return s;
}


test('new game seeds the fixed starter buildings once and without districts',()=>{
  const s=baseState();
  seed(s);

  assert.deepEqual(
    s.buildings.map(b=>b.type).sort(),
    ['Builder','Food','Garage','Market','Parts','Steel']
  );
  assert.equal(s.buildings.length,6);
  assert.ok(s.buildings.every(b=>!Object.prototype.hasOwnProperty.call(b,'district')));
  assert.ok(s.buildings.every(b=>!('district' in b)));
  assert.equal(typeof buildingModule.spawn,'undefined');
  assert.equal(makeBuilding(TYPES.find(t=>t.name==='Food'),0,0,'district-free').district,undefined);
  assert.ok(layoutIsValid(s.buildings));
});

test('starter factories occupy separate sectors and shops stay close to their paired factories',()=>{
  const s=baseState();
  seed(s);

  const factories=s.buildings.filter(b=>b.kind==='factory');
  const shops=s.buildings.filter(b=>b.kind==='shop');
  assert.equal(factories.length,3);
  assert.equal(shops.length,3);

  for(let i=0;i<factories.length;i++){
    const factory=factories[i];
    for(let j=i+1;j<factories.length;j++){
      const other=factories[j];
      const separation=Math.hypot(factory.x-other.x,factory.y-other.y);
      assert.ok(separation>=FACTORY_MIN_DISTANCE);
    }
    assert.ok(Math.hypot(factory.x,factory.y)>=FACTORY_MIN_SPAWN_RADIUS);
  }
  for(const shop of shops){
    const nearestFactory=Math.min(...factories.map(factory=>Math.hypot(factory.x-shop.x,factory.y-shop.y)));
    assert.ok(nearestFactory>=250&&nearestFactory<=650, 'starter shop should sit near a factory');
  }
});

test('normal simulation does not create buildings after the new-game seed',()=>{
  const s=baseState();
  seed(s);
  const initialIds=s.buildings.map(b=>b.id);
  for(let i=0;i<120;i++)updateEconomy(s,.2,()=>{});

  assert.equal(s.buildings.length,6);
  assert.deepEqual(s.buildings.map(b=>b.id),initialIds);
});

test('building facade exposes refactored operations without routing through world.js',()=>{
  assert.equal(typeof buildingModule.buildingCost,'function');
  assert.equal(typeof buildingModule.canPlaceBuildingAt,'function');
  assert.equal(typeof buildingModule.buildingPlacementTarget,'function');
  assert.equal(typeof buildingModule.placeBuilding,'function');
  assert.equal(typeof buildingModule.buildingLogisticsAccess,'function');
});
function pointOnRouteForTest(points,t){const total=points.reduce((n,p,i)=>i?n+Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y):0,0);let target=total*t,run=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],seg=Math.hypot(b.x-a.x,b.y-a.y);if(target<=run+seg){const u=seg?Math.max(0,Math.min(1,(target-run)/seg)):0;return{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u}}run+=seg}return points.at(-1)}
function building(typeName, x, y) {
  const type = TYPES.find(t => t.name === typeName);
  // Keep fixture roads on the exterior gate side of each building type.
  const yOffset = type?.kind === 'shop' ? 99 : -108;
  return makeBuilding(type, x, y + yOffset, crypto.randomUUID());
}

test('factories keep a full visual footprint clearance from each other',()=>{
  const s=baseState();
  const type=TYPES.find(t=>t.name==='Steel');
  s.buildings.push(makeBuilding(type,0,0,'existing'));
  assert.equal(buildingPhysicalPlacementReason(s,type,260,0),null);
  assert.equal(buildingPhysicalPlacementReason(s,type,249,0),'Too close to another factory');
});

test('different layout seeds produce materially different starter positions',()=>{
  const first=factorySpawnCandidates(1,0);
  const second=factorySpawnCandidates(2,0);
  const displacement=first.reduce((total,point,index)=>total+Math.hypot(point.x-second[index].x,point.y-second[index].y),0);
  assert.ok(displacement>500,'different new-game seeds should not collapse to nearly the same starter layout');
});

test('initial factory seeding produces separated factories',()=>{
  const s=baseState();
  seed(s);
  const factories=s.buildings.filter(b=>b.kind==='factory');
  assert.equal(factories.length,3);
  assert.equal(validateBuildingLayout(s.buildings).length,0,JSON.stringify(validateBuildingLayout(s.buildings)));
  assert.equal(layoutIsValid(s.buildings),true);
  for(let i=0;i<factories.length;i++)for(let j=i+1;j<factories.length;j++){
    assert.ok(Math.hypot(factories[i].x-factories[j].x,factories[i].y-factories[j].y)>=FACTORY_MIN_DISTANCE);
  }
  for(const factory of factories){
    assert.ok(Math.hypot(factory.x,factory.y)>=FACTORY_MIN_SPAWN_RADIUS);
  }
});


test('intelligent seeding keeps every starter building inside the physical layout constraints',()=>{
  for(const seedValue of [1,7,42,99,123456]){
    const s=baseState();
    s.gameSeed=seedValue;
    s.layoutSeed=seedValue;
    seed(s);
    assert.equal(s.buildings.length,6);
    assert.equal(validateBuildingLayout(s.buildings).length,0,JSON.stringify(validateBuildingLayout(s.buildings)));
    assert.deepEqual(s.buildings.map(b=>b.kind),[
      'factory','factory','factory','shop','shop','shop'
    ]);
    assert.ok(s.buildings.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y)));
  }
});

test('new-game seeding remains valid when the road network already exists',()=>{
  const s=baseState();
  s.gameSeed=77;
  s.layoutSeed=77;
  s.roads.push(road([{x:760,y:-20},{x:1180,y:-20}]));
  seed(s);
  assert.equal(s.buildings.length,6);
  assert.equal(validateBuildingLayout(s.buildings).length,0);
  assert.ok(s.buildings.every(building=>buildingPhysicalPlacementReason(
    {...s,buildings:s.buildings.filter(other=>other!==building)},
    TYPES.find(type=>type.name===building.type),
    building.x,
    building.y
  )===null));
});

test('new-game seeding never bypasses river or world bounds',()=>{
  for(const seedValue of [19,29,59]){
    const s=baseState();
    s.gameSeed=seedValue;
    s.layoutSeed=seedValue;
    seed(s);
    assert.equal(validateBuildingLayout(s.buildings).length,0);
    assert.ok(s.buildings.every(building=>Math.abs(building.x)<=2048&&Math.abs(building.y)<=2048));
  }
});

test('global layout validator reports duplicate ids, bounds, river and factory spacing conflicts',()=>{
  const type=TYPES.find(t=>t.name==='Steel');
  const a=makeBuilding(type,0,0,'same');
  const b=makeBuilding(type,100,0,'same');
  const issues=validateBuildingLayout([a,b]);
  assert.ok(issues.some(issue=>issue.type==='factory-spacing'));
  assert.ok(issues.some(issue=>issue.type==='duplicate-id'));
  assert.equal(issues.length>0,true);
});

test('loading a severely clustered factory save relocates factories to separated layout positions',()=>{
  const type=TYPES.find(t=>t.name==='Steel');
  const buildings=[
    makeBuilding(type,0,0,'factory-a'),
    makeBuilding(type,10,10,'factory-b'),
    makeBuilding(type,20,20,'factory-c')
  ];
  const s=hydrate({version:6,gameSeed:7,layoutSeed:11,buildings,roads:[],cash:1000});
  assert.ok(s);
  assert.equal(s.buildings.length,3);
  assert.equal(layoutIsValid(s.buildings),true,JSON.stringify(validateBuildingLayout(s.buildings)));
  const factories=s.buildings;
  for(let i=0;i<factories.length;i++)for(let j=i+1;j<factories.length;j++){
    assert.ok(Math.hypot(factories[i].x-factories[j].x,factories[i].y-factories[j].y)>=FACTORY_MIN_DISTANCE);
  }
});

test('save/load does not persist stale truck or building logistics route references',()=>{
  const s=baseState();
  const f=building('Food',0,0);
  const shop=building('Market',360,0);
  s.buildings.push(f,shop);
  const factoryGate=buildingModule.buildingRoadEntrance(f);
  const shopGate=buildingModule.buildingRoadEntrance(shop);
  assert.ok(factoryGate&&shopGate);
  s.roads.push(
    road([{x:factoryGate.x,y:factoryGate.y},{x:180,y:factoryGate.y}]),
    road([{x:180,y:factoryGate.y},{x:180,y:shopGate.y}]),
    road([{x:180,y:shopGate.y},{x:shopGate.x,y:shopGate.y}])
  );
  const r=route(s,f,shop);
  assert.ok(r);
  s.trucks.push({
    id:'persisted-route-should-not-survive',
    route:r.points,
    laneIds:r.laneIds,
    laneRoadIds:r.laneRoadIds,
    source:f,
    to:shop,
    t:.5
  });

  const saved=serialise(s);
  assert.deepEqual(saved.trucks,[]);
  assert.equal(Object.hasOwn(saved.buildings[0],'route'),false);
  assert.equal(Object.hasOwn(saved.buildings[0],'road'),false);
  assert.equal(Object.hasOwn(saved.buildings[0],'laneIds'),false);
  assert.equal(Object.hasOwn(saved.buildings[0],'laneRoadIds'),false);

  const loaded=hydrate(saved);
  assert.ok(loaded);
  assert.deepEqual(loaded.trucks,[]);
  assert.equal(route(loaded,loaded.buildings[0],loaded.buildings[1])?.roadNetworkRevision,loaded.roadNetworkRevision);
});

test('loading an old save repairs factory overlaps using current visual clearance',()=>{
  const type=TYPES.find(t=>t.name==='Steel');
  const a=makeBuilding(type,0,0,'a');
  const b=makeBuilding(type,130,0,'b');
  const data={version:6,buildings:[a,b],roads:[],cash:1000};
  const s=hydrate(data);
  assert.ok(s);
  assert.equal(s.buildings.length,2);
  const af=s.buildings[0],bf=s.buildings[1];
  const separated=Math.abs(af.x-bf.x)>=150||Math.abs(af.y-bf.y)>=134;
  assert.equal(separated,true,JSON.stringify({af,bf}));
});

test('building placement uses the same factory clearance as save repair',()=>{
  const s=baseState();
  const type=TYPES.find(t=>t.name==='Steel');
  s.buildings.push(makeBuilding(type,0,0,'existing'));
  assert.equal(buildingPhysicalPlacementReason(s,type,260,0),null);
  assert.equal(buildingPhysicalPlacementReason(s,type,249,0),'Too close to another factory');
});

test('road routing avoids a warehouse physical footprint',()=>{
  const s=baseState();
  const warehouse=building('Warehouse',100,100);
  s.buildings.push(warehouse);
  const preview=roadPreview(s,{x:0,y:100},{x:200,y:100});
  assert.ok(preview);
  assert.equal(preview.blocked,false);
  assert.equal(roadPathBlocked(s,preview.path,{}),false);
  assert.equal(roadPathIntersectsBuildingFootprint(s,preview.path,{}),false);
});

test('building attaches to the nearest physical road segment', () => {
  const s = baseState();
  const f = building('Food', 0, 0);
  s.buildings.push(f);
  s.roads.push(road([{x:35,y:0},{x:150,y:0}]));

  const a = roadAttachment(s, f);
  assert.ok(a);
  assert.equal(a.road, s.roads[0]);
  assert.ok(Math.abs(a.point.x - 0) < 1e-9);
  assert.ok(Math.abs(a.point.y) < 1e-9);
});

test('factory to shop route follows the saved road geometry', () => {
  const s = baseState();
  const f = building('Food', 0, 0);
  const shop = building('Market', 220, 0);
  s.buildings.push(f, shop);
  s.roads.push(road([{x:35,y:0},{x:185,y:0}]));

  const r = route(s, f, shop);
  assert.ok(r);
  assert.ok(r.distance > 0);
  assert.deepEqual(r.start, {x:35,y:0});
  assert.deepEqual(r.end, {x:185,y:0});
  assert.ok(r.points.some(p=>Math.abs(p.x)<1e-9&&Math.abs(p.y)<1e-9));
  assert.ok(r.points.some(p=>Math.abs(p.x-35)<1e-9&&Math.abs(p.y)<1e-9));
  assert.ok(r.points.some(p=>Math.abs(p.x-185)<1e-9&&Math.abs(p.y)<1e-9));
});

test('crossing roads create a real intersection and permit routing across it', () => {
  const s = baseState();
  const f = building('Food', -120, 0);
  const shop = building('Market', 0, 120);
  s.buildings.push(f, shop);
  s.roads.push(
    road([{x:-85,y:0},{x:85,y:0}]),
    road([{x:0,y:85},{x:0,y:-85}])
  );

  const network = roadNetwork(s);
  assert.ok(network.nodes.some(n => Math.abs(n.x) < 1e-9 && Math.abs(n.y) < 1e-9));

  const r = route(s, f, shop);
  assert.ok(r);
  assert.ok(r.points.some(p => Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9));
});

test('road endpoints may connect through an intersection without off-road routing', () => {
  const s = baseState();
  const f = building('Food', -120, 0);
  const shop = building('Market', 120, 0);
  s.buildings.push(f, shop);
  s.roads.push(
    road([{x:-85,y:0},{x:0,y:0}]),
    road([{x:0,y:0},{x:85,y:0}])
  );
  const r = routeOnRoadNetwork(s, f, shop);
  assert.ok(r);
  assert.ok(r.distance >= 170);
});

test('truck dispatch and delivery complete on a connected road', () => {
  const s = baseState();
  const f = building('Food', 0, 0);
  const shop = building('Market', 220, 0);
  f.stock = 3;
  f.dispatchTimer = 0;
  shop.demand = 3;
  s.buildings.push(f, shop);
  const factoryGate = buildingModule.buildingRoadEntrance(f);
  const shopGate = buildingModule.buildingRoadEntrance(shop);
  assert.ok(factoryGate&&shopGate);
  s.roads.push(
    road([{x:factoryGate.x,y:factoryGate.y},{x:180,y:factoryGate.y}]),
    road([{x:180,y:factoryGate.y},{x:180,y:shopGate.y}]),
    road([{x:180,y:shopGate.y},{x:shopGate.x,y:shopGate.y}])
  );

  const before = s.cash;
  updateEconomy(s, .2, () => {});
  assert.equal(s.trucks.length, 0);
  for(let i=0;i<300;i++) updateEconomy(s, .2, () => {});
  assert.ok(s.orders >= 1);
  assert.ok(s.cash > before);
  assert.ok(shop.served >= 1);
});

test('deleting a road invalidates the route', () => {
  const s = baseState();
  const f = building('Food', 0, 0);
  const shop = building('Market', 220, 0);
  s.buildings.push(f, shop);
  s.roads.push(road([{x:35,y:0},{x:185,y:0}]));

  assert.ok(route(s, f, shop));
  assert.equal(eraseRoad(s, {x:100,y:0}), true);
  assert.equal(route(s, f, shop), null);
});

test('route rejects a building object that is no longer live in world state', () => {
  const s = baseState();
  const f = building('Food', 0, 0);
  const shop = building('Market', 220, 0);
  s.buildings.push(f, shop);
  s.roads.push(road([{x:35,y:0},{x:185,y:0}]));

  assert.ok(route(s, f, shop));
  s.buildings.splice(s.buildings.indexOf(f), 1);
  assert.equal(route(s, f, shop), null);
});

test('economy retires trucks whose source or destination building was removed', () => {
  const s = baseState();
  const f = building('Food', 0, 0);
  const shop = building('Market', 220, 0);
  s.buildings.push(f, shop);
  s.roads.push(road([{x:35,y:0},{x:185,y:0}]));
  const r = route(s, f, shop);
  assert.ok(r);

  s.trucks.push({
    id:'removed-building-truck',
    route:r.points,
    centerlineRoute:r.points,
    laneRoute:r.lanePoints||r.points,
    laneIds:r.laneIds,
    laneRoadIds:r.laneRoadIds,
    t:.2,
    speed:.05,
    cargo:2,
    cargoType:'Food',
    source:f,
    to:shop,
    stage:'delivery',
    value:20,
    routeNetworkRevision:s.roadNetworkRevision,
    wait:0
  });

  s.buildings.splice(s.buildings.indexOf(shop), 1);
  updateEconomy(s,.1,()=>{});
  assert.equal(s.trucks.length,0);
});

test('insufficient cash rejects a road before mutating the network', () => {
  const s = baseState();
  s.cash = 1;
  const before = s.roads.length;
  const result = addRoad(s, [{x:0,y:0},{x:1000,y:0}]);
  assert.equal(result, 'cash');
  assert.equal(s.roads.length, before);
  assert.equal(s.cash, 1);
});

test('duplicate roads are rejected without charging twice', () => {
  const s = baseState();
  const first = addRoad(s, [{x:0,y:0},{x:180,y:0}]);
  assert.equal(first, true);
  const cashAfterFirst = s.cash;
  const second = addRoad(s, [{x:0,y:0},{x:180,y:0}]);
  assert.equal(second, 'duplicate');
  assert.equal(s.roads.length, 1);
  assert.equal(s.cash, cashAfterFirst);
});

test('placing a road into the middle of an existing road creates a real junction without splitting pavement', () => {
  const s = baseState();
  s.roads.push(road([{x:0,y:0},{x:200,y:0}]));
  const beforeCash = s.cash;
  assert.equal(addRoad(s, [{x:100,y:0},{x:100,y:120}]), true);
  assert.equal(s.roads.length, 2);
  assert.ok(s.roads.some(r => r.points.some(p => Math.abs(p.x-100)<1e-9 && Math.abs(p.y)<1e-9)));
  assert.ok(s.roads.some(r => r.points.some(p => Math.abs(p.x-100)<1e-9 && Math.abs(p.y-120)<1e-9)));
  const network = roadNetwork(s);
  assert.ok(network.junctions.some(n => Math.abs(n.x-100)<1e-9 && Math.abs(n.y)<1e-9));
  assert.ok(s.cash < beforeCash);
});

test('a newly connected road is routable through its snapped junction', () => {
  const s = baseState();
  const f = building('Food', -40, 0);
  const shop = building('Market', 100, 120);
  s.buildings.push(f, shop);
  s.roads.push(road([{x:-5,y:0},{x:200,y:0}]));
  assert.equal(addRoad(s, [{x:100,y:0},{x:100,y:120}]), true);
  const r = routeOnRoadNetwork(s, f, shop);
  assert.ok(r);
  assert.ok(r.points.some(p => Math.abs(p.x-100)<1e-9 && Math.abs(p.y)<1e-9));
});

test('tiny disconnected road fragments are rejected without mutation', () => {
  const s = baseState();
  const beforeCash = s.cash;
  assert.equal(addRoad(s, [{x:0,y:0},{x:5,y:0}]), 'too-short');
  assert.equal(s.roads.length, 0);
  assert.equal(s.cash, beforeCash);
});


test('near-road endpoints snap exactly to the existing segment and split it', () => {
  const s = baseState();
  s.roads.push(road([{x:0,y:0},{x:200,y:0}]));
  assert.equal(addRoad(s, [{x:100,y:4},{x:100,y:120}]), true);
  assert.ok(s.roads.some(r => r.points.some(p => Math.abs(p.x-100)<1e-9 && Math.abs(p.y)<1e-9)));
  const placed = s.roads.find(r => r.points.some(p => Math.abs(p.y-120)<1e-9));
  assert.ok(placed);
  assert.ok(placed.points.some(p => Math.abs(p.x-100)<1e-9 && Math.abs(p.y)<1e-9));
});

test('partially overlapping roads are rejected without creating duplicate pavement', () => {
  const s = baseState();
  assert.equal(addRoad(s, [{x:0,y:0},{x:200,y:0}]), true);
  const beforeCash = s.cash;
  assert.equal(addRoad(s, [{x:50,y:0},{x:250,y:0}]), 'duplicate');
  assert.equal(s.roads.length, 1);
  assert.equal(s.cash, beforeCash);
});

test('three-way road junction is one shared routing node', () => {
  const s = baseState();
  s.roads.push(
    road([{x:-120,y:0},{x:0,y:0}]),
    road([{x:0,y:0},{x:120,y:0}]),
    road([{x:0,y:0},{x:0,y:120}])
  );
  const network = roadNetwork(s);
  const junctions = network.junctions.filter(n => Math.abs(n.x)<1e-9 && Math.abs(n.y)<1e-9);
  assert.equal(junctions.length, 1);
  assert.ok((network.adjacency.get(junctions[0])||[]).length >= 3);
});

test('four-way road junction is one shared routing node for every branch', () => {
  const s = baseState();
  s.roads.push(
    road([{x:-120,y:0},{x:0,y:0}]),
    road([{x:0,y:0},{x:120,y:0}]),
    road([{x:0,y:-120},{x:0,y:0}]),
    road([{x:0,y:0},{x:0,y:120}])
  );
  const network = roadNetwork(s);
  const junctions = network.junctions.filter(n => Math.abs(n.x)<1e-9 && Math.abs(n.y)<1e-9);
  assert.equal(junctions.length, 1);
  assert.equal((network.adjacency.get(junctions[0])||[]).length, 4);
});

test('deleting one junction branch preserves the remaining road graph', () => {
  const s = baseState();
  const west = road([{x:-120,y:0},{x:0,y:0}]);
  const east = road([{x:0,y:0},{x:120,y:0}]);
  const north = road([{x:0,y:0},{x:0,y:120}]);
  s.roads.push(west,east,north);

  assert.equal(eraseRoad(s, {x:0,y:80}), true);
  assert.equal(s.roads.length, 2);

  const network = roadNetwork(s);
  assert.equal(network.junctions.filter(n => Math.abs(n.x)<1e-9 && Math.abs(n.y)<1e-9).length, 0);

  const f = building('Food', -120, 0);
  const shop = building('Market', 120, 0);
  s.buildings.push(f,shop);
  assert.ok(routeOnRoadNetwork(s,f,shop));
});

test('traffic dispatch validation rejects routes with stale or missing road references',()=>{
  const s=baseState();
  const f=building('Food',-160,0),shop=building('Market',160,0);
  s.buildings.push(f,shop);
  const r=road([{x:-125,y:0},{x:125,y:0}]);
  s.roads.push(r);
  const route=routeOnRoadNetwork(s,f,shop);
  assert.ok(route);
  assert.equal(routeNetworkValid(s,route),true);

  const missingRoad={...route,laneRoadIds:route.laneRoadIds.map(()=> 'deleted-road')};
  assert.equal(routeNetworkValid(s,missingRoad),false);

  const stale={...route,roadNetworkRevision:s.roadNetworkRevision-1};
  assert.equal(routeNetworkValid(s,stale),false);
});

test('live reroute keeps the truck at its physical position instead of teleporting to route start',()=>{
  const s=baseState();
  const f=building('Food',-300,200),shop=building('Market',300,200);
  s.buildings.push(f,shop);
  const main=road([{x:-255,y:200},{x:0,y:200},{x:255,y:200}]);
  const upper=road([{x:-255,y:200},{x:-255,y:280},{x:255,y:280},{x:255,y:200}]);
  s.roads.push(main,upper);
  const routed=routeOnRoadNetwork(s,f,shop);
  assert.ok(routed);
  const truck={id:'reroute-position',route:routed.points,centerlineRoute:routed.points,laneRoute:routed.lanePoints||routed.points,laneIds:routed.laneIds,t:.5,speed:.05,cargo:1,source:f,to:shop,stage:'delivery',value:10,routeNetworkRevision:s.roadNetworkRevision,wait:0};
  s.trucks.push(truck);
  const physical=pointOnRouteForTest(truck.route,truck.t);
  assert.ok(editRoadEndpoint(s,main.id,1,{x:0,y:245}),JSON.stringify(roadEndpointPreview(s,main,1,{x:0,y:245})));
  updateEconomy(s,0,()=>{});
  assert.equal(truck.routeNetworkRevision,s.roadNetworkRevision);
  assert.ok(truck.route.length>=2);
  assert.ok(Math.hypot(truck.route[0].x-physical.x,truck.route[0].y-physical.y)<1);
  assert.ok(Math.hypot(truck.laneRoute[0].x-physical.x,truck.laneRoute[0].y-physical.y)<1);
});

test('disconnected reroute returns cargo instead of leaving a stale truck alive',()=>{
  const s=baseState();
  const f=building('Food',0,0),shop=building('Market',220,0);
  s.buildings.push(f,shop);
  const r=road([{x:35,y:0},{x:185,y:0}]);
  s.roads.push(r);
  const routed=routeOnRoadNetwork(s,f,shop);
  assert.ok(routed);
  const truck={id:'stale-truck',route:routed.points,centerlineRoute:routed.points,laneRoute:routed.lanePoints||routed.points,laneIds:routed.laneIds,t:.3,speed:.05,cargo:2,source:f,to:shop,stage:'delivery',value:20,routeNetworkRevision:s.roadNetworkRevision,wait:0};
  s.trucks.push(truck);
  assert.equal(eraseRoad(s,{x:100,y:0}),true);
  updateEconomy(s,0,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(f.stock,2);
});

test('building logistics access recomputes after its attached road is deleted', () => {
  const s = baseState();
  const factory = building('Food', 0, 0);
  s.buildings.push(factory);
  const attached = road([{x:45,y:0},{x:140,y:0}]);
  s.roads.push(attached);
  const before = buildingLogisticsAccess(s, factory);
  assert.ok(before);
  assert.equal(before.road.id, attached.id);

  assert.equal(eraseRoad(s, {x:90,y:0}), true);

  const after = buildingLogisticsAccess(s, factory);
  assert.equal(after, null);
});

test('building logistics access never returns a removed building or deleted road attachment', () => {
  const s = baseState();
  const buildings = [
    building('Food', 0, 0),
    building('Warehouse', 0, 120),
    building('Market', 0, 240)
  ];
  const roads = [
    road([{x:35,y:0},{x:140,y:0}]),
    road([{x:35,y:120},{x:140,y:120}]),
    road([{x:35,y:240},{x:140,y:240}])
  ];
  s.buildings.push(...buildings);
  s.roads.push(...roads);

  for (const building of buildings) {
    const access = buildingLogisticsAccess(s, building);
    assert.ok(access);
    assert.equal(access.road, roads[buildings.indexOf(building)]);
    assert.equal(access.roadNetworkRevision, s.roadNetworkRevision);
  }

  const removedBuilding = buildings[0];
  s.buildings.splice(s.buildings.indexOf(removedBuilding), 1);
  assert.equal(buildingLogisticsAccess(s, removedBuilding), null);

  assert.equal(eraseRoad(s, {x:90,y:120}), true);
  assert.equal(buildingLogisticsAccess(s, buildings[1]), null);
  assert.equal(eraseRoad(s, {x:90,y:240}), true);

  const replacement = road([{x:35,y:240},{x:140,y:240}]);
  s.roads.push(replacement);
  const refreshed = buildingLogisticsAccess(s, buildings[2]);
  assert.ok(refreshed);
  assert.equal(refreshed.road, replacement);
  assert.equal(refreshed.roadNetworkRevision, s.roadNetworkRevision);
});

test('building logistics access refreshes after an attached road endpoint edit', () => {
  const s = baseState();
  const factory = building('Food', 0, 0);
  s.buildings.push(factory);
  const attached = road([{x:35,y:0},{x:140,y:0}]);
  s.roads.push(attached);

  const before = buildingLogisticsAccess(s, factory);
  assert.ok(before);
  assert.equal(before.road, attached);
  const revision = s.roadNetworkRevision;

  assert.ok(editRoadEndpoint(s, attached.id, 0, {x:35,y:80}));

  const after = buildingLogisticsAccess(s, factory);
  assert.equal(after, null);
  assert.ok(s.roadNetworkRevision>revision);
});

test('rerouted trucks replace lane road references after a road mutation', () => {
  const s = baseState();
  const factory = building('Food', -160, 0);
  const shop = building('Market', 160, 0);
  s.buildings.push(factory, shop);

  const direct = road([{x:-125,y:0},{x:125,y:0}]);
  const detour = road([{x:-125,y:0},{x:-125,y:90},{x:125,y:90},{x:125,y:0}]);
  s.roads.push(direct, detour);

  const initial = routeOnRoadNetwork(s, factory, shop);
  assert.ok(initial);
  assert.ok(initial.laneIds.length);
  assert.equal(initial.laneIds.length, initial.laneRoadIds.length);

  const truck = {
    id:'lane-reference-truck',
    route:initial.points,
    centerlineRoute:initial.points,
    laneRoute:initial.lanePoints || initial.points,
    laneIds:[...initial.laneIds],
    laneRoadIds:[...initial.laneRoadIds],
    routeNetworkRevision:s.roadNetworkRevision,
    t:.25,
    speed:.001,
    cargo:1,
    source:factory,
    to:shop,
    stage:'delivery',
    value:10,
    wait:0
  };
  s.trucks.push(truck);

  assert.equal(eraseRoad(s, {x:0,y:0}), true);
  updateEconomy(s, .01, () => {});

  assert.ok(!truck.routeInvalidated);
  assert.ok(truck.laneIds.length);
  assert.ok(truck.laneRoadIds.every(id => s.roads.some(r => r.id === id)));
  assert.ok(truck.laneRoadIds.includes(detour.id));
  assert.equal(truck.routeNetworkRevision, s.roadNetworkRevision);
});

test('deleting a branch invalidates only trucks whose saved route used that branch', () => {
  const s = baseState();
  const f = building('Food', -120, 0);
  const shop = building('Market', 120, 0);
  s.buildings.push(f,shop);

  const west = road([{x:-85,y:0},{x:0,y:0}]);
  const east = road([{x:0,y:0},{x:85,y:0}]);
  const north = road([{x:0,y:0},{x:0,y:120}]);
  s.roads.push(west,east,north);

  const truckRoute = routeOnRoadNetwork(s,f,shop);
  assert.ok(truckRoute);
  const truck = {
    id:'branch-delete-truck',
    route:truckRoute.points,
    routeKey:'branch-delete',
    t:.35,
    speed:.05,
    cargo:1,
    source:f,
    to:shop,
    stage:'delivery',
    value:10
  };
  s.trucks.push(truck);

  assert.equal(eraseRoad(s, {x:0,y:80}), true);
  assert.ok(!truck.routeInvalidated);
  assert.ok(routeOnRoadNetwork(s,f,shop));
});

test('road segment hit-testing identifies the nearest editable segment', () => {
  const s = baseState();
  const r = road([{x:0,y:0},{x:100,y:0},{x:100,y:100}]);
  s.roads.push(r);
  const hit = roadSegmentAtPoint(s, {x:96,y:45});
  assert.ok(hit);
  assert.equal(hit.roadId, r.id);
  assert.equal(hit.segment, 1);
  assert.ok(Math.abs(hit.point.x-100)<1e-9);
  assert.ok(Math.abs(hit.point.y-45)<1e-9);
});

test('road segment hit-testing rejects points outside the edit tolerance', () => {
  const s = baseState();
  s.roads.push(road([{x:0,y:0},{x:100,y:0}]));
  assert.equal(roadSegmentAtPoint(s, {x:50,y:30}), null);
});

test('road segment editing no longer supports splitting', () => {
  const s = baseState();
  const r = road([{x:0,y:0},{x:200,y:0}]);
  s.roads.push(r);
  const before = JSON.stringify(s.roads);
  assert.equal(editRoadSegment(s,{x:100,y:8},'split'),false);
  assert.equal(JSON.stringify(s.roads),before);
});

test('editing a road segment invalidates trucks using the edited road', () => {
  const s = baseState();
  const f = building('Food',0,0);
  const shop = building('Market',200,0);
  s.buildings.push(f,shop);
  const r = road([{x:35,y:0},{x:165,y:0}]);
  s.roads.push(r);
  const routed = routeOnRoadNetwork(s,f,shop);
  assert.ok(routed);
  const truck = {id:'edit-road-truck',route:routed.points,t:.5,speed:.05,cargo:1,source:f,to:shop,stage:'delivery',value:10};
  s.trucks.push(truck);
  const result = editRoadSegment(s,{x:100,y:0},'delete');
  assert.ok(result);
  assert.equal(truck.routeInvalidated,true);
});

test('road editing deletes the whole road instead of splitting or deleting one segment', () => {
  const s = baseState();
  const r = road([{x:-120,y:0},{x:0,y:0},{x:120,y:0}]);
  s.roads.push(r);
  const result = editRoadSegment(s,{x:60,y:0},'delete');
  assert.ok(result);
  assert.equal(s.roads.length,0);
});


test('road endpoint hit-testing identifies the nearest editable endpoint', () => {
  const s = baseState();
  const r = road([{x:0,y:0},{x:120,y:0},{x:120,y:80}]);
  s.roads.push(r);
  const hit = roadEndpointAtPoint(s,{x:2,y:3});
  assert.ok(hit);
  assert.equal(hit.roadId,r.id);
  assert.equal(hit.index,0);
  assert.deepEqual(hit.point,{x:0,y:0});
});

test('road endpoint preview snaps to another road segment', () => {
  const s = baseState();
  const moving = road([{x:0,y:0},{x:80,y:0}]);
  const target = road([{x:140,y:-80},{x:140,y:80}]);
  s.roads.push(moving,target);
  const preview = roadEndpointPreview(s,moving,1,{x:138,y:4});
  assert.ok(preview);
  assert.ok(!preview.blocked);
  assert.ok(Math.abs(preview.target.x-140)<1e-9);
  assert.ok(Math.abs(preview.target.y-4)<1e-9);
  assert.equal(preview.target.road,target);
});

test('moving a road endpoint commits atomically and preserves the road id', () => {
  const s = baseState();
  const r = road([{x:0,y:0},{x:100,y:0}]);
  s.roads.push(r);
  const result = editRoadEndpoint(s,r.id,1,{x:160,y:0});
  assert.ok(result);
  assert.equal(s.roads.length,1);
  assert.equal(s.roads[0].id,r.id);
  assert.deepEqual(s.roads[0].points,[{x:0,y:0},{x:156,y:0}]);
});

test('invalid overlapping road endpoint moves leave the network unchanged', () => {
  const s = baseState();
  const r = road([{x:0,y:0},{x:30,y:0}]);
  const other = road([{x:60,y:0},{x:140,y:0}]);
  s.roads.push(r,other);
  const before = JSON.stringify(s.roads);
  assert.equal(editRoadEndpoint(s,r.id,1,{x:140,y:0}),false);
  assert.equal(JSON.stringify(s.roads),before);
});

test('moving a road endpoint onto another road creates a routable junction', () => {
  const s = baseState();
  const f = building('Food',-120,0);
  const shop = building('Market',0,150);
  s.buildings.push(f,shop);
  const main = road([{x:-85,y:0},{x:85,y:0}]);
  const branch = road([{x:0,y:80},{x:0,y:150}]);
  s.roads.push(main,branch);
  const result = editRoadEndpoint(s,branch.id,0,{x:0,y:3});
  assert.ok(result);
  const routed = routeOnRoadNetwork(s,f,shop);
  assert.ok(routed);
  assert.ok(routed.points.some(p=>Math.abs(p.x)<1e-9&&Math.abs(p.y)<1e-9));
});


test('moving a road endpoint invalidates trucks using the old geometry', () => {
  const s = baseState();
  const f = building('Food',-300,200);
  const shop = building('Market',300,200);
  s.buildings.push(f,shop);
  const r = road([{x:-255,y:200},{x:255,y:200}]);
  s.roads.push(r);
  const routed = routeOnRoadNetwork(s,f,shop);
  assert.ok(routed);
  const truck = {id:'endpoint-edit-truck',route:routed.points,t:.4,speed:.05,cargo:1,source:f,to:shop,stage:'delivery',value:10};
  s.trucks.push(truck);
  assert.ok(editRoadEndpoint(s,r.id,1,{x:85,y:280}),JSON.stringify(roadEndpointPreview(s,r,1,{x:85,y:280})));
  assert.equal(truck.routeInvalidated,true);
});

test('moving a road endpoint across the river recalculates bridge state', () => {
  const s = baseState();
  const r = road([{x:-100,y:300},{x:100,y:300}]);
  s.roads.push(r);
  assert.equal(r.bridge,false);
  assert.ok(editRoadEndpoint(s,r.id,1,{x:100,y:500}));
  assert.equal(s.roads[0].bridge,true);
});


test('road cleanup removes zero-length and tiny fragments without touching valid roads', () => {
  const s = baseState();
  const valid = road([{x:0,y:0},{x:100,y:0}]);
  const zero = road([{x:200,y:0},{x:200,y:0}]);
  const tiny = road([{x:300,y:0},{x:305,y:0}]);
  s.roads.push(valid,zero,tiny);
  const result = cleanupRoadNetwork(s);
  assert.equal(result.removed.length,2);
  assert.deepEqual(s.roads.map(r=>r.id),[valid.id]);
});

test('road cleanup collapses redundant collinear points', () => {
  const s = baseState();
  const r = road([{x:0,y:0},{x:40,y:0},{x:80,y:0},{x:120,y:0}]);
  s.roads.push(r);
  cleanupRoadNetwork(s);
  assert.deepEqual(s.roads[0].points,[{x:0,y:0},{x:120,y:0}]);
});

test('road cleanup removes reversed duplicate pavement and invalidates its trucks', () => {
  const s = baseState();
  const kept = road([{x:0,y:0},{x:120,y:0}]);
  const duplicate = road([{x:120,y:0},{x:0,y:0}]);
  s.roads.push(kept,duplicate);
  const truck = {route:[{x:0,y:0},{x:120,y:0}],t:.2};
  s.trucks.push(truck);
  cleanupRoadNetwork(s);
  assert.equal(s.roads.length,1);
  assert.equal(s.roads[0].id,kept.id);
  assert.equal(truck.routeInvalidated,true);
});

test('road cleanup recalculates bridge state after geometry normalization', () => {
  const s = baseState();
  const r = road([{x:0,y:300},{x:0,y:420},{x:0,y:500}]);
  r.bridge=false;
  s.roads.push(r);
  cleanupRoadNetwork(s);
  assert.equal(s.roads[0].bridge,true);
});


test('near-touching road endpoints remain connected for routing without mutating road geometry', () => {
  const s = baseState();
  const f = building('Food', -120, 0);
  const shop = building('Market', 0, 120);
  s.buildings.push(f, shop);
  s.roads.push(
    road([{x:-85,y:0},{x:0,y:0}]),
    road([{x:4,y:0},{x:0,y:85}])
  );
  const before = JSON.stringify(s.roads);
  const network = roadNetwork(s);
  assert.ok(network.nodes.some(n => Math.abs(n.x-2)<1e-9 && Math.abs(n.y)<1e-9));
  assert.ok(routeOnRoadNetwork(s,f,shop));
  assert.equal(JSON.stringify(s.roads), before);
});

test('endpoint-to-middle road proximity becomes a graph junction without mutating saved geometry', () => {
  const s = baseState();
  const f = building('Food', -120, 0);
  const shop = building('Market', 0, 120);
  s.buildings.push(f, shop);
  const main = road([{x:-85,y:0},{x:85,y:0}]);
  const branch = road([{x:0,y:5},{x:0,y:85}]);
  s.roads.push(main, branch);
  const before = JSON.stringify(s.roads);
  const network = roadNetwork(s);
  assert.ok(network.junctions.some(n => Math.abs(n.x)<1e-9 && Math.abs(n.y)<1e-9));
  assert.ok(routeOnRoadNetwork(s,f,shop));
  assert.equal(JSON.stringify(s.roads), before);
});

test('editing a road endpoint keeps an existing junction target routable after cleanup', () => {
  const s = baseState();
  const f = building('Food', -120, 0);
  const shop = building('Market', 0, 150);
  s.buildings.push(f, shop);
  const main = road([{x:-85,y:0},{x:85,y:0}]);
  const branch = road([{x:0,y:80},{x:0,y:150}]);
  s.roads.push(main, branch);
  const editResult=editRoadEndpoint(s, branch.id, 0, {x:0,y:4});
  const routed = routeOnRoadNetwork(s,f,shop);
  assert.ok(routed);
  assert.ok(routed.points.some(p => Math.abs(p.x)<1e-9 && Math.abs(p.y)<1e-9));
});

test('road preview from a building faces the destination and snaps to a nearby building', () => {
  const s = baseState();
  const start = building('Food', 0, 0);
  const end = building('Market', 220, 0);
  s.buildings.push(start, end);

  const preview = roadPreview(s, start, {x: end.x + 52, y: end.y});
  assert.ok(preview);
  assert.ok(!preview.blocked);
  assert.equal(preview.start.building, start);
  assert.equal(preview.end.building, end);
  const expectedStart=buildingModule.buildingRoadEntrance(start);
  const expectedEnd=buildingModule.buildingRoadEntrance(end);
  assert.deepEqual({x:preview.start.x,y:preview.start.y},{x:expectedStart.x,y:expectedStart.y});
  assert.deepEqual({x:preview.end.x,y:preview.end.y},{x:expectedEnd.x,y:expectedEnd.y});
});

test('traffic yields at a crossing instead of driving through another truck', () => {
  const s = baseState();
  const source = {type:'Food',level:1,loading:0,logistics:0,stock:0,max:10};
  const destination = {contract:null};
  const first = {
    id:'truck-a',
    route:[{x:-100,y:0},{x:100,y:0}],
    routeKey:'horizontal',
    t:.45,
    speed:.1,
    value:0,
    cargo:1,
    source,
    to:destination,
    wait:0,
    stage:'delivery'
  };
  const second = {
    id:'truck-b',
    route:[{x:0,y:-100},{x:0,y:100}],
    routeKey:'vertical',
    t:.45,
    speed:.1,
    value:0,
    cargo:1,
    source,
    to:destination,
    wait:0,
    stage:'delivery'
  };
  s.trucks=[first,second];
  updateEconomy(s,.1,()=>{});
  assert.ok(first.t>.45);
  assert.ok(second.t<first.t);
  assert.ok(second.t<.46);
  assert.ok(second.wait>0);
});

test('traffic gives an occupied junction to the first arriving movement', () => {
  const s = baseState();
  s.roads.push(
    road([{x:-120,y:0},{x:0,y:0}]),
    road([{x:0,y:0},{x:120,y:0}]),
    road([{x:0,y:-120},{x:0,y:0}]),
    road([{x:0,y:0},{x:0,y:120}])
  );
  const source = {type:'Food',level:1,loading:0,logistics:0,stock:0,max:10};
  const destination = {contract:null};
  const first = {id:'first',route:[{x:-100,y:0},{x:0,y:0},{x:100,y:0}],routeKey:'h',t:.45,speed:.1,value:0,cargo:1,source,to:destination,wait:0,stage:'delivery'};
  const second = {id:'second',route:[{x:0,y:-100},{x:0,y:0},{x:0,y:100}],routeKey:'v',t:.45,speed:.1,value:0,cargo:1,source,to:destination,wait:0,stage:'delivery'};
  s.trucks=[first,second];
  updateEconomy(s,.1,()=>{});
  assert.ok(first.t>.45);
  assert.ok(second.t<first.t);
  assert.ok(second.t<.46);
  assert.ok(second.wait>0);
});

test('opposing traffic is not forced to stop on the same straight road', () => {
  const s = baseState();
  const source = {type:'Food',level:1,loading:0,logistics:0,stock:0,max:10};
  const destination = {contract:null};
  const first = {id:'a',route:[{x:-100,y:0},{x:100,y:0}],routeKey:'east',t:.45,speed:.1,value:0,cargo:1,source,to:destination,wait:0,stage:'delivery'};
  const second = {id:'b',route:[{x:100,y:0},{x:-100,y:0}],routeKey:'west',t:.45,speed:.1,value:0,cargo:1,source,to:destination,wait:0,stage:'delivery'};
  s.trucks=[first,second];
  updateEconomy(s,.1,()=>{});
  assert.ok(first.t>.45);
  assert.ok(second.t>.45);
});

test('junction traffic distinguishes straight-through movement from turning movement', () => {
  const s = baseState();
  s.roads.push(
    road([{x:-120,y:0},{x:0,y:0}]),
    road([{x:0,y:0},{x:120,y:0}]),
    road([{x:0,y:-120},{x:0,y:0}])
  );
  const source = {type:'Food',level:1,loading:0,logistics:0,stock:0,max:10};
  const destination = {contract:null};
  const straight = {id:'straight',route:[{x:-100,y:0},{x:0,y:0},{x:100,y:0}],routeKey:'straight',t:.45,speed:.1,value:0,cargo:1,source,to:destination,wait:0,stage:'delivery'};
  const turn = {id:'turn',route:[{x:0,y:-100},{x:0,y:0},{x:100,y:0}],routeKey:'turn',t:.45,speed:.1,value:0,cargo:1,source,to:destination,wait:0,stage:'delivery'};
  s.trucks=[straight,turn];
  updateEconomy(s,.1,()=>{});
  assert.ok(straight.t>.45);
  assert.ok(turn.t<straight.t);
  assert.ok(turn.t<.46);
  assert.ok(turn.wait>0);
});


test('factory to shop remains direct when no warehouse is present',()=>{
  const s=baseState();
  const f=building('Food',0,0);
  const shop=building('Market',220,0);
  f.stock=3;shop.demand=3;
  s.buildings.push(f,shop);
  const factoryGate=buildingModule.buildingRoadEntrance(f);
  const shopGate=buildingModule.buildingRoadEntrance(shop);
  assert.ok(factoryGate&&shopGate);
  s.roads.push(
    road([{x:factoryGate.x,y:factoryGate.y},{x:180,y:factoryGate.y}]),
    road([{x:180,y:factoryGate.y},{x:180,y:shopGate.y}]),
    road([{x:180,y:shopGate.y},{x:shopGate.x,y:shopGate.y}])
  );
  for(let i=0;i<300&&s.orders<1;i++)updateEconomy(s,.2,()=>{});
  assert.ok(s.orders>=1);
  assert.ok(s.cash>500);
});

test('a warehouse on a separate network does not break direct factory to shop supply',()=>{
  const s=baseState();
  const f=building('Food',0,0);
  const shop=building('Market',360,0);
  const otherShop=building('Market',500,100);
  const warehouse=building('Warehouse',500,0);
  f.stock=3;shop.demand=3;
  s.buildings.push(f,shop,otherShop,warehouse);
  const factoryGate=buildingModule.buildingRoadEntrance(f);
  const shopGate=buildingModule.buildingRoadEntrance(shop);
  assert.ok(factoryGate&&shopGate);
  s.roads.push(
    road([{x:factoryGate.x,y:factoryGate.y},{x:180,y:factoryGate.y}]),
    road([{x:180,y:factoryGate.y},{x:180,y:shopGate.y}]),
    road([{x:180,y:shopGate.y},{x:shopGate.x,y:shopGate.y}]),
    road([{x:465,y:0},{x:535,y:0}]),
    road([{x:500,y:0},{x:500,y:72}])
  );
  for(let i=0;i<300&&s.orders<1;i++)updateEconomy(s,.2,()=>{});
  assert.ok(s.orders>=1,'direct factory to shop delivery must remain available');
  assert.equal(warehouse.storage||0,0,'separate warehouse network should not receive cargo');
});

test('warehouse delivery respects total storage capacity',()=>{
  const s=baseState();
  const f=building('Food',0,0);
  const warehouse=building('Warehouse',110,0);
  f.stock=3;warehouse.max=1;warehouse.storage=1;warehouse.inventory={Food:1};
  s.buildings.push(f,warehouse);
  s.roads.push(road([{x:35,y:0},{x:185,y:0}]));
  updateEconomy(s,2,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(warehouse.storage,1);
  assert.ok(f.stock>=3);
});



test('factory trucks physically start at the factory dock and keep the gate connector in their movement route',()=>{
  const s=baseState();
  const factory=building('Food',0,160);
  const shop=building('Market',0,-160);
  factory.stock=3; shop.demand=3;
  s.buildings.push(factory,shop);
  const factoryGate=buildingModule.buildingRoadEntrance(factory);
  const shopGate=buildingModule.buildingRoadEntrance(shop);
  assert.ok(factoryGate&&shopGate);
  // Build a real connected road around the building footprints. The gate
  // connectors must leave each building before joining the shared spine.
  const spineX=300;
  s.roads.push(
    road([{x:factoryGate.x,y:factoryGate.y},{x:spineX,y:factoryGate.y}]),
    road([{x:spineX,y:factoryGate.y},{x:spineX,y:shopGate.y}]),
    road([{x:spineX,y:shopGate.y},{x:shopGate.x,y:shopGate.y}])
  );
  const routed=routeOnRoadNetwork(s,factory,shop);
  assert.ok(routed);
  assert.ok(routed.startYard.length>=3);
  assert.deepEqual(routed.startYard[0],buildingModule.buildingPrimaryDock(factory).approach);
  assert.ok(routed.points.some(p=>Math.hypot(p.x-factoryGate.x,p.y-factoryGate.y)<.01));
  updateEconomy(s,1.2,()=>{});
  assert.ok(s.trucks.length>0,'factory should dispatch a truck when its road connection is valid');
  const truck=s.trucks[0];
  assert.deepEqual(truck.route[0],routed.points[0]);
  assert.deepEqual(truck.laneRoute[0],routed.startYard[0]);
  assert.ok(truck.laneRoute.some(p=>Math.hypot(p.x-factoryGate.x,p.y-factoryGate.y)<.01),'truck movement route must pass through the factory gate');
});
