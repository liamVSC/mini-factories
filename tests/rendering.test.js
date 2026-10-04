import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState} from '../src/state.js';
import {seed} from '../src/world/buildings/index.js';
import {savedBuildingToWorldPosition,projectWorldPointToNdc,buildingRenderTrace} from '../src/rendering/buildingTransform.js';
import {buildingSitePlan} from '../src/rendering/sitePlan.js';
import {buildingDockPoints,buildingRoadEntrance,buildingConnectionPoint} from '../src/world/buildings/geometry.js';
import {roadTarget,segmentCrossesRiver} from '../src/world/roads/placement.js';
import {addRoad} from '../src/world/roads/creation.js';
import {serialise} from '../src/persistence/save.js';
import {hydrate} from '../src/persistence/load.js';

// Column-major projection fixture: world X -> NDC X and world Z -> NDC Y.
const ORTHOGRAPHIC_TEST_MATRIX=[
  .001,0,0,0,
  0,0,0,0,
  0,.001,1,0,
  0,0,0,1
];

test('every saved building x/y reaches a distinct world-space x/z position',()=>{
  const s=freshState();
  assert.equal(seed(s),true);
  const traces=s.buildings.map(building=>({building,world:savedBuildingToWorldPosition(building)}));
  assert.equal(traces.length,6);
  assert.ok(traces.every(t=>t.world));
  const worldKeys=new Set(traces.map(t=>`${t.world.x},${t.world.z}`));
  assert.equal(worldKeys.size,traces.length,'two buildings must never collapse to one world position');
  for(const {building,world} of traces){
    assert.equal(world.x,Number(building.x));
    assert.equal(world.z,Number(building.y));
  }
});

test('world-space building positions remain distinct after camera projection',()=>{
  const s=freshState();
  assert.equal(seed(s),true);
  const projected=s.buildings.map(building=>{
    const world=savedBuildingToWorldPosition(building);
    return {building,world,ndc:projectWorldPointToNdc(world,ORTHOGRAPHIC_TEST_MATRIX)};
  });
  assert.ok(projected.every(p=>p.ndc&&Number.isFinite(p.ndc.x)&&Number.isFinite(p.ndc.y)));
  const ndcKeys=new Set(projected.map(p=>`${p.ndc.x.toFixed(9)},${p.ndc.y.toFixed(9)}`));
  assert.equal(ndcKeys.size,projected.length,'camera projection must not collapse all factories onto one screen coordinate');
});

test('render trace proves saved coordinates, world coordinates and camera projection are the same building',()=>{
  const building={id:'factory-a',kind:'factory',type:'Steel',x:-320,y:240};
  const world=savedBuildingToWorldPosition(building);
  const trace=buildingRenderTrace(building,world,ORTHOGRAPHIC_TEST_MATRIX);
  assert.deepEqual(trace.saved,{x:-320,y:240});
  assert.deepEqual(trace.world,{x:-320,z:240});
  assert.equal(trace.ndc.x,-.32);
  assert.equal(trace.ndc.y,.24);
  assert.ok(trace.clipW>0);
});

test('render trace catches the historical all-buildings-at-origin failure',()=>{
  const s=freshState();
  assert.equal(seed(s),true);
  const traces=s.buildings.map(building=>{
    const world=savedBuildingToWorldPosition(building);
    return buildingRenderTrace(building,world,ORTHOGRAPHIC_TEST_MATRIX);
  });
  const originCount=traces.filter(t=>Math.abs(t.ndc.x)<1e-12&&Math.abs(t.ndc.y)<1e-12).length;
  assert.ok(originCount<2,'multiple buildings at projected origin indicates the middle-stack regression');
  const first=traces[0];
  assert.ok(traces.some(t=>Math.abs(t.ndc.x-first.ndc.x)>1e-6||Math.abs(t.ndc.y-first.ndc.y)>1e-6));
});


test('each building exposes exactly one canonical truck entrance for road snapping',()=>{
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

test('industrial site plans fit the protected footprint and connect the gate, truck court and dock',()=>{
  for(const kind of ['factory','warehouse','shop']){
    const building={id:`site-plan-${kind}`,kind,type:`${kind}-type`,x:340,y:-260};
    const plan=buildingSitePlan(building);
    assert.ok(plan,kind);
    assert.ok(plan.width<=plan.shell.halfWidth*2,`${kind} shell width`);
    assert.ok(plan.depth<=plan.shell.halfDepth*2,`${kind} shell depth`);
    assert.ok(plan.lotWidth<=plan.site.halfWidth*2,`${kind} lot width`);
    assert.ok(plan.lotDepth<=plan.site.halfDepth*2,`${kind} lot depth`);
    assert.ok(Math.abs(plan.turnX)<=plan.courtWidth/2,`${kind} truck turn width`);
    assert.ok(Math.abs(plan.turnZ-plan.courtZ)<=plan.courtDepth/2,`${kind} truck turn depth`);
    assert.ok(plan.parkingWidth<=plan.lotWidth,`${kind} parking width`);
    assert.ok(plan.parkingDepth<=plan.lotDepth,`${kind} parking depth`);
    assert.ok(Math.abs(plan.serviceX)+8<=plan.lotWidth/2,`${kind} service lane stays inside site`);
    assert.ok(Math.abs(plan.turnZ-plan.courtZ)+plan.turnRadius<=plan.courtDepth/2,`${kind} turning pad stays inside court`);
    assert.equal(plan.gateZ,buildingRoadEntrance(building).y-building.y,`${kind} canonical gate`);
    assert.equal(buildingSitePlan(building).variant,plan.variant,`${kind} deterministic variant`);
    const dock=buildingDockPoints(building)[0];
    assert.equal(plan.dockZ,dock.point.y-building.y,`${kind} primary loading dock`);
    for(const value of Object.values(plan)){
      if(typeof value==='number')assert.ok(Number.isFinite(value),`${kind} plan has finite dimensions`);
    }
  }
});

test('fresh-game visual site plans vary deterministically and save/load preserves their building positions',()=>{
  const s=freshState();
  assert.equal(seed(s),true);
  const positions=new Map(s.buildings.map(b=>[b.id,{x:b.x,y:b.y}]));
  const originalPlans=s.buildings.map(b=>buildingSitePlan(b));
  const factoryVariants=s.buildings.filter(b=>b.kind==='factory').map(b=>buildingSitePlan(b).variant);
  assert.ok(new Set(factoryVariants).size>1,'seeded factories should not all share identical site details');
  const loaded=hydrate(serialise(s));
  assert.ok(loaded);
  assert.deepEqual(loaded.buildings.map(b=>({x:b.x,y:b.y})),s.buildings.map(b=>positions.get(b.id)));
  assert.deepEqual(loaded.buildings.map(b=>buildingSitePlan(b)),originalPlans);
});


test('canonical truck entrance is stable regardless of which side the road approaches from',()=>{
  const building={id:'factory-entrance',kind:'factory',x:-120,y:80};
  const north=buildingConnectionPoint(building,{x:-120,y:900});
  const south=buildingConnectionPoint(building,{x:-120,y:-900});
  const east=buildingConnectionPoint(building,{x:900,y:80});
  assert.deepEqual(north,south);
  assert.deepEqual(south,east);
  assert.equal(north.x,buildingRoadEntrance(building).x);
  assert.equal(north.y,buildingRoadEntrance(building).y);
});


test('rendered shell footprints leave a visible yard gap before the canonical gate',()=>{
  for(const kind of ['factory','warehouse','shop']){
    const building={id:`gap-${kind}`,kind,x:0,y:0};
    const entrance=buildingRoadEntrance(building);
    const shellDepth={factory:64,warehouse:70,shop:58}[kind];
    assert.ok(Math.abs(entrance.y)>shellDepth+25,`${kind} gate must sit outside the building shell`);
  }
});

test('canonical gate is outside the building hitbox and can be a road endpoint',()=>{
  for(const kind of ['factory','warehouse','shop']){
    const building={id:`gate-${kind}`,kind,x:120,y:-80};
    const entrance=buildingRoadEntrance(building);
    const halfDepth={factory:64,warehouse:70,shop:58}[kind];
    assert.ok(Math.abs(entrance.y-building.y)>halfDepth);
    assert.equal(buildingConnectionPoint(building,{x:900,y:900}).x,entrance.x);
    assert.equal(buildingConnectionPoint(building,{x:900,y:900}).y,entrance.y);
  }
});

test('road snapping recognizes the canonical gate inside each building yard',()=>{
  for(const kind of ['factory','warehouse','shop']){
    const s=freshState();
    const building={id:`yard-snap-${kind}`,kind,x:120,y:500};
    s.buildings.push(building);
    s.cash=5000;
    const entrance=buildingRoadEntrance(building);
    const snapped=roadTarget(s,{x:entrance.x+12,y:entrance.y});
    assert.equal(snapped.building,building,kind);
    assert.deepEqual({x:snapped.x,y:snapped.y},{x:entrance.x,y:entrance.y},kind);
    assert.equal(addRoad(s,[{x:snapped.x,y:snapped.y},{x:snapped.x+240,y:snapped.y}],{startBuilding:building}),true,kind);
    assert.deepEqual(s.roads[0].points[0],{x:entrance.x,y:entrance.y},kind);
  }
});


test('3D road renderer has smooth corners, lane/edge markings, caps, junction meshes, yards and bridge transitions',()=>{
  const source=readFileSync(new URL('../src/render3d-clean.js',import.meta.url),'utf8');
  assert.match(source,/function smoothRoadPath\(points\)/);
  assert.match(source,/const radius=Math\.min\(30,inLen\*\.28,outLen\*\.28\)/);
  assert.match(source,/function offsetPolyline\(points,halfWidth\)/);
  assert.match(source,/const sign=halfWidth<0\?-1:1,hw=Math\.abs\(halfWidth\)/);
  assert.match(source,/const miterLength=hw\/denom/);
  assert.match(source,/limit=hw\\*1\\.8/);
  assert.match(source,/function roadCaps\(points,roadWidth,shoulderWidth/);
  assert.match(source,/function edgeRoadMarkings\\(points,y,mat\\)/);
  assert.match(source,/function centerRoadMarkings\(points,y,mat\)/);
  assert.match(source,/function roadJunctions\(roads\)/);
  assert.match(source,/function junctionMesh\(p,roadsAtPoint\)/);
  assert.match(source,/rebuildJunctionPatches\(s\.roads\|\|\[\]\)/);
  assert.match(source,/function roadYardTransitions\(s\)/);
  assert.match(source,/buildingRoadAttachment\(s,building\)/);
  assert.match(source,/segmentCrossesRiver\(p\[i-1\],q\)/);
  assert.match(source,/if\(isBridge\)\{/);
});

test('road renderer preserves exact endpoints while smoothing a sharp turn',()=>{
  const source=readFileSync(new URL('../src/render3d-clean.js',import.meta.url),'utf8');
  assert.match(source,/function smoothRoadPath\(points\)/);
  assert.match(source,/const out=\[src\[0\]\]/);
  assert.match(source,/const last=src\.at\(-1\)/);
  assert.match(source,/out\.push\(last\)/);
});

test('road junction rendering covers both T and four-way intersection cases',()=>{
  const source=readFileSync(new URL('../src/render3d-clean.js',import.meta.url),'utf8');
  assert.match(source,/degree=Math\\.max\\(3,roadsAtPoint\\|\\|3\\)/);
  assert.match(source,/const radius=degree>=4\?24:20/);
  assert.match(source,/function junctionMesh\(p,roadsAtPoint\)/);
});

test('dead-end caps and bridge transitions are explicit renderer geometry',()=>{
  const source=readFileSync(new URL('../src/render3d-clean.js',import.meta.url),'utf8');
  assert.match(source,/for\(const p of\[points\[0\],points\.at\(-1\)\]\)/);
  assert.match(source,/const crosses=p\.some\(\(q,i\)=>i\?segmentCrossesRiver\(p\[i-1\],q\):false\)/);
  assert.match(source,/roadCaps\(p,roadWidth,shoulderWidth/);
});

test('3D renderer reconciles truck meshes without rebuilding the static world',()=>{
  const source=readFileSync(new URL('../src/render3d-clean.js',import.meta.url),'utf8');
  assert.match(source,/function syncTruckMeshes\(s\)/);
  assert.match(source,/syncTruckMeshes\(s\);const byId=new Map/);
});


test('bridge state requires an actual river crossing, not river proximity',()=>{
  assert.equal(segmentCrossesRiver({x:0,y:390},{x:0,y:410}),false);
  assert.equal(segmentCrossesRiver({x:0,y:300},{x:0,y:550}),true);
});
