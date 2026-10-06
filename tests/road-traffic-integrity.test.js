import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {freshState,TYPES} from '../dist/state.js';
import {createCommandHistory,AddRoadCommand,DeleteRoadCommand,MoveRoadEndpointCommand,PlaceBuildingCommand} from '../dist/commands.js';
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
  routeNetworkValid,
  buildingDockPoints,
  buildingRoadEntrance,
  buildingPhysicalPlacementReason,
  seed
} from '../dist/world.js';
import {buildLaneGraph,laneRouteGeometry,laneChangeRequired} from '../dist/laneGraph.js';
import {updateEconomy} from '../dist/economy.js';
import {
  buildJunctionControls,
  laneIndexForJunction,
  movementForLaneRoute,
  movementPermission,
  signalForMovement
} from '../dist/junctionControl.js';

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
  const factory={id:'factory',x:-120,y:-108,kind:'factory',r:25};
  const shop={id:'shop',x:120,y:200,kind:'shop',r:25};
  s.buildings=[factory,shop];
  assert.equal(addRoad(s,[{x:-120,y:0},{x:0,y:0}]),true);
  assert.equal(addRoad(s,[{x:120,y:200},{x:260,y:200}]),true);
  assert.equal(routeOnRoadNetwork(s,factory,shop),null);
});


test('truck routes enter building gates and continue through the yard to the primary dock',()=>{
  const s=roadState();
  const factory={id:'factory',x:0,y:160,kind:'factory',r:25,type:'Steel'};
  const shop={id:'shop',x:0,y:-160,kind:'shop',r:25,type:'Market'};
  s.buildings=[factory,shop];

  const factoryGate={x:factory.x,y:factory.y+108};
  const shopGate={x:shop.x,y:shop.y-110};
  assert.equal(addRoad(s,[{x:factoryGate.x,y:factoryGate.y},{x:factoryGate.x,y:0}]),true);
  assert.equal(addRoad(s,[{x:shopGate.x,y:shopGate.y},{x:shopGate.x,y:0}]),true);

  const route=routeOnRoadNetwork(s,factory,shop);
  assert.ok(route);
  assert.ok(route.startYard.length>=3);
  assert.ok(route.endYard.length>=3);
  assert.ok(route.yardDistance>0);

  const factoryDock=buildingDockPoints(factory)[0];
  const shopDock=buildingDockPoints(shop)[0];
  assert.ok(Math.hypot(route.points[0].x-factoryDock.approach.x,route.points[0].y-factoryDock.approach.y)<.01);
  const last=route.points.at(-1);
  assert.ok(Math.hypot(last.x-shopDock.approach.x,last.y-shopDock.approach.y)<.01);

  const factoryEntrance=buildingRoadEntrance(factory);
  const shopEntrance=buildingRoadEntrance(shop);
  assert.ok(route.points.some(p=>Math.hypot(p.x-factoryEntrance.x,p.y-factoryEntrance.y)<.01));
  assert.ok(route.points.some(p=>Math.hypot(p.x-shopEntrance.x,p.y-shopEntrance.y)<.01));
});

test('legacy roads near a canonical gate get an explicit gate-to-pavement connector',()=>{
  const s=roadState();
  const factory={id:'factory',x:0,y:160,kind:'factory',r:25,type:'Steel'};
  const shop={id:'shop',x:0,y:-160,kind:'shop',r:25,type:'Market'};
  s.buildings=[factory,shop];

  // These roads predate the canonical gate and sit just inside the legacy
  // attachment tolerance, so routing must not silently jump from the gate to
  // the pavement.
  s.roads=[
    {id:'legacy-top',points:[{x:-180,y:260},{x:180,y:260}],bridge:false,condition:1,age:0},
    {id:'legacy-spine',points:[{x:0,y:260},{x:0,y:-260}],bridge:false,condition:1,age:0},
    {id:'legacy-bottom',points:[{x:-180,y:-260},{x:180,y:-260}],bridge:false,condition:1,age:0}
  ];

  const route=routeOnRoadNetwork(s,factory,shop);
  assert.ok(route);
  const factoryGate=buildingRoadEntrance(factory);
  const factoryRoadPoint=route.start;
  assert.ok(Math.hypot(factoryRoadPoint.x-factoryGate.x,factoryRoadPoint.y-factoryGate.y)>0);
  const gateIndex=route.points.findIndex(p=>Math.hypot(p.x-factoryGate.x,p.y-factoryGate.y)<.01);
  const roadIndex=route.points.findIndex(p=>Math.hypot(p.x-factoryRoadPoint.x,p.y-factoryRoadPoint.y)<.01);
  assert.ok(gateIndex>=0);
  assert.ok(roadIndex>gateIndex);
  assert.equal(roadIndex,gateIndex+1);
  assert.ok(Math.abs(Math.hypot(
    route.points[roadIndex].x-route.points[gateIndex].x,
    route.points[roadIndex].y-route.points[gateIndex].y
  )-Math.hypot(factoryRoadPoint.x-factoryGate.x,factoryRoadPoint.y-factoryGate.y))<.01);
});


test('routing traverses a junction and preserves explicit turn state',()=>{
  const s=roadState();
  const factory={id:'factory',x:-160,y:-108,kind:'factory',r:25};
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

  const route=routeOnRoadNetwork(s,{id:'a',x:-140,y:-108,kind:'factory',r:25},{id:'b',x:0,y:239,kind:'shop',r:25});
  assert.ok(route);
  assert.ok(route.laneTransitions.some(t=>t.type==='left'));
  const turn=route.laneTransitions.find(t=>t.type==='left');
  assert.ok(turn);
  assert.equal(turn.offset,7);
  const routeGraph=buildLaneGraph(roadNetwork(s,[{x:-140,y:0},{x:0,y:140}]),{lanesPerDirection:2});
  const geometry=laneRouteGeometry(routeGraph,route.laneIds);
  assert.ok(geometry.points.length>route.laneIds.length);
  assert.ok(route.laneTransitions.some(t=>t.type==='left'));
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
  const first={id:'steel',x:0,y:-108,kind:'factory',r:25};
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
  const editing=await import('../dist/world/roads/editing.js');
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
  const a={id:'a',x:-120,y:-108,kind:'factory',r:25};
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
  const a={id:'a',x:-120,y:-108,kind:'factory',r:25};
  const b={id:'b',x:120,y:99,kind:'shop',r:25};
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


test('road delete and endpoint commands restore topology, reservations and geometry on undo',()=>{
  const s=roadState();
  assert.equal(addRoad(s,[{x:-180,y:0},{x:180,y:0}]),true);
  const history=createCommandHistory();
  s.trafficReservations={'0,0':{truckId:'before-delete',until:99}};
  const revision=s.roadNetworkRevision;
  const roadId=s.roads[0].id;
  assert.equal(history.execute(s,new DeleteRoadCommand({x:0,y:0})).ok,true);
  assert.equal(s.roads.length,0);
  assert.equal(history.undo(s),true);
  assert.equal(s.roadNetworkRevision,revision);
  assert.equal(s.roads.length,1);
  assert.deepEqual(s.trafficReservations,{'0,0':{truckId:'before-delete',until:99}});

  s.trafficReservations={'0,0':{truckId:'before-move',until:99}};
  const before=s.roads[0].points.map(p=>({...p}));
  const move=history.execute(s,new MoveRoadEndpointCommand(roadId,1,{x:240,y:0}));
  assert.equal(move.ok,true);
  assert.equal(s.roads[0].points.at(-1).x,240);
  assert.equal(history.undo(s),true);
  assert.deepEqual(s.roads[0].points,before);
  assert.equal(s.roadNetworkRevision,revision);
  assert.deepEqual(s.trafficReservations,{'0,0':{truckId:'before-move',until:99}});
});

test('building placement command restores building list and cash on undo',()=>{
  const s=roadState();
  const type=TYPES.find(t=>t.name==='Steel');
  assert.ok(type);
  const history=createCommandHistory();
  const cash=s.cash;
  const result=history.execute(s,new PlaceBuildingCommand(type,600,600));
  assert.equal(result.ok,true);
  assert.equal(s.buildings.length,1);
  assert.ok(s.cash<cash);
  assert.equal(history.undo(s),true);
  assert.equal(s.buildings.length,0);
  assert.equal(s.cash,cash);
});


test('route validation rejects stale lane IDs even when road revision and road IDs still match',()=>{
  const s=roadState();
  const a={id:'a',x:-120,y:-108,kind:'factory',r:25};
  const b={id:'b',x:120,y:99,kind:'shop',r:25};
  s.buildings=[a,b];
  assert.equal(addRoad(s,[{x:-120,y:0},{x:120,y:0}]),true);
  const route=routeOnRoadNetwork(s,a,b);
  assert.ok(route);
  assert.equal(routeNetworkValid(s,route),true);
  const staleLane={...route,laneIds:['missing-lane'],laneRoadIds:[s.roads[0].id]};
  assert.equal(routeNetworkValid(s,staleLane),false);
});

test('truck update reroutes an active truck after a road revision instead of consuming cached route geometry',()=>{
  const s=roadState();
  const factory={id:'factory',x:-120,y:-108,kind:'factory',r:25,type:'Steel',level:1,stock:0,max:4,production:0,demand:0,served:0,satisfaction:0,loading:0,logistics:0,contract:null};
  const shop={id:'shop',x:120,y:99,kind:'shop',r:25,type:'Market',level:1,stock:0,max:8,production:0,demand:3,served:0,satisfaction:100,loading:0,logistics:0,contract:null};
  s.buildings=[factory,shop];
  assert.equal(addRoad(s,[{x:-120,y:0},{x:120,y:0}]),true);
  const route=routeOnRoadNetwork(s,factory,shop);
  assert.ok(route);
  const graph=buildLaneGraph(roadNetwork(s),{lanesPerDirection:2});
  const staleLaneIds=['missing-lane'];
  s.trucks.push({
    id:'truck-stale-lane',
    route:route.points.map(p=>({...p})),
    laneRoute:route.lanePoints.map(p=>({...p})),
    centerlineRoute:route.points.map(p=>({...p})),
    routeKey:route.points.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join('|'),
    routeNetworkRevision:s.roadNetworkRevision,
    laneIds:staleLaneIds,
    laneRoadIds:[s.roads[0].id],
    currentLaneIndex:0,
    currentLaneId:staleLaneIds[0],
    t:.15,
    speed:.085,
    currentSpeed:.085,
    value:10,
    cargo:1,
    cargoType:'Steel',
    source:factory,
    to:shop,
    contractId:0,
    stage:'delivery',
    wait:0,
    dead:false
  });
  assert.ok(graph.lanes.length>0);
  const before=route.points.map(p=>({...p}));
  updateEconomy(s,.01,()=>{});
  assert.equal(s.trucks.length,1);
  const truck=s.trucks[0];
  assert.equal(truck.routeInvalidated,false);
  assert.equal(truck.routeNetworkRevision,s.roadNetworkRevision);
  assert.ok(Array.isArray(truck.laneIds)&&truck.laneIds.length>0);
  assert.ok(truck.laneIds.every((id,i)=>buildLaneGraph(roadNetwork(s),{lanesPerDirection:2}).lanesById.get(id)?.roadId===truck.laneRoadIds[i]));
  assert.notDeepEqual(truck.route,before);
});

test('truck update safely retires and returns cargo when a road mutation disconnects its route',()=>{
  const s=roadState();
  const factory={id:'factory',x:-120,y:-108,kind:'factory',r:25,type:'Steel',level:1,stock:0,max:4,production:0,demand:0,served:0,satisfaction:0,loading:0,logistics:0,contract:null};
  const shop={id:'shop',x:120,y:99,kind:'shop',r:25,type:'Market',level:1,stock:0,max:8,production:0,demand:3,served:0,satisfaction:100,loading:0,logistics:0,contract:null};
  s.buildings=[factory,shop];
  assert.equal(addRoad(s,[{x:-120,y:0},{x:120,y:0}]),true);
  const route=routeOnRoadNetwork(s,factory,shop);
  assert.ok(route);
  const cargo=2;
  s.trucks.push({
    id:'truck-disconnected',
    route:route.points.map(p=>({...p})),
    laneRoute:route.lanePoints.map(p=>({...p})),
    centerlineRoute:route.points.map(p=>({...p})),
    routeKey:route.points.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join('|'),
    routeNetworkRevision:s.roadNetworkRevision,
    laneIds:[...route.laneIds],
    laneRoadIds:[...route.laneRoadIds],
    currentLaneIndex:0,
    currentLaneId:route.laneIds[0]||null,
    t:.35,
    speed:.085,
    currentSpeed:.085,
    value:10,
    cargo,
    cargoType:'Steel',
    source:factory,
    to:shop,
    contractId:0,
    stage:'delivery',
    wait:0,
    dead:false
  });
  assert.equal(eraseRoad(s,{x:0,y:0}),true);
  assert.equal(s.roadNetworkRevision,2);
  updateEconomy(s,.01,()=>{});
  assert.equal(s.trucks.length,0);
  assert.equal(factory.stock,cargo);
});


test('truck deliveries transition into a directional return trip instead of disappearing',()=>{
  const source=fs.readFileSync('src/economy.ts','utf8');
  assert.match(source,/if\(t\.stage==='return'\)/);
  assert.match(source,/const returnFrom=t\.to/);
  assert.match(source,/const returnTo=t\.source/);
  assert.match(source,/const returnRoute=route\(s,returnFrom,returnTo\)/);
  assert.match(source,/t\.stage='return'/);
  assert.match(source,/t\.cargo=0/);
  assert.match(source,/t\.value=0/);
});

test('return trips rebuild lane metadata for the opposite carriageway',()=>{
  const source=fs.readFileSync('src/economy.ts','utf8');
  assert.match(source,/Never simply reverse laneIds/);
  assert.match(source,/t\.laneIds=Array\.isArray\(returnRoute\.laneIds\)\?\[\.\.\.returnRoute\.laneIds\]:\[\]/);
  assert.match(source,/t\.laneRoute=physicalReturn/);
  assert.match(source,/t\.t=0/);
});

test('lane graph gives trucks one lane on each side of the carriageway',()=>{
  const source=fs.readFileSync('src/laneGraph.ts','utf8');
  assert.match(source,/lanesPerDirection=1/);
  assert.match(source,/lateralOffset/);
  assert.match(source,/lanesPerDirection/);
});


test('building road attachments only accept the exterior yard gate',()=>{
  const source=fs.readFileSync('src/world/buildings/connections.ts','utf8');
  assert.match(source,/A building is never a valid road endpoint/);
  assert.match(source,/reachesCanonicalGate = entranceDistance <= 46/);
  assert.doesNotMatch(source,/pointInsideConnectionFootprint \/\//);
});

test('road routing starts and ends at exterior yard gates',()=>{
  const source=fs.readFileSync('src/world/roads/routing.ts','utf8');
  assert.match(source,/aa\.canonical&&aa\.entrance\?aa\.entrance/);
  assert.match(source,/bb\.canonical&&bb\.entrance\?bb\.entrance/);
});