import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.innerWidth = 390;
globalThis.innerHeight = 844;

const {freshState, makeBuilding, TYPES} = await import('../src/state.js');
const {
  addRoad,
  eraseRoad,
  editRoadSegment,
  roadAttachment,
  routeOnRoadNetwork,
  roadNetwork
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

test('placing a road into the middle of an existing road creates a real junction split', () => {
  const s = baseState();
  s.roads.push(road([{x:0,y:0},{x:200,y:0}]));
  const beforeCash = s.cash;
  assert.equal(addRoad(s, [{x:100,y:0},{x:100,y:120}]), true);
  assert.equal(s.roads.length, 3);
  assert.ok(s.roads.some(r => r.points.some(p => Math.abs(p.x-100)<1e-9 && Math.abs(p.y)<1e-9)));
  assert.ok(s.roads.some(r => r.points.some(p => Math.abs(p.x-100)<1e-9 && Math.abs(p.y-120)<1e-9)));
  const network = roadNetwork(s);
  assert.ok(network.nodes.some(n => Math.abs(n.x-100)<1e-9 && Math.abs(n.y)<1e-9));
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
  assert.equal(truck.routeInvalidated, false);
  assert.ok(routeOnRoadNetwork(s,f,shop));
});

test('editing a road segment can split it while preserving its geometry', () => {
  const s = baseState();
  s.roads.push(road([{x:0,y:0},{x:200,y:0}]));
  const result = editRoadSegment(s,{x:100,y:8},'split');
  assert.ok(result);
  assert.equal(s.roads.length,2);
  assert.ok(s.roads.every(r=>r.points.length>=2));
  assert.ok(s.roads.some(r=>r.points.some(p=>Math.abs(p.x-100)<1e-9&&Math.abs(p.y)<1e-9)));
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
  const result = editRoadSegment(s,{x:100,y:0},'split');
  assert.ok(result);
  assert.equal(truck.routeInvalidated,true);
});

test('interactive road editing removes one segment without deleting the branches', () => {
  const s = baseState();
  s.roads.push(road([{x:-120,y:0},{x:0,y:0},{x:120,y:0}]));
  const result = editRoadSegment(s,{x:60,y:0},'delete');
  assert.ok(result);
  assert.equal(s.roads.length,1);
  assert.deepEqual(s.roads[0].points,[{x:-120,y:0},{x:0,y:0}]);
});
