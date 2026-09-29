import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.innerWidth=1280;
globalThis.innerHeight=720;

const {freshState,makeBuilding,hydrate,serialise}=await import('../src/state.js');
const {pointOnRoute,length}=await import('../src/world.js');

test('route interpolation follows distance, not point index',()=>{
  const route=[{x:0,y:0},{x:100,y:0},{x:100,y:300}];
  assert.equal(length(route),400);
  assert.deepEqual(pointOnRoute(route,0),{x:0,y:0});
  assert.deepEqual(pointOnRoute(route,.25),{x:100,y:0});
  assert.deepEqual(pointOnRoute(route,.5),{x:100,y:100});
  assert.deepEqual(pointOnRoute(route,1),{x:100,y:300});
});

test('fresh state contains render version and empty truck list',()=>{
  const s=freshState();
  assert.equal(s.renderVersion,0);
  assert.deepEqual(s.trucks,[]);
});

test('hydrate preserves valid buildings and normalises render state',()=>{
  const s=freshState();
  s.buildings.push(makeBuilding({name:'Food',kind:'factory',need:null,color:'#fff'},100,200,'factory-1'));
  const saved=serialise(s);
  saved.renderVersion='12';
  saved.trucks=[{id:'stale'}];
  const loaded=hydrate(saved);
  assert.ok(loaded);
  assert.equal(loaded.renderVersion,12);
  assert.equal(loaded.buildings.length,1);
  assert.equal(loaded.buildings[0].x,100);
  assert.deepEqual(loaded.trucks,[]);
});
