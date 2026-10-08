import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.innerWidth=1280;
globalThis.innerHeight=720;

import {freshState,makeBuilding} from '../dist/state.js';
import {serialise} from '../dist/persistence/save.js';
import {hydrate} from '../dist/persistence/load.js';
import {addRoad,routeOnRoadNetwork,roadNetwork,roadAttachment,buildingRoadAttachment,buildingLogisticsAccess,endpointTarget,WORLD_HALF_SIZE,WORLD_MARGIN,WORLD_BOUNDS,isInsideWorldBounds} from '../dist/world.js';
import * as commands from '../dist/commands.js';
import {resolveBuildingRoadEndpoint} from '../dist/world/buildings/connections.js';
import {roadPathBlocked,roadPathIntersectsBuildingFootprint} from '../dist/world/roads/placement.js';
import {buildLaneGraph,findLaneRoute,laneRouteToNodePath,laneRouteGeometry} from '../dist/laneGraph.js';
import {createCommandHistory,AddRoadCommand,PlaceBuildingCommand,DeleteRoadCommand} from '../dist/commands.js';
import {seed} from '../dist/world/buildings/index.js';
import {factorySpawnCandidates,validateBuildingLayout,layoutIsValid} from '../dist/world/buildings/layout.js';
import {buildingFootprint,buildingSiteFootprint,buildingVisualFootprint,buildingPrimaryDock,buildingRoadEntrance,buildingRoadHitbox} from '../dist/world/buildings/geometry.js';

import {buildJunctionControls,movementPermission,stopLinePoint} from '../dist/junctionControl.js';

test('game version has exactly one source of truth',()=>{const source=readFileSync(new URL('../src/version.ts',import.meta.url),'utf8');const runtime=readFileSync(new URL('../dist/version.js',import.meta.url),'utf8');const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');assert.equal(source.includes("globalThis.MINI_FACTORIES_VERSION='1';"),true);assert.equal(runtime.includes("globalThis.MINI_FACTORIES_VERSION = '1';"),true);assert.equal(sw.includes('const VERSION='),false);assert.equal(sw.includes('version:VERSION'),false);});
test('hydrate drops unknown building kinds and repairs duplicate building ids',()=>{const loaded=hydrate({version:6,buildings:[{id:'building-1',type:'Food',kind:'factory',x:0,y:-108},{id:'building-1',type:'Market',kind:'shop',x:400,y:108},{id:'bad',type:'Broken',kind:'invalid',x:800,y:0}],roads:[]});assert.ok(loaded);assert.equal(loaded.buildings.length,2);assert.equal(new Set(loaded.buildings.map(b=>b.id)).size,2);assert.equal(loaded.buildings.every(b=>['factory','shop','warehouse'].includes(b.kind)),true);});
test('hydrate drops invalid roads and repairs duplicate road ids',()=>{const s=freshState();const loaded=hydrate({version:6,buildings:[],roads:[{id:'road-1',points:[{x:0,y:0},{x:40,y:0}],condition:2,age:-4},{id:'road-1',points:[{x:0,y:20},{x:40,y:20}],condition:-1,age:3},{id:'outside',points:[{x:2000,y:0},{x:2100,y:0}]}]});assert.ok(loaded);assert.equal(loaded.roads.length,2);assert.equal(new Set(loaded.roads.map(r=>r.id)).size,2);assert.equal(loaded.roads[0].condition,1);assert.equal(loaded.roads[0].age,0);assert.ok(loaded.roads.every(r=>r.points.every(p=>Math.abs(p.x)<=1276&&Math.abs(p.y)<=1276)));});
test('seed is a one-time initialization transaction',()=>{
  const s=freshState();
  assert.equal(s.seeded,false);
  assert.equal(seed(s),true);
  assert.equal(s.seeded,true);
  assert.equal(s.buildings.length,6);
  const ids=s.buildings.map(b=>b.id);
  assert.equal(seed(s),false);
  assert.equal(s.buildings.length,6);
  assert.deepEqual(s.buildings.map(b=>b.id),ids);
});

test('seed refuses to initialize a partially populated world',()=>{
  const s=freshState();
  s.buildings.push(makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,0,'existing'));
  const before=s.buildings.slice();
  assert.equal(seed(s),false);
  assert.equal(s.seeded,false);
  assert.deepEqual(s.buildings,before);
});

test('seed marker survives save/load and legacy populated saves become initialized',()=>{
  const s=freshState();
  assert.equal(seed(s),true);
  const loaded=hydrate(serialise(s));
  assert.ok(loaded);
  assert.equal(loaded.seeded,true);
  assert.equal(seed(loaded),false);

  const legacy=serialise(s);
  delete legacy.seeded;
  const legacyLoaded=hydrate(legacy);
  assert.ok(legacyLoaded);
  assert.equal(legacyLoaded.seeded,true);
  assert.equal(seed(legacyLoaded),false);
});

test('lane graph creates directional lanes and connects through a four-way junction',()=>{const s=freshState();s.roads.push({id:'west',points:[{x:-120,y:0},{x:0,y:0}],bridge:false,condition:1,age:0},{id:'east',points:[{x:0,y:0},{x:120,y:0}],bridge:false,condition:1,age:0},{id:'north',points:[{x:0,y:-120},{x:0,y:0}],bridge:false,condition:1,age:0},{id:'south',points:[{x:0,y:0},{x:0,y:120}],bridge:false,condition:1,age:0});const network=roadNetwork(s),graph=buildLaneGraph(network);assert.equal(graph.lanes.length,network.edges.length*2);const east=network.nodes.find(n=>Math.abs(n.x-120)<1e-9&&Math.abs(n.y)<1e-9);assert.ok(east);const route=findLaneRoute(graph,network.nodes.find(n=>Math.abs(n.x+120)<1e-9&&Math.abs(n.y)<1e-9),east);assert.ok(route);assert.ok(route.laneIds.length>=2);assert.ok(laneRouteToNodePath(graph,route.laneIds).length>=3);});
test('routeOnRoadNetwork returns lane metadata while preserving canonical centreline geometry',()=>{const s=freshState(),factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},-120,-108,'factory-1'),shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},120,99,'shop-1');s.buildings.push(factory,shop);assert.equal(addRoad(s,[{x:-120,y:0},{x:120,y:0}],{startBuilding:factory,endBuilding:shop}),true);const route=routeOnRoadNetwork(s,factory,shop);assert.ok(route);assert.ok(Array.isArray(route.laneIds));assert.ok(route.laneIds.length>=1);assert.ok(Array.isArray(route.lanePoints));assert.ok(route.lanePoints.length>=2);assert.ok(route.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));});
test('command history makes road/building mutations pass through one execution path',()=>{const s=freshState(),history=createCommandHistory(),factoryType={name:'Food',kind:'factory',need:null,color:'#fff',price:18,speed:1,value:1,qty:1},placed=history.execute(s,new PlaceBuildingCommand(factoryType,0,-300));assert.equal(placed.ok,true);assert.equal(s.buildings.length,1);const gate=buildingRoadEntrance(s.buildings[0]);
  const road=history.execute(s,new AddRoadCommand([{x:gate.x,y:gate.y},{x:gate.x+300,y:gate.y}],{startBuilding:s.buildings[0]}));assert.equal(road.ok,true);assert.equal(s.roads.length,1);const deletePoint=s.roads[0].points[0];
const deleted=history.execute(s,new DeleteRoadCommand(deletePoint));assert.equal(deleted.ok,true);assert.equal(s.roads.length,0);assert.equal(history.undo(s),true);assert.equal(s.roads.length,1);});
test('lane geometry applies approach offsets and curved turn transitions',()=>{const s=freshState();s.roads.push({id:'in',points:[{x:-140,y:0},{x:0,y:0}],bridge:false,condition:1,age:0},{id:'out',points:[{x:0,y:0},{x:0,y:140}],bridge:false,condition:1,age:0});const graph=buildLaneGraph(roadNetwork(s)),start=graph.nodes.find(n=>Math.abs(n.x+140)<1e-9&&Math.abs(n.y)<1e-9),end=graph.nodes.find(n=>Math.abs(n.x)<1e-9&&Math.abs(n.y-140)<1e-9),route=findLaneRoute(graph,start,end);assert.ok(route);const geometry=laneRouteGeometry(graph,route.laneIds);assert.ok(geometry.points.length>route.laneIds.length*2);assert.equal(geometry.transitions[0].type,'left');assert.equal(geometry.transitions[0].offset,7);});
test('traffic signal state is persisted safely in hydrated game state',()=>{const s=freshState();s.trafficSignals.enabled=true;s.trafficSignals.cycle=18;const hydrated=hydrate(serialise(s));assert.equal(hydrated.trafficSignals.enabled,true);assert.equal(hydrated.trafficSignals.cycle,18);});
test('junction movement classification uses canonical route geometry',async()=>{const s=freshState();s.roads.push({id:'a',points:[{x:-120,y:0},{x:0,y:0}],bridge:false,condition:1,age:0},{id:'b',points:[{x:0,y:0},{x:0,y:120}],bridge:false,condition:1,age:0});const route=routeOnRoadNetwork(s,{x:-120,y:0,r:20},{x:0,y:120,r:20});assert.ok(route);assert.ok(route.lanePoints.length>=route.points.length);assert.equal(route.laneTransitions[0].type,'left');});
test('explicit junction controls expose movements, conflicts and stop lines',()=>{const s=freshState();s.roads.push({id:'west',points:[{x:-120,y:0},{x:0,y:0}],bridge:false,condition:1,age:0},{id:'east',points:[{x:0,y:0},{x:120,y:0}],bridge:false,condition:1,age:0},{id:'north',points:[{x:0,y:-120},{x:0,y:0}],bridge:false,condition:1,age:0},{id:'south',points:[{x:0,y:0},{x:0,y:120}],bridge:false,condition:1,age:0});const network=roadNetwork(s),graph=buildLaneGraph(network),controls=buildJunctionControls(network,graph),control=[...controls.values()].find(c=>Math.abs(c.node.x)<1e-9&&Math.abs(c.node.y)<1e-9);assert.ok(control);assert.ok(control.movements.some(m=>m.type==='straight'));assert.ok(control.movements.some(m=>m.type==='left'));assert.ok(control.movements.some(m=>m.type==='right'));const movement=control.movements.find(m=>m.type==='straight');assert.ok(movement);assert.ok(movement.stopLineDistance>0);assert.ok(stopLinePoint(graph,movement));const permission=movementPermission(s,controls,control.node,movement,{occupiedIds:control.conflicts.get(movement.id)||[]});assert.equal(permission.allowed,false);});
test('explicit junction signals block yellow and red movements deterministically',()=>{const s=freshState();s.trafficSignals.enabled=true;s.trafficSignals.cycle=12;s.roads.push({id:'west',points:[{x:-120,y:0},{x:0,y:0}],bridge:false,condition:1,age:0},{id:'east',points:[{x:0,y:0},{x:120,y:0}],bridge:false,condition:1,age:0},{id:'north',points:[{x:0,y:-120},{x:0,y:0}],bridge:false,condition:1,age:0},{id:'south',points:[{x:0,y:0},{x:0,y:120}],bridge:false,condition:1,age:0});const network=roadNetwork(s),graph=buildLaneGraph(network),controls=buildJunctionControls(network,graph),control=[...controls.values()].find(c=>c.id==='0,0'),horizontal=control.movements.find(m=>Math.abs(m.approachDirection.x)>.8);assert.ok(horizontal);s.trafficClock=0;const first=movementPermission(s,controls,control.node,horizontal);s.trafficClock=6;const second=movementPermission(s,controls,control.node,horizontal);assert.notEqual(first.signal.state,second.signal.state);});
test('world bounds and renderer coordinate contract remain consistent',()=>{assert.equal(WORLD_HALF_SIZE,1300);assert.equal(WORLD_BOUNDS.minX,-1300);assert.equal(WORLD_BOUNDS.maxX,1300);assert.equal(isInsideWorldBounds({x:0,y:0}),true);assert.equal(isInsideWorldBounds({x:WORLD_HALF_SIZE,y:0}),false);assert.equal(WORLD_MARGIN,24);});


test('building-road attachment has one canonical source shared by routing compatibility export',()=>{
  const s=freshState();
  const building=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,-108,'factory-1');
  s.buildings.push(building);
  s.roads.push({id:'road-1',points:[{x:35,y:0},{x:180,y:0}],bridge:false,condition:1,age:0});
  const canonical=buildingRoadAttachment(s,building);
  const compatibility=roadAttachment(s,building);
  assert.deepEqual(compatibility,canonical);
  assert.equal(compatibility.road.id,'road-1');
  assert.ok(Number.isFinite(compatibility.point.x));
  assert.ok(Number.isFinite(compatibility.point.y));
});

test('road paths cannot begin inside or cross a building footprint',()=>{const s=freshState();const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,-108,'factory-1');s.buildings.push(factory);const path=[{x:factory.x,y:factory.y},{x:factory.x+220,y:factory.y}];assert.equal(roadPathBlocked(s,path),true);assert.equal(roadPathIntersectsBuildingFootprint(s,path),true);});
test('road topology connects true T junctions without falsely joining parallel roads',()=>{const s=freshState();s.roads.push({id:'main',points:[{x:-120,y:0},{x:120,y:0}],bridge:false,condition:1,age:0},{id:'branch',points:[{x:0,y:50},{x:0,y:6}],bridge:false,condition:1,age:0});const network=roadNetwork(s);assert.ok(network.junctions.some(p=>Math.abs(p.x)<1e-9&&Math.abs(p.y)<1e-9));const parallel=freshState();parallel.roads.push({id:'a',points:[{x:-120,y:0},{x:120,y:0}],bridge:false,condition:1,age:0},{id:'b',points:[{x:-120,y:8},{x:120,y:8}],bridge:false,condition:1,age:0});assert.equal(roadNetwork(parallel).junctions.length,0);});
test('renderer isolates invalid world objects so UI and base map can still start',()=>{const source=readFileSync(new URL('../src/render3d-clean.ts',import.meta.url),'utf8');assert.equal(source.includes('try{sceneRuntime.root.add(buildRoadGroup(state.roads,state));}'),true);assert.equal(source.includes("catch(error){console.warn('Mini Factories: road renderer recovered"),true);assert.equal(source.includes("worldKey=buildingKey(state)+'|'+roadKey(state);"),true);});
test('road renderer protects building footprints and raises the roadside path',()=>{const source=readFileSync(new URL('../src/rendering/roads.ts',import.meta.url),'utf8');assert.match(source,/roadPathBlocked\(state,p,endpointBuildings\)/);assert.match(source,/p=rounded\(r\.points\|\|\[\]\)/);assert.match(source,/roadNetwork\(state\)/);assert.match(source,/\.34.*apron/);assert.match(source,/curbY=.*\.46/);});
test('camera supports pan and desktop orbit controls',()=>{
  const input=readFileSync(new URL('../src/game/input.ts',import.meta.url),'utf8');
  const camera=readFileSync(new URL('../src/game/camera.ts',import.meta.url),'utf8');
  assert.equal(input.includes('cameraGesture.button===2||cameraGesture.button===1'),true);
  assert.equal(input.includes("contextmenu',event=>event.preventDefault()"),true);
  assert.equal(camera.includes('function orbit(dx:number,dy:number)'),true);
  assert.equal(camera.includes('controlCamera(0,0,0,-dx*0.008,-dy*0.006)'),true);
});
test('PWA startup and service-worker updates never force a reload loop',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.equal(html.includes("navigator.serviceWorker?.addEventListener?.('controllerchange',()=>{if(refreshing)location.reload()});"),true);
  assert.equal(html.includes('unregister()'),false);assert.equal(html.includes("postMessage({type:'SKIP_WAITING'})"),true);assert.equal(html.includes('setTimeout(()=>{if(document.visibilityState===\'visible\')location.reload()},700)'),false);
});
test('road endpoint editing is not exposed as a command or UI control',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.equal(html.includes('roadEditMove'),false);
  assert.equal(typeof commands.MoveRoadEndpointCommand,'undefined');
});
test('road creation uses the canonical building endpoint connection',()=>{
  const s=freshState();
  s.cash=5000;
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,-108,'factory-1');
  s.buildings.push(factory);
  const expected=resolveBuildingRoadEndpoint(s,{x:0,y:0},factory,{x:180,y:0});
  assert.ok(expected);
  assert.equal(addRoad(s,[{x:0,y:0},{x:180,y:0}],{startBuilding:factory}),true);
  assert.deepEqual(s.roads[0].points[0],{x:expected.point.x,y:expected.point.y});
});

test('road endpoint editing uses the canonical building target',()=>{
  const s=freshState();
  s.cash=5000;
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,-108,'factory-1');
  s.buildings.push(factory);
  assert.equal(addRoad(s,[{x:100,y:0},{x:260,y:0}]),true);
  const target=endpointTarget(s,{x:10,y:0},s.roads[0],0);
  assert.equal(target.building,factory);
  assert.ok(Number.isFinite(target.x)&&Number.isFinite(target.y));
});

test('building logistics uses the same canonical road attachment',()=>{
  const s=freshState();
  s.cash=5000;
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,-108,'factory-1');
  s.buildings.push(factory);
  s.roads.push({id:'road-1',points:[{x:40,y:0},{x:180,y:0}],bridge:false,condition:1,age:0});
  const attachment=buildingRoadAttachment(s,factory);
  const logistics=buildingLogisticsAccess(s,factory);
  assert.ok(attachment);
  assert.ok(logistics);
  assert.equal(logistics.road,attachment.road);
  assert.deepEqual(logistics.roadPoint,attachment.point);
});

test('disconnected and deleted roads produce no stale building logistics relationship',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,-108,'factory-1');
  const shop=makeBuilding({name:'Market',kind:'shop',need:'Food',color:'#fff'},500,99,'shop-1');
  s.buildings.push(factory,shop);
  s.roads.push({id:'road-a',points:[{x:40,y:0},{x:180,y:0}],bridge:false,condition:1,age:0});
  s.roads.push({id:'road-b',points:[{x:540,y:0},{x:680,y:0}],bridge:false,condition:1,age:0});
  assert.ok(buildingRoadAttachment(s,factory));
  assert.ok(buildingRoadAttachment(s,shop));
  const before=buildingLogisticsAccess(s,factory);
  assert.ok(before);
  s.roads=s.roads.filter(r=>r.id!=='road-a');
  assert.equal(buildingRoadAttachment(s,factory),null);
  assert.equal(buildingLogisticsAccess(s,factory),null);
});

test('save/load preserves valid derived building-road relationships and drops stale ones',()=>{
  const s=freshState();
  const factory=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},0,-108,'factory-1');
  s.buildings.push(factory);
  s.roads.push({id:'road-1',points:[{x:40,y:0},{x:180,y:0}],bridge:false,condition:1,age:0});
  const loaded=hydrate(serialise(s));
  assert.ok(loaded);
  assert.ok(buildingRoadAttachment(loaded,loaded.buildings[0]));
  assert.ok(buildingLogisticsAccess(loaded,loaded.buildings[0]));
  loaded.roads=[];
  assert.equal(buildingRoadAttachment(loaded,loaded.buildings[0]),null);
  assert.equal(buildingLogisticsAccess(loaded,loaded.buildings[0]),null);
});


test('factory placement footprint covers the rendered site envelope',()=>{
  const footprint=buildingSiteFootprint({kind:'factory'});
  const visual=buildingVisualFootprint({kind:'factory'});
  assert.deepEqual(footprint,visual);
  assert.ok(footprint.halfWidth>=50);
  assert.ok(footprint.halfDepth>=58);
});

test('building yards have a single canonical truck gate inside the protected site envelope',()=>{
  for(const kind of ['factory','warehouse','shop']){
    const building={id:kind,x:0,y:0,kind};
    const footprint=buildingVisualFootprint(building);
    const entrance=buildingRoadEntrance(building);
    const dock=buildingPrimaryDock(building);
    const shell=buildingRoadHitbox(building,0);
    assert.ok(entrance&&dock,kind);
    assert.deepEqual(dock,buildingPrimaryDock(building));
    const withinEnvelope=
      Math.abs(entrance.x)<=footprint.halfWidth &&
      Math.abs(entrance.y)<=footprint.halfDepth;
    assert.equal(withinEnvelope,true,kind);
    const outsideShell=
      entrance.x<shell.minX||entrance.x>shell.maxX||
      entrance.y<shell.minY||entrance.y>shell.maxY;
    assert.equal(outsideShell,true,kind);
  }
});

test('factory spawn candidates are spatially separated from the world centre',()=>{
  const candidates=factorySpawnCandidates(12345,0);
  assert.equal(candidates.length,3);
  for(const point of candidates){
    assert.ok(Math.hypot(point.x,point.y)>=720);
    assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
  }
});

test('layout validation rejects duplicate factory world positions',()=>{
  const a=makeBuilding({name:'Steel',kind:'factory',need:null,color:'#fff'},-820,0,'factory-a');
  const b=makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},-820,0,'factory-b');
  const issues=validateBuildingLayout([a,b]);
  assert.ok(issues.some(issue=>issue.type==='stacked-position'));
  assert.equal(layoutIsValid([a,b]),false);
});

test('seeded factories have unique positions and a valid hardened layout',()=>{
  const s=freshState();
  assert.equal(seed(s),true);
  const factories=s.buildings.filter(building=>building.kind==='factory');
  assert.equal(factories.length,3);
  assert.equal(new Set(factories.map(b=>`${b.x},${b.y}`)).size,3);
  assert.equal(layoutIsValid(s.buildings),true);
});
