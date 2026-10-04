import * as renderer3d from './render3d-clean.js?v=7';

export function render(s,W,H,canvas=document.querySelector('#game')){renderer3d.render(s,W,H,canvas)}
export function setBuildingPreview(type,point,blocked=false){renderer3d.setBuildingPreview(type,point,blocked)}
export function setPreview(path,start,end,blocked=false){renderer3d.setPreview(path,start,end,blocked)}
export function resizeRenderer(W,H){renderer3d.resize(W,H)}
export function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){renderer3d.controlCamera(dx,dy,distanceDelta,yawDelta,pitchDelta)}
export function screenToWorld(x,y,W=innerWidth,H=innerHeight){return renderer3d.screenToWorld(x,y,W,H)}
export function worldToScreen(x,y,W=innerWidth,H=innerHeight){return renderer3d.worldToScreen(x,y,W,H)}
export function panScreen(dx,dy,W=innerWidth,H=innerHeight){return renderer3d.panScreen(dx,dy,W,H)}
export function zoomAtScreen(x,y,nextZoom,W=innerWidth,H=innerHeight){return renderer3d.zoomAtScreen(x,y,nextZoom,W,H)}
export function resetCamera(){renderer3d.resetCamera()}
export function focusCamera(x,y){renderer3d.focusCamera(x,y)}