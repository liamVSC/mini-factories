import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,TYPES} from '../src/state.js';
import {createCommandHistory,AddRoadCommand} from '../src/commands.js';
import {
  addRoad,
  eraseRoad,
  editRoadEndpoint,
  roadNetwork,
  roadTopology,
  nearestGraphNode,
  routeOnRoadNetwork,
  connectedRoadComponents,
  isRouteStale,
  buildingPhysicalPlacementReason,
  seed
} from '../src/world.js';
import {buildLaneGraph,laneRouteGeometry,laneChangeRequired} from '../src/laneGraph.js';
import {
  buildJunctionControls,
  laneIndexForJunction,
  movementForLaneRoute,
  movementPermission,
  signalForMovement
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


test('routing traverses a junction and preserves explicit turn state',()=>{
  const s=roadState();
  const factory={id:'factory',x:-160,y:0,kind:'factory',r:25};
  const shop={id:'shop',x:0,y:160,kind:'shop',r:25};
  s.buildings=[factory,shop];
  assert.equal(addRoad(s,[{x:-160,y:0},{x:160,y:0}]),true);
  assert.equal(addRoad(s,[{x:0,y:-160},{x:0,y:160}]),true);

  const route=routeOnRoadNetwork(s,factory,shop);
  assert.ok(route);
  assert.equal(route.roadNetworkRevision,s.roadNetworkRevision);
  assert.equal(route.componentId,0);
  assert.ok(route.laneIds.length>=2);
  assert.ok(route.lanePoints.length>=2);
  assert.ok(route.laneTransitions.some(t=>t.type==='left'));
  assert.ok(route.points.some(p=>Math.abs(p.x)<1e-6&&Math.abs(p.y)<1e-6));
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

test('lane graph keeps opposing traffic in separate carriageways and prefers turning lanes',()=>{
  const s=roadState();
  assert.equal(addRoad(s,[{x:-160,y:0},{x:0,y:0}]),true);
  assert.equal(addRoad(s,[{x:0,y:0},{x:0,y:160}]),true);
  const network=roadNetwork(s);
  const graph=buildLaneGraph(network,{lanesPerDirection:2});
  assert.equal(graph.lanes.length,8);
  const horizontal=graph.edges.find(e=>Math.abs(e.a.y)<1e-6&&Math.abs(e.b.y)<1e-6);
  assert.ok(horizontal);
  const forward=graph.lanes.filter(l=>l.edge===horizontal&&l.from===horizontal.a);
  const reverse=graph.lanes.filter(l=>l.edge===horizontal&&l.from===horizontal.b);
  assert.deepEqual(forward.map(l=>l.lateralOffset),[-10.5,-3.5]);
  assert.deepEqual(reverse.map(l=>l.lateralOffset),[3.5,10.5]);

  const route=routeOnRoadNetwork(s,{id:'a',x:-140,y:0,kind:'factory',r:25},{id:'b',x:0,y:140,kind:'shop',r:25});
  assert.ok(route);
  assert.ok(route.laneTransitions.some(t=>t.type==='left'));
  const turn=route.laneTransitions.find(t=>t.type==='left');
  assert.ok(turn);
  assert.equal(turn.offset,7);
  const routeGraph=buildLaneGraph(roadNetwork(s,[{x:-140,y:0},{x:0,y:140}]),{lanesPerDirection:2});
  const geometry=laneRouteGeometry(routeGraph,route.laneIds);
  assert.ok(geometry.points.length>route.laneIds.length);
  assert.ok(geometry.transitions.some(t=>t.type==='left'));
});

test('lane-change metadata and junction signals/priority expose deterministic state',()=>{
  const s=roadState();
  assert.equal(addRoad(s,[{x:-160,y:0},{x:160,y:0}]),true);
  assert.equal(addRoad(s,[{x:0,y:-160},{x:0,y:160}]),true);
  const network=roadNetwork(s),graph=buildLaneGraph(network,{lanesPerDirection:2}),controls=buildJunctionControls(network,graph);
  const junction=network.junctions[0];
  assert.ok(junction);
  const key=`${Math.round(junction.x*10)/10},${Math.round(junction.y*10)/10}`;
  const control=controls.get(key);
  assert.ok(control);
  const left=control.movements.find(m=>m.type==='left');
  assert.ok(left);
  const signalState=clock=>signalForMovement({...s,trafficSignals:{enabled:true,cycle:12},trafficClock:clock},control,left).state;
  const greenAt=Array.from({length:121},(_,i)=>i/10).find(clock=>signalState(clock)==='green');
  const redAt=Array.from({length:121},(_,i)=>i/10).find(clock=>signalState(clock)==='red');
  assert.notEqual(greenAt,undefined);
  assert.notEqual(redAt,undefined);
  const conflict=movementPermission(s,controls,junction,left,{occupiedIds:control.conflicts.get(left.id)});
  assert.equal(conflict.allowed,false);
});

test('factories keep a dedicated separation buffer during placement and procedural spawning',()=>{
  const s=roadState();
  const steelType=TYPES.find(t=>t.name==='Steel');
  const foodType=TYPES.find(t=>t.name==='Food');
  assert.ok(steelType&&foodType);
  const first={id:'steel',x:0,y:0,kind:'factory',r:25};
  s.buildings=[first];
  assert.equal(buildingPhysicalPlacementReason(s,foodType,120,0),'Too close to another factory');
  assert.equal(buildingPhysicalPlacementReason(s,foodType,260,0),null);

  const seeded=freshState();
  seeded.cash=5000;
  seed(seeded);
  const factories=seeded.buildings.filter(building=>building.kind==='factory');
  assert.equal(factories.length,3);
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


test('road topology exposes canonical nodes, adjacency, components and junction classification',()=>{
  const s=roadState();
  assert.equal(addRoad(s,[{x:-180,y:0},{x:180,y:0}]),true);
  assert.equal(addRoad(s,[{x:0,y:-180},{x:0,y:180}]),true);
  const topology=roadTopology(s);
  assert.equal(topology.nodes.length,5);
  assert.equal(topology.edges.length,4);
  const junction=topology.topologyJunctions.find(n=>Math.abs(n.x)<1e-6&&Math.abs(n.y)<1e-6);
  assert.ok(junction);
  assert.equal(junction.degree,4);
  assert.equal(junction.type,'junction');
  assert.equal(topology.fourWayJunctions.length,1);
  assert.equal(topology.threeWayJunctions.length,0);
  assert.ok(topology.adjacency.get(topology.nodes.find(n=>Math.abs(n.x+180)<1e-6&&Math.abs(n.y)<1e-6)).length===1);
});

test('nearest topology node rejects points outside the graph snap tolerance',()=>{
  const s=roadState();
  assert.equal(addRoad(s,[{x:-180,y:0},{x:180,y:0}]),true);
  const network=roadNetwork(s);
  assert.ok(nearestGraphNode(network,{x:-180,y:2}));
  assert.equal(nearestGraphNode(network,{x:-180,y:10}),null);
});

test('topology revision is invalidated by road mutation without rebuilding persisted geometry',()=>{
  const s=roadState();
  assert.equal(s.roadNetworkRevision,0);
  assert.equal(addRoad(s,[{x:-120,y:0},{x:120,y:0}]),true);
  const before=s.roads[0].points.map(p=>({...p}));
  const topology=roadTopology(s);
  assert.equal(s.roadNetworkRevision,1);
  assert.ok(topology.nodes.length>=2);
  assert.deepEqual(s.roads[0].points,before);
});


test('routing exposes connected components and rejects disconnected endpoints before lane search',()=>{
  const s=roadState();
  const a={id:'a',x:-120,y:0,kind:'factory',r:25};
  const b={id:'b',x:120,y:200,kind:'shop',r:25};
  s.buildings=[a,b];
  assert.equal(addRoad(s,[{x:-120,y:0},{x:0,y:0}]),true);
  assert.equal(addRoad(s,[{x:120,y:200},{x:260,y:200}]),true);
  const network=roadNetwork(s);
  const components=connectedRoadComponents(network);
  assert.equal(components.length,2);
  assert.equal(routeOnRoadNetwork(s,a,b),null);
});

test('routing carries the road-network revision and detects stale derived routes',()=>{
  const s=roadState();
  const a={id:'a',x:-120,y:0,kind:'factory',r:25};
  const b={id:'b',x:120,y:0,kind:'shop',r:25};
  s.buildings=[a,b];
  assert.equal(addRoad(s,[{x:-120,y:0},{x:120,y:0}]),true);
  const route=routeOnRoadNetwork(s,a,b);
  assert.ok(route);
  assert.equal(route.roadNetworkRevision,s.roadNetworkRevision);
  assert.equal(isRouteStale(s,route),false);
  assert.equal(eraseRoad(s,{x:0,y:0}),true);
  assert.equal(isRouteStale(s,route),true);
});


test('road command undo restores the topology revision and traffic reservations',()=>{
  const s=roadState();
  const history=createCommandHistory();
  s.trafficReservations={'0,0':{truckId:'old',until:99}};
  const beforeRevision=s.roadNetworkRevision;
  const result=history.execute(s,new AddRoadCommand([{x:-180,y:0},{x:0,y:0}]));
  assert.equal(result.ok,true);
  assert.equal(s.roadNetworkRevision,beforeRevision+1);
  s.trafficReservations={'0,0':{truckId:'new',until:99}};
  assert.equal(history.undo(s),true);
  assert.equal(s.roadNetworkRevision,beforeRevision);
  assert.deepEqual(s.roads,[]);
  assert.deepEqual(s.trafficReservations,{'0,0':{truckId:'old',until:99}});
});
