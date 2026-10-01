import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.innerWidth=1280;
globalThis.innerHeight=720;

import {freshState,makeBuilding} from '../src/state.js';
import {addRoad,routeOnRoadNetwork,roadNetwork} from '../src/world.js';
import {buildLaneGraph,findLaneRoute,laneRouteToNodePath,laneRouteGeometry} from '../src/laneGraph.js';
import {createCommandHistory,AddRoadCommand,PlaceBuildingCommand,DeleteRoadCommand} from '../src/commands.js';

test('lane graph creates directional lanes and connects through a four-way junction',()=>{
  const s=freshState();
  s.roads.push(
    {id:'west',points:[{x:-120,y:0},{x:0,y:0}],bridge:false,condition:1,age:0},
    {id:'east',points:[{x:0,y:0},{x:120,y:0}],bridge:false,condition:1,age:0},
    {id:'north',points:[{x:0,y:-120},{x:0,y:0}],bridge:false,condition:1,age:0},
    {id:'south',points:[{x:0,y:0},{x:0,y:120}],bridge:false,condition:1,age:0}
  );
  const network=roadNetwork(s);
  const graph=buildLaneGraph(network);
  assert.equal(graph.lanes.length,network.edges.length*2);
  const west=network.nodes.find(n=>Math.abs(n.x)<1e-9&&Math.abs(n.y)<1e-9);
  const east=network.nodes.find(n=>Math.abs(n.x-120)<1e-9&&Math.abs(n.y)<1e-9);
  assert.ok(west&&east);
  const route=findLaneRoute(graph,network.nodes.find(n=>Math.abs(n.x+120)<1e-9&&Math.abs(n.y)<1e-9),east);
  assert.ok(route);
  assert.ok(route.laneIds.length>=2);
  assert.ok(laneRouteToNodePath(graph,route.laneIds).length>=3);
});

test('routeOnRoadNetwork returns lane metadata while preserving canonical centreline geometry',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},-120,0,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},120,0,'shop-1');
  s.buildings.push(factory,shop);
  assert.equal(addRoad(s,[{x:-120,y:0},{x:120,y:0}],{startBuilding:factory,endBuilding:shop}),true);
  const route=routeOnRoadNetwork(s,factory,shop);
  assert.ok(route);
  assert.ok(Array.isArray(route.laneIds));
  assert.ok(route.laneIds.length>=1);
  assert.ok(Array.isArray(route.lanePoints));
  assert.ok(route.lanePoints.length>=2);
  assert.ok(route.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});

test('command history makes road/building mutations pass through one execution path',()=>{
  const s=freshState();
  const history=createCommandHistory();
  const factoryType={name:'Food',kind:'factory',need:null,color:'#fff',price:18,speed:1,value:1,qty:1};
  const placed=history.execute(s,new PlaceBuildingCommand(factoryType,0,300));
  assert.equal(placed.ok,true);
  assert.equal(s.buildings.length,1);
  const road=history.execute(s,new AddRoadCommand([{x:0,y:300},{x:300,y:300}],{startBuilding:s.buildings[0]}));
  assert.equal(road.ok,true);
  assert.equal(s.roads.length,1);
  const deleted=history.execute(s,new DeleteRoadCommand({x:150,y:300}));
  assert.equal(deleted.ok,true);
  assert.equal(s.roads.length,0);
  assert.equal(history.undo(s),true);
  assert.equal(s.roads.length,1);
});


test('lane geometry applies approach offsets and curved turn transitions',()=>{
  const s=freshState();
  s.roads.push(
    {id:'in',points:[{x:-140,y:0},{x:0,y:0}],bridge:false,condition:1,age:0},
    {id:'out',points:[{x:0,y:0},{x:0,y:140}],bridge:false,condition:1,age:0}
  );
  const graph=buildLaneGraph(roadNetwork(s));
  const start=graph.nodes.find(n=>Math.abs(n.x+140)<1e-9&&Math.abs(n.y)<1e-9);
  const end=graph.nodes.find(n=>Math.abs(n.x)<1e-9&&Math.abs(n.y-140)<1e-9);
  const route=findLaneRoute(graph,start,end);
  assert.ok(route);
  const geometry=laneRouteGeometry(graph,route.laneIds);
  assert.ok(geometry.points.length>route.laneIds.length*2);
  assert.equal(geometry.transitions[0].type,'left');
  assert.equal(geometry.transitions[0].offset,7);
});

test('traffic signal state is persisted safely in hydrated game state',()=>{
  const {hydrate,serialise}=await import('../src/state.js');
  const s=freshState();
  s.trafficSignals.enabled=true;
  s.trafficSignals.cycle=18;
  const hydrated=hydrate(serialise(s));
  assert.equal(hydrated.trafficSignals.enabled,true);
  assert.equal(hydrated.trafficSignals.cycle,18);
});
