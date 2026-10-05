import * as renderer3d from './render3d-clean.js';
import type { Point } from './world/worldTypes.js';
import type { GameState } from './state.js';

export function render(state:GameState,width:number,height:number,canvas:HTMLCanvasElement|null=document.querySelector('#game')):void{renderer3d.render(state,width,height,canvas)}
export function setBuildingPreview(type:string|null,point:Point|null,blocked=false):void{renderer3d.setBuildingPreview(type,point,blocked)}
export function setPreview(path:Point[]|null,start:Point|null,end:Point|null,blocked=false):void{renderer3d.setPreview(path,start,end,blocked)}
export function resizeRenderer(width:number,height:number):void{renderer3d.resize(width,height)}
export function controlCamera(dx:number,dy:number,distanceDelta=0,yawDelta=0,pitchDelta=0):void{renderer3d.controlCamera(dx,dy,distanceDelta,yawDelta,pitchDelta)}
export function screenToWorld(x:number,y:number,width=innerWidth,height=innerHeight):Point|null{return renderer3d.screenToWorld(x,y,width,height)}
export function worldToScreen(x:number,y:number,width=innerWidth,height=innerHeight):Point|null{return renderer3d.worldToScreen(x,y,width,height)}
export function panScreen(dx:number,dy:number,width=innerWidth,height=innerHeight):void{renderer3d.panScreen(dx,dy,width,height)}
export function zoomAtScreen(x:number,y:number,nextZoom:number,width=innerWidth,height=innerHeight):void{renderer3d.zoomAtScreen(x,y,nextZoom,width,height)}
export function resetCamera():void{renderer3d.resetCamera()}
export function focusCamera(x:number,y:number):void{renderer3d.focusCamera(x,y)}
