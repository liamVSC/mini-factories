export function render(state,width,height,canvas=document.querySelector('#game')){renderer3d.render(state,width,height,canvas)}
export function setBuildingPreview(type,point,blocked=false){renderer3d.setBuildingPreview(type,point,blocked)}
export function setPreview(path,start,end,blocked=false){renderer3d.setPreview(path,start,end,blocked)}
export function resizeRenderer(width,height){renderer3d.resize(width,height)}
export function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){renderer3d.controlCamera(dx,dy,distanceDelta,yawDelta,pitchDelta)}
export function screenToWorld(x,y,width=innerWidth,height=innerHeight){return renderer3d.screenToWorld(x,y,width,height)}
export function worldToScreen(x,y,width=innerWidth,height=innerHeight){return renderer3d.worldToScreen(x,y,width,height)}
export function panScreen(dx,dy){return renderer3d.panScreen(dx,dy)}
export function zoomAtScreen(x,y,delta){return renderer3d.zoomAtScreen(x,y,delta)}
export function resetCamera(){return renderer3d.resetCamera()}
export function focusCamera(x,y){return renderer3d.focusCamera(x,y)}
import * as renderer3d from './render3d-clean.js';
