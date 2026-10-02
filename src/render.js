import * as renderer3d from './render3d-clean.js';

export function render(s,W,H,canvas=document.querySelector('#game')){
  // The clean renderer keys static geometry by buildings/roads. A zero-length
  // transient road marker makes a truck-set change invalidate that key without
  // changing persisted gameplay state or drawing any extra pavement.
  const trucks=s.trucks||[];
  const marker={id:'__render_trucks__'+trucks.map(t=>t.id).join(','),points:[]};
  s.roads=s.roads||[];
  s.roads.push(marker);
  try{renderer3d.render(s,W,H,canvas)}finally{s.roads.pop()}
}
export function setBuildingPreview(type,point,blocked=false){renderer3d.setBuildingPreview(type,point,blocked)}
export function setPreview(path,start,end,blocked=false){renderer3d.setPreview(path,start,end,blocked)}
export function resizeRenderer(W,H){renderer3d.resize(W,H)}
export function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){renderer3d.controlCamera(dx,dy,distanceDelta,yawDelta,pitchDelta)}
export function screenToWorld(x,y,W=innerWidth,H=innerHeight){return renderer3d.screenToWorld(x,y,W,H)}
export function panScreen(dx,dy,W=innerWidth,H=innerHeight){return renderer3d.panScreen(dx,dy,W,H)}
export function zoomAtScreen(x,y,nextZoom,W=innerWidth,H=innerHeight){return renderer3d.zoomAtScreen(x,y,nextZoom,W,H)}
export function resetCamera(){renderer3d.resetCamera()}
export function focusCamera(x,y){renderer3d.focusCamera(x,y)}