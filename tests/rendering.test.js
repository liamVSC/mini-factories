import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState} from '../dist/state.js';
import {seed} from '../dist/world/buildings/index.js';
import {savedBuildingToWorldPosition,projectWorldPointToNdc,buildingRenderTrace} from '../dist/rendering/buildingTransform.js';
import {buildingSitePlan} from '../dist/rendering/sitePlan.js';
import {buildingDockPoints,buildingRoadEntrance,buildingConnectionPoint} from '../dist/world/buildings/geometry.js';
import {roadTarget,segmentCrossesRiver} from '../dist/world/roads/placement.js';
import {addRoad} from '../dist/world/roads/creation.js';
import {serialise} from '../dist/persistence/save.js';
import {hydrate} from '../dist/persistence/load.js';

const readSource=url=>readFileSync(url,'utf8');

const ORTHOGRAPHIC_TEST_MATRIX=[
  .001,0,0,0,
  0,0,0,0,
  0,.001,1,0,
  0,0,0,1
];

test('saved building coordinates reach distinct rendered world positions',()=>{
  const s=freshState();
  assert.equal(seed(s),true);
  const traces=s.buildings.map(building=>({building,world:savedBuildingToWorldPosition(building)}));
  assert.equal(traces.length,6);
  const worldKeys=new Set(traces.map(t=>`${t.world.x},${t.world.z}`));
  assert.equal(worldKeys.size,traces.length);
  for(const {building,world} of traces){
    assert.equal(world.x,Number(building.x));
    assert.equal(world.z,Number(building.y));
  }
});

test('camera projection keeps seeded buildings visually distinct',()=>{
  const s=freshState();
  assert.equal(seed(s),true);
  const projected=s.buildings.map(building=>{
    const world=savedBuildingToWorldPosition(building);
    return projectWorldPointToNdc(world,ORTHOGRAPHIC_TEST_MATRIX);
  });
  assert.ok(projected.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  assert.equal(new Set(projected.map(p=>`${p.x.toFixed(9)},${p.y.toFixed(9)}`)).size,projected.length);
});

test('render trace preserves saved x/y through world x/z and projection',()=>{
  const building={id:'factory-a',kind:'factory',type:'Steel',x:-320,y:240};
  const world=savedBuildingToWorldPosition(building);
  const trace=buildingRenderTrace(building,world,ORTHOGRAPHIC_TEST_MATRIX);
  assert.deepEqual(trace.saved,{x:-320,y:240});
  assert.deepEqual(trace.world,{x:-320,z:240});
  assert.equal(trace.ndc.x,-.32);
  assert.equal(trace.ndc.y,.24);
  assert.ok(trace.clipW>0);
});

test('each logistics building has one canonical truck entrance',()=>{
  for(const kind of ['factory','warehouse','shop']){
    const building={id:`test-${kind}`,kind,x:100,y:200};
    const docks=buildingDockPoints(building);
    const entrance=buildingRoadEntrance(building);
    const snapped=buildingConnectionPoint(building,{x:900,y:-900});
    assert.ok(docks.length>=1);
    assert.ok(entrance);
    assert.deepEqual(snapped,{...entrance,building});
    assert.ok(Math.hypot(entrance.x-building.x,entrance.y-building.y)>40);
  }
});

test('site plans keep yard, gate, truck court and dock inside their footprint',()=>{
  for(const kind of ['factory','warehouse','shop']){
    const building={id:`site-${kind}`,kind,type:`${kind}-type`,x:340,y:-260};
    const plan=buildingSitePlan(building);
    assert.ok(plan);
    assert.ok(plan.width<=plan.shell.halfWidth*2);
    assert.ok(plan.depth<=plan.shell.halfDepth*2);
    assert.ok(plan.lotWidth<=plan.site.halfWidth*2);
    assert.ok(plan.lotDepth<=plan.site.halfDepth*2);
    assert.ok(Math.abs(plan.turnX)<=plan.courtWidth/2);
    assert.ok(Math.abs(plan.turnZ-plan.courtZ)<=plan.courtDepth/2);
    assert.equal(plan.gateZ,buildingRoadEntrance(building).y-building.y);
    assert.equal(buildingSitePlan(building).variant,plan.variant);
    assert.equal(plan.dockZ,buildingDockPoints(building)[0].point.y-building.y);
    for(const value of Object.values(plan))if(typeof value==='number')assert.ok(Number.isFinite(value));
  }
});

test('site plans and building positions survive save/load',()=>{
  const s=freshState();
  assert.equal(seed(s),true);
  const original=s.buildings.map(b=>({id:b.id,x:b.x,y:b.y,plan:buildingSitePlan(b)}));
  const loaded=hydrate(serialise(s));
  assert.ok(loaded);
  assert.deepEqual(loaded.buildings.map(b=>({id:b.id,x:b.x,y:b.y})),original.map(({id,x,y})=>({id,x,y})));
  assert.deepEqual(loaded.buildings.map(building=>buildingSitePlan(building)),original.map(({plan})=>plan));
});

test('canonical gate is stable regardless of approach direction',()=>{
  const building={id:'factory-entrance',kind:'factory',x:-120,y:80};
  const north=buildingConnectionPoint(building,{x:-120,y:900});
  const south=buildingConnectionPoint(building,{x:-120,y:-900});
  const east=buildingConnectionPoint(building,{x:900,y:80});
  assert.deepEqual(north,south);
  assert.deepEqual(south,east);
  assert.equal(north.x,buildingRoadEntrance(building).x);
  assert.equal(north.y,buildingRoadEntrance(building).y);
});

test('road snapping recognizes the canonical gate',()=>{
  for(const kind of ['factory','warehouse','shop']){
    const s=freshState();
    const building={id:`yard-${kind}`,kind,x:120,y:500};
    s.buildings.push(building);
    s.cash=5000;
    const entrance=buildingRoadEntrance(building);
    const snapped=roadTarget(s,{x:entrance.x+12,y:entrance.y});
    assert.equal(snapped.building,building);
    assert.deepEqual({x:snapped.x,y:snapped.y},{x:entrance.x,y:entrance.y});
    assert.equal(addRoad(s,[{x:snapped.x,y:snapped.y},{x:snapped.x+240,y:snapped.y}],{startBuilding:building}),true);
    assert.deepEqual(s.roads[0].points[0],{x:entrance.x,y:entrance.y});
  }
});

test('road renderer contains explicit anti-z-fighting surface layers and caps',()=>{
  const source=readSource(new URL('../src/rendering/roads.ts',import.meta.url));
  assert.match(source,/shoulderY=isBridge\?\.52:isTransition\?transitionHeights\(points\.length,\.12,rising\?\.52:\.12\):\.12/);
  assert.match(source,/asphaltY=isBridge\?\.72:isTransition\?transitionHeights\(points\.length,\.16,rising\?\.72:\.16\):\.16/);
  assert.match(source,/markY=isBridge\?\.9:isTransition\?transitionHeights\(points\.length,\.24,rising\?\.9:\.24\):\.24/);
  assert.match(source,/asphaltY\.at\(-1\).*\.01/);
  assert.match(source,/ribbon\(offsetPolyline\(points,side\*14\),1\.1,\.21,curb\)/;
  assert.match(source,/renderOrder=2\.05/);
});

test('road renderer keeps ordinary roads grounded and ramps bridge transitions',()=>{
  const source=readSource(new URL('../src/rendering/roads.ts',import.meta.url));
  assert.match(source,/transitionHeights\(count:number,start:number,end:number\)/);
  assert.match(source,/ribbon\(points,shoulderWidth,shoulderY,shoulder\)/);
  assert.match(source,/ribbon\(points,roadWidth,asphaltY,asphalt\)/);
  assert.match(source,/const rising=part\.kind==='transition'&&parts\[index\+1\]\?\.kind==='bridge'/);
  assert.match(source,/shoulder=ribbon\(path,46,\.12,apron\)/);
  assert.match(source,/surface=ribbon\(path,30,\.16,asphalt\)/);
});

test('road renderer uses rounded geometry, smooth paths and bounded miters',()=>{
  const source=readSource(new URL('../src/rendering/roads.ts',import.meta.url));
  assert.match(source,/export function rounded\(points:any\[\]\)/);
  assert.match(source,/export function smoothRoadPath\(points:any\[\]\)/);
  assert.match(source,/const radius=Math\.min\(30,inLen\*\.28,outLen\*\.28\)/);
  assert.match(source,/const denom=nx\*inNx\+nz\*inNz,miterScale=1\/Math\.max\(\.55,Math\.abs\(denom\)\)/);
  assert.match(source,/if\(miterScale<=1\.12\)scale=miterScale;else\{nx=inNx;nz=inNz;\}/);
});

test('road renderer handles caps, junctions, yards and bridge transitions',()=>{
  const source=readSource(new URL('../src/rendering/roads.ts',import.meta.url));
  assert.match(source,/function roadCaps\(points:Array<\{x:number;y:number\}>/);
  assert.match(source,/function bridgeRouteSegments\(points:Array<\{x:number;y:number\}>\)/);
  assert.match(source,/function roadJunctions\(roads:any\[\]\)/);
  assert.ok(source.includes('function junctionMesh(p:any,roadsAtPoint:number)'));
  assert.match(source,/function rebuildJunctionPatches\(roads:any\[\]\)/);
  assert.match(source,/export function roadYardTransitions\(s:any\)/);
});

test('road mesh and junction detection share the authoritative rounded polyline',()=>{
  const source=readSource(new URL('../src/rendering/roads.ts',import.meta.url));
  assert.match(source,/export function roadMesh\(r:any\)/);
  assert.match(source,/const p=rounded\(r\.points\|\|\[\]\),g=new THREE\.Group\(\)/);
  assert.match(source,/const a=rounded\(roads\[i\]\?\.points\|\|\[\]\),b=rounded\(roads\[j\]\?\.points\|\|\[\]\)/);
});

test('renderer facade delegates roads, buildings and trucks to focused modules',()=>{
  const source=readSource(new URL('../src/render3d-clean.ts',import.meta.url));
  assert.match(source,/new RenderScene\(\)/);
  assert.match(source,/new RenderCamera\(\)/);
  assert.match(source,/makeBuilding\(building\)/);
  assert.match(source,/buildRoadGroup\(state\.roads,state\)/);
  assert.match(source,/syncTrucks\(sceneRuntime\.root,truckMeshes,state\.trucks\)/);
  assert.match(source,/updateTrucks\(sceneRuntime\.root,truckMeshes,state\.trucks\)/);
  assert.match(source,/sceneRuntime\.render\(cameraRuntime\.threeCamera\)/);
  assert.doesNotMatch(source,/function smoothRoadPath\(/);
  assert.doesNotMatch(source,/function riverCrossingPoint\(/);
});

test('truck renderer reconciles meshes without rebuilding the static world',()=>{
  const source=readSource(new URL('../src/rendering/trucks.ts',import.meta.url));
  assert.match(source,/export function syncTrucks\(/);
  assert.match(source,/export function updateTrucks\(/);
  assert.match(source,/const active=new Set/);
  assert.match(source,/for\(const (truck|t) of trucks\|\|\[\]\)/);
});

test('bridge state requires an actual river crossing',()=>{
  assert.equal(segmentCrossesRiver({x:0,y:390},{x:0,y:410}),false);
  assert.equal(segmentCrossesRiver({x:0,y:300},{x:0,y:550}),true);
});

test('mobile lifecycle, viewport and WebGL recovery remain guarded',()=>{
  const lifecycle=readSource(new URL('../src/game/loop.ts',import.meta.url))+'\n'+readSource(new URL('../src/game/lifecycle.ts',import.meta.url));
  const camera=readSource(new URL('../src/game/camera.ts',import.meta.url))+'\n'+readSource(new URL('../src/game/input.ts',import.meta.url));
  const scene=readSource(new URL('../src/rendering/scene.ts',import.meta.url));
  const css=readSource(new URL('../styles.css',import.meta.url));
  assert.match(lifecycle,/function schedule\(\)/);
  assert.match(lifecycle,/if\(!running\|\|animationFrame\)return/);
  assert.match(lifecycle,/pagehide/);
  assert.match(lifecycle,/pageshow/);
  assert.match(lifecycle,/visibilitychange/);
  assert.match(lifecycle,/freeze/);
  assert.match(lifecycle,/save\(true\)/);
  assert.match(camera,/window\.visualViewport\?\.addEventListener\('resize',resize/);
  assert.match(camera,/window\.visualViewport\?\.addEventListener\('scroll',resize/);
  assert.match(camera,/event\.target===canvas/);
  assert.match(css,/body\{touch-action:manipulation/);
  assert.match(css,/\.panel,.pause \.box,.modal \.box\{touch-action:auto/);
  assert.match(css,/\.build-cards\{touch-action:pan-x/);
  assert.match(scene,/canvas\.addEventListener\('webglcontextlost'/);
  assert.match(scene,/canvas\.addEventListener\('webglcontextrestored'/);
  assert.match(scene,/contextRecoveryPending=true/);
  assert.match(scene,/contextRecoveryPending=false/);
  assert.match(scene,/innerWidth<700\?1\.25:2/);
});

test('renderer wrapper does not mutate road state every frame',()=>{
  const source=readSource(new URL('../src/render.ts',import.meta.url));
  assert.doesNotMatch(source,/s\.roads\.push/);
  assert.doesNotMatch(source,/s\.roads\.pop/);
  assert.match(source,/renderer3d\.render\(state,width,height,canvas\)/);
});

test('published game version stays aligned across app shell and service worker',()=>{
  const sw=readSource(new URL('../sw.js',import.meta.url));
  const html=readSource(new URL('../index.html',import.meta.url));
  const version=readSource(new URL('../src/version.ts',import.meta.url));
  assert.match(sw,/mini-factories-v220/);
  assert.match(sw,/VERSION='2\.1\.9'/);
  assert.match(sw,/dist\/game\.js\?v=9/);
  assert.match(sw,/render3d-clean\.js\?v=9/);
  assert.match(html,/dist\/game\.js\?v=9/);
  assert.match(version,/MINI_FACTORIES_VERSION='2\.1\.9'/);
});
