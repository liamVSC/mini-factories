import test from 'node:test';
import assert from 'node:assert/strict';
import {truckRenderPose} from '../src/rendering/truckMotion.js';

test('truck render pose follows the physical lane route instead of the road centerline',()=>{
  const pose=truckRenderPose({
    route:[{x:0,y:0},{x:100,y:0}],
    laneRoute:[{x:0,y:-7},{x:100,y:-7}],
    t:.5
  });

  assert.ok(pose);
  assert.equal(pose.x,50);
  assert.equal(pose.y,-7);
  assert.ok(Math.abs(pose.yaw)<1e-9);
});

test('truck render pose uses stable forward heading through curved turns',()=>{
  const pose=truckRenderPose({
    route:[{x:0,y:0},{x:100,y:0},{x:100,y:100}],
    laneRoute:[{x:0,y:-7},{x:75,y:-7},{x:90,y:-5},{x:100,y:8},{x:100,y:100}],
    t:.46
  });

  assert.ok(pose);
  assert.ok(pose.x>90&&pose.x<=100);
  assert.ok(pose.y>-5);
  assert.ok(pose.yaw<0&&pose.yaw> -Math.PI/2);
});

test('truck render pose falls back to centerline for old saves and handles route ends',()=>{
  const truck={route:[{x:0,y:0},{x:100,y:0}],t:1};
  const pose=truckRenderPose(truck);

  assert.deepEqual({x:pose.x,y:pose.y},{x:100,y:0});
  assert.ok(Number.isFinite(pose.yaw));
  assert.equal(truckRenderPose({route:[{x:0,y:0}],t:.5}),null);
});
