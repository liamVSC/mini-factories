import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState} from '../src/state.js';
import {seed} from '../src/world/buildings/index.js';
import {savedBuildingToWorldPosition,projectWorldPointToNdc,buildingRenderTrace} from '../src/rendering/buildingTransform.js';
import {buildingDockPoints,buildingRoadEntrance,buildingConnectionPoint} from '../src/world/buildings/geometry.js';

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
