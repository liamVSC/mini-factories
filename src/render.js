import * as renderer3d from './render3d.js';

let previewState=null;

export function render(s,W,H,canvas=document.querySelector('#game')){
  renderer3d.render(null,s,W,H,canvas);
}
export function setPreview(path,start,end,blocked=false){
  previewState={path,start,end,blocked,points:path};
  renderer3d.setPreview(path,start,end,blocked);
}
export function resizeRenderer(W,H){renderer3d.resizeRenderer(W,H)}
export function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){renderer3d.controlCamera(dx,dy,distanceDelta,yawDelta,pitchDelta)}
export function screenToWorld(x,y){return renderer3d.screenToWorld(x,y,innerWidth,innerHeight)}
export function worldToScreen(x,y){return renderer3d.worldToScreen(x,y,innerWidth,innerHeight)}
export function panScreen(dx,dy){return renderer3d.panScreen(dx,dy,innerWidth,innerHeight)}
export function zoomAtScreen(x,y,nextZoom){return renderer3d.zoomAtScreen(x,y,nextZoom,innerWidth,innerHeight)}
export function resetCamera(){renderer3d.resetCamera()}
export function focusCamera(x,y){renderer3d.focusCamera(x,y)}
