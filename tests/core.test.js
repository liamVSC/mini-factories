import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,hydrateState} from '../src/state.js';
import {seed} from '../src/world/buildings/index.js';
import {segmentCrossesRiver} from '../src/world/terrain.js';
import {length,pointOnRoute} from '../src/economy.js';

test('seed is a one-time initialization transaction',()=>{
  const s=freshState();
  assert.equal(seed(s),true);
  assert.equal(s.seeded,true);
  assert.ok(s.buildings.length>0);
  assert.equal(seed(s),false);
});

test('seed refuses to initialize a partially populated world',()=>{
  const s=freshState();
  s.buildings.push({id:'partial',kind:'factory',x:0,y:0,type:'Steel'});
  assert.equal(seed(s),false);
  assert.equal(s.seeded,false);
});

test('seed marker survives save/load and legacy populated saves become initialized',()=>{
  const s=freshState();
  seed(s);
  const hydrated=hydrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(hydrated.seeded,true);
  const legacy=hydrateState({buildings:[{id:'legacy',kind:'factory',x:100,y:100,type:'Steel'}],roads:[]});
  assert.equal(legacy.seeded,true);
});

test('world bounds and renderer coordinate contract remain consistent',()=>{
  assert.equal(segmentCrossesRiver({x:-200,y:480},{x:200,y:480}),false);
  assert.equal(segmentCrossesRiver({x:-200,y:300},{x:200,y:520}),true);
  assert.equal(segmentCrossesRiver({x:0,y:300},{x:0,y:540}),true);
});

test('game version has one central runtime source',()=>{
  assert.equal(globalThis.MINI_FACTORIES_VERSION,'1.5');
  assert.equal(globalThis.MINI_FACTORIES_VERSION_DATE,'2 Oct 2026');
});

test('route interpolation follows distance, not point index',()=>{
  const path=[{x:0,y:0},{x:100,y:0},{x:100,y:300}];
  assert.equal(length(path),400);
  assert.deepEqual(pointOnRoute(path,0),{x:0,y:0});
  assert.deepEqual(pointOnRoute(path,.25),{x:100,y:0});
});

test('fresh state contains render version and empty truck list',()=>{
  const s=freshState();
  assert.equal(s.renderVersion,1);
  assert.deepEqual(s.trucks,[]);
});
