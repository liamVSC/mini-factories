import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState} from '../src/state.js';
import {
  addRoad,
  eraseRoad,
  editRoadEndpoint,
  roadNetwork,
  routeOnRoadNetwork
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
  assert.equal(addRoad(s,[{x:0,y:0},{x:180,y:0}]),true);
  assert.equal(s.roadNetworkRevision,2);

  const before=buildLaneGraph(roadNetwork(s));
  assert.ok(before.lanes.length>=4);

  const removed=eraseRoad(s,{x:170,y:0});
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
  assert.equal(addRoad(s,[{x:0,-160},{x:0,y:160}]),true);
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
  const laneIndex=laneIndexForJunction(lanes,[lane.id,...(lanes.outgoing.get(junction)||[]).map(x=>x.id)],junction);
  assert.equal(laneIndex,0);

  const movement=control.movements.find(m=>m.incomingLaneId===lane.id);
  assert.ok(movement);
  assert.equal(movementForLaneRoute(lanes,controls,[movement.incomingLaneId,movement.outgoingLaneId],0)?.id,movement.id);
});
