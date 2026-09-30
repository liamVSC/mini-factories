import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.innerWidth = 390;
globalThis.innerHeight = 844;

const {freshState, makeBuilding, TYPES} = await import('../src/state.js');
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
  roadNetwork,
  cleanupRoadNetwork,
  roadPreview
} = await import('../src/world.js');
const {route, updateEconomy} = await import('../src/economy.js');

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

function building(typeName, x, y) {
  const type = TYPES.find(t => t.name === typeName);
  return makeBuilding(type, x, y, crypto.randomUUID());
}

test('building attaches to the nearest physical road segment', () => {
  const s = baseState();
  const f = building('Food', 0, 0);
  s.buildings.push(f);
  s.roads.push(road([{x:35,y:0},{x:150,y:0}]));

  const a = roadAttachment(s, f);
  assert.ok(a);
  assert.equal(a.road, s.roads[0]);
  assert.ok(Math.abs(a.point.x - 35) < 1e-9);
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
  assert.deepEqual(r.points[0], {x:35,y:0});
  assert.deepEqual(r.points.at(-1), {x:185,y:0});
  for (const p of r.points) assert.equal(p.y, 0);
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
  s.roads.push(road([{x:35,y:0},{x:185,y:0}]));

  const before = s.cash;
  updateEconomy(s, .2, () => {});
  assert.equal(s.trucks.length, 0);
  for(let i=0;i<99;i++) updateEconomy(s, .2, () => {});
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
  const f = building('Food',-120,0);
  const shop = building('Market',120,0);
  s.buildings.push(f,shop);
  const r = road([{x:-85,y:0},{x:85,y:0}]);
  s.roads.push(r);
  const routed = routeOnRoadNetwork(s,f,shop);
  assert.ok(routed);
  const truck = {id:'endpoint-edit-truck',route:routed.points,t:.4,speed:.05,cargo:1,source:f,to:shop,stage:'delivery',value:10};
  s.trucks.push(truck);
  assert.ok(editRoadEndpoint(s,r.id,1,{x:85,y:120}));
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
  assert.ok(editRoadEndpoint(s, branch.id, 0, {x:0,y:4}));
  const routed = routeOnRoadNetwork(s, f, shop);
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
  assert.ok(preview.start.x > start.x);
  assert.ok(preview.end.x < end.x);
  assert.ok(Math.abs(preview.start.y - start.y) < 1e-9);
  assert.ok(Math.abs(preview.end.y - end.y) < 1e-9);
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
  assert.equal(second.t,.45);
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
  assert.equal(second.t,.45);
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
  assert.equal(turn.t,.45);
  assert.ok(turn.wait>0);
});


test('factory to shop remains direct when no warehouse is present',()=>{
  const s=baseState();
  const f=building('Food',0,0);
  const shop=building('Market',220,0);
  f.stock=3;shop.demand=3;
  s.buildings.push(f,shop);
  s.roads.push(road([{x:35,y:0},{x:185,y:0}]));
  for(let i=0;i<120&&s.orders<1;i++)updateEconomy(s,.2,()=>{});
  assert.ok(s.orders>=1);
  assert.ok(s.cash>500);
});

test('factory uses warehouse then warehouse supplies the shop',()=>{
  const s=baseState();
  const f=building('Food',0,0);
  const warehouse=building('Warehouse',100,0);
  const shop=building('Market',200,0);
  f.stock=3;shop.demand=3;
  s.buildings.push(f,warehouse,shop);
  s.roads.push(
    road([{x:0,y:0},{x:100,y:0}]),
    road([{x:100,y:0},{x:200,y:0}])
  );

  updateEconomy(s,1.2,()=>{});
  assert.equal(s.trucks.length,1);
  assert.equal(s.trucks[0].stage,'warehouse');
  s.trucks[0].t=.999;
  updateEconomy(s,.1,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(warehouse.inventory.Food,3);

  // Stop the factory from producing another warehouse load so this phase
  // specifically exercises warehouse -> shop distribution.
  f.stock=0;
  f.production=0;
  updateEconomy(s,1.2,()=>{});
  assert.equal(s.trucks.length,1);
  assert.equal(s.trucks[0].stage,'delivery');
  assert.equal(s.trucks[0].source,warehouse);
  s.trucks[0].t=.999;
  updateEconomy(s,.1,()=>{});
  assert.equal(s.orders,3);
});

test('a warehouse on a separate network does not break direct factory to shop supply',()=>{
  const s=baseState();
  const f=building('Food',0,0);
  const shop=building('Market',220,0);
  const otherShop=building('Market',500,100);
  const warehouse=building('Warehouse',500,0);
  f.stock=3;shop.demand=3;
  s.buildings.push(f,shop,otherShop,warehouse);
  s.roads.push(
    road([{x:35,y:0},{x:185,y:0}]),
    road([{x:465,y:0},{x:535,y:0}]),
    road([{x:500,y:0},{x:500,y:72}])
  );
  for(let i=0;i<120&&s.orders<1;i++)updateEconomy(s,.2,()=>{});
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
