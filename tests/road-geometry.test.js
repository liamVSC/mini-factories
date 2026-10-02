import test from 'node:test';
import assert from 'node:assert/strict';
import {offsetRoadPath,roadDashSegments,smoothRoadPath} from '../src/rendering/roadGeometry.js';

test('road corner smoothing preserves endpoints and rounds right-angle joins',()=>{
  const source=[{x:0,y:0},{x:100,y:0},{x:100,y:100}];
  const smooth=smoothRoadPath(source);

  assert.deepEqual(smooth[0],source[0]);
  assert.deepEqual(smooth.at(-1),source.at(-1));
  assert.ok(smooth.length>4);
  assert.ok(smooth.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));
  assert.ok(smooth.every(point=>point.x>=0&&point.x<=100&&point.y>=0&&point.y<=100));
  assert.ok(!smooth.some(point=>point.x===100&&point.y===0),'the sharp corner should be replaced by a curve');
});

test('road corner smoothing handles short successive segments without overshooting',()=>{
  const source=[{x:0,y:0},{x:12,y:0},{x:12,y:8},{x:24,y:8}];
  const smooth=smoothRoadPath(source,18);

  assert.deepEqual(smooth[0],source[0]);
  assert.deepEqual(smooth.at(-1),source.at(-1));
  assert.ok(smooth.every(point=>point.x>=0&&point.x<=24&&point.y>=0&&point.y<=8));
});

test('road edges and markings follow smoothed path distance',()=>{
  const centerline=smoothRoadPath([{x:0,y:0},{x:100,y:0},{x:100,y:100}]);
  const edge=offsetRoadPath(centerline,15);
  const dashes=roadDashSegments(centerline,20,18);

  assert.equal(edge.length,centerline.length);
  assert.ok(edge.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));
  assert.ok(dashes.length>0);
  assert.ok(dashes.every(([start,end])=>Math.hypot(end.x-start.x,end.y-start.y)<=20.01));
});
