import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,TYPES} from '../src/state.js';
import {
  addRoad,
  eraseRoad,
  editRoadEndpoint,
  roadNetwork,
  routeOnRoadNetwork,
  buildingPhysicalPlacementReason,
  spawn,
  seed
} from '../src/world.js';
import {buildLaneGraph} from '../src/laneGraph.js';
import {
  buildJunctionControls,
  laneIndexForJunction,
  movementForLaneRoute
} from '../src/junctionControl.js';

function roadState(){
  const s=freshState();
  s.cash=5000;
  return s;
}

test('road mutations advance the topology revision and rebuild lane graph safely',()=>{
  const s=roadState();
  assert.equal(s.roadNetworkRevision,0);
  assert.equal(addRoad(s,[{x:-180,y:0},{x:0,y:0}]),true);
  assert.equal(s.roadNetworkRevision,1);
  assert.equal(addRoad(s,[{x:0,y:0},{x:0,y:180}]),true);
  assert.equal(s.roadNetworkRevision,2);

  const before=buildLaneGraph(roadNetwork(s));
  assert.ok(before.lanes.length>=4);

  const removed=eraseRoad(s,{x:0,y:170});
  assert.equal(removed,true);
  assert.equal(s.roadNetworkRevision,3);

  const after=buildLaneGraph(roadNetwork(s));
  assert.ok(after.lanes.length<before.lanes.length);
  assert.equal(s.roads.length,1);
});

test('editing a road endpoint preserves a valid topology and invalidates its derived revision',()=>{
  const s=roadState();
  assert.equal(addRoad(s,[{x:-180,y:0},{x:0,y:0}]),true);
  const road=s.roads[0];
  const revision=s.roadNetworkRevision;

  const result=editRoadEndpoint(s,road.id,1,{x:120,y:0});
  assert.ok(result);
  assert.equal(s.roadNetworkRevision,revision+1);
  assert.equal(s.roads.length,1);
  assert.equal(s.roads[0].points.at(-1).x,120);

  const graph=buildLaneGraph(roadNetwork(s));
  assert.equal(graph.lanes.length,2);
});

test('disconnected road components do not produce a lane route',()=>{
  const s=roadState();
  const factory={id:'factory',x:-120,y:0,kind:'factory',r:25};
  const shop={id:'shop',x:120,y:200,kind:'shop',r:25};
  s.buildings=[factory,shop];
  assert.equal(addRoad(s,[{x:-120,y:0},{x:0,y:0}]),true);
  assert.equal(addRoad(s,[{x:120,y:200},{x:260,y:200}]),true);
  assert.equal(routeOnRoadNetwork(s,factory,shop),null);
});

test('junction controls expose explicit turning state for lane transitions',()=>{
  const s=roadState();
  assert.equal(addRoad(s,[{x:-160,y:0},{x:160,y:0}]),true);
  assert.equal(addRoad(s,[{x:0,y:-160},{x:0,y:160}]),true);
  const network=roadNetwork(s);
  const lanes=buildLaneGraph(network);
  const controls=buildJunctionControls(network,lanes);
  const junction=network.junctions.find(node=>(network.adjacency.get(node)||[]).length>=4);
  assert.ok(junction);

  const control=controls.get(`${Math.round(junction.x*10)/10},${Math.round(junction.y*10)/10}`);
  assert.ok(control);
  assert.ok(control.movements.some(m=>m.type==='left'));
  assert.ok(control.movements.some(m=>m.type==='right'));
  assert.ok(control.movements.some(m=>m.type==='straight'));

  const incoming=lanes.incoming.get(junction)||[];
  assert.ok(incoming.length);
  const lane=incoming[0];
  const movement=control.movements.find(m=>m.incomingLaneId===lane.id);
  assert.ok(movement);
  const laneIndex=laneIndexForJunction(lanes,[movement.incomingLaneId,movement.outgoingLaneId],junction);
  assert.equal(laneIndex,0);
  assert.equal(movementForLaneRoute(lanes,controls,[movement.incomingLaneId,movement.outgoingLaneId],0)?.id,movement.id);
});

test('factories keep a dedicated separation buffer during placement and procedural spawning',()=>{
  const s=roadState();
  const steelType=TYPES.find(t=>t.name==='Steel');
  const foodType=TYPES.find(t=>t.name==='Food');
  assert.ok(steelType&&foodType);
  const first={id:'steel',x:0,y:0,kind:'factory',r:25};
  s.buildings=[first];
  assert.equal(buildingPhysicalPlacementReason(s,foodType,120,0),'Too close to another factory');
  assert.equal(buildingPhysicalPlacementReason(s,foodType,140,0),null);

  const generated=freshState();
  generated.cash=5000;
  const steel=spawn(generated,'factory','Steel');
  const food=spawn(generated,'factory','Food');
  assert.ok(steel&&food);
  const separatedX=Math.abs(steel.x-food.x)>=39+39+48;
  const separatedY=Math.abs(steel.y-food.y)>=31+31+48;
  assert.ok(separatedX||separatedY);

  const seeded=freshState();
  seeded.cash=5000;
  const factories=['Steel','Food','Parts'].map(type=>spawn(seeded,'factory',type));
  assert.ok(factories.every(Boolean));
  for(let i=0;i<factories.length;i++)for(let j=i+1;j<factories.length;j++){
    assert.ok(Math.hypot(factories[i].x-factories[j].x,factories[i].y-factories[j].y)>=250);
  }
});


test('procedural layout uses its own seed without mutating the saved game seed',()=>{
  const first=freshState();
  const second=freshState();
  first.cash=5000;
  second.cash=5000;
  first.gameSeed=111;
  second.gameSeed=222;
  first.layoutSeed=333;
  second.layoutSeed=444;

  const firstGameSeed=first.gameSeed;
  const secondGameSeed=second.gameSeed;
  seed(first);
  seed(second);

  assert.equal(first.gameSeed,firstGameSeed);
  assert.equal(second.gameSeed,secondGameSeed);
  assert.ok(first.buildings.length>=6);
  assert.ok(second.buildings.length>=6);
  assert.notDeepEqual(
    first.buildings.map(b=>[b.type,Math.round(b.x),Math.round(b.y)]),
    second.buildings.map(b=>[b.type,Math.round(b.x),Math.round(b.y)])
  );
});


test('road editing helpers are exported from the editing module without world dependency',async()=>{
  const editing=await import('../src/world/roads/editing.js');
  for(const name of ['roadAtPoint','roadSegmentAtPoint','roadEndpointCandidate','roadEndpointAtPoint','endpointTarget','roadEndpointPreview','editRoadSegment','editRoadEndpoint','endpointSegmentBlocked'])assert.equal(typeof editing[name],'function',name);
});

test('road intersections preserve exact duplicate rejection, meaningful overlap rejection and perpendicular junction reuse',()=>{
  const s=roadState();
  assert.equal(addRoad(s,[{x:-160,y:0},{x:160,y:0}]),true);
  assert.equal(addRoad(s,[{x:-160,y:0},{x:160,y:0}]),'duplicate');
  assert.equal(addRoad(s,[{x:-100,y:0},{x:100,y:0}]),'duplicate');
  assert.equal(addRoad(s,[{x:0,y:-160},{x:0,y:160}]),true);
  const network=roadNetwork(s);
  const junction=network.junctions.find(n=>Math.abs(n.x)<1e-6&&Math.abs(n.y)<1e-6);
  assert.ok(junction);
  assert.ok((network.adjacency.get(junction)||[]).length>=4);
});
