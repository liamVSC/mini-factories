import { resizeRenderer, screenToWorld, panScreen, zoomAtScreen, resetCamera, controlCamera } from '../render.js';
import type { GameContext } from './types.js';

export function createCameraController(ctx:GameContext){
  let width=0;
  let height=0;
  function viewportSize(){const rect=ctx.canvas.getBoundingClientRect();const visual=window.visualViewport;return {width:Math.max(1,Math.round(rect.width||visual?.width||innerWidth)),height:Math.max(1,Math.round(rect.height||visual?.height||innerHeight))};}
  function resize(){const size=viewportSize();width=size.width;height=size.height;ctx.viewport.width=width;ctx.viewport.height=height;resizeRenderer(width,height);ctx.state.renderVersion=(ctx.state.renderVersion||0)+1;}
  function screenPosition(event:PointerEvent|WheelEvent){const rect=ctx.canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function worldPosition(event:PointerEvent){const point=screenPosition(event);return screenToWorld(point.x,point.y,width,height);}
  function pan(dx:number,dy:number){panScreen(dx,dy,width,height);}
  function orbit(dx:number,dy:number){controlCamera(0,0,0,-dx*0.008,-dy*0.006);}
  function twist(delta:number){controlCamera(0,0,0,delta,0);}
  function zoomAt(point:{x:number;y:number},factor:number){const next=Math.max(.55,Math.min(2.4,ctx.state.camera.zoom*factor));ctx.state.camera.zoom=next;zoomAtScreen(point.x,point.y,factor,width,height);}
  function worldHitTolerance(screenPixels=22){const cx=width*.5,cy=height*.5;const a=screenToWorld(cx,cy,width,height);const b=screenToWorld(cx+screenPixels,cy,width,height);if(!a||!b)return 22;return Math.max(8,Math.min(70,Math.hypot(b.x-a.x,b.y-a.y)));}
  function reset(){resetCamera();ctx.state.renderVersion=(ctx.state.renderVersion||0)+1;}
  function snapshot(){return {x:ctx.state.camera.x,y:ctx.state.camera.y,zoom:ctx.state.camera.zoom};}
  function restore(snapshot:{x:number;y:number;zoom:number}){ctx.state.camera={x:snapshot.x,y:snapshot.y,zoom:snapshot.zoom};resizeRenderer(width,height);}
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('orientationchange',resize,{passive:true});
  window.visualViewport?.addEventListener('resize',resize,{passive:true});
  window.visualViewport?.addEventListener('scroll',resize,{passive:true});
  return {resize,screenPosition,worldPosition,pan,orbit,twist,zoomAt,worldHitTolerance,reset};
}
