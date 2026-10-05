import { resizeRenderer, screenToWorld, panScreen, zoomAtScreen, resetCamera } from '../render.js';
import type { GameContext } from './types.js';

export function createCameraController(ctx:GameContext){
  let width=0;
  let height=0;

  function viewportSize(){
    const rect=ctx.canvas.getBoundingClientRect();
    const visual=window.visualViewport;
    return {
      width:Math.max(1,Math.round(rect.width||visual?.width||innerWidth)),
      height:Math.max(1,Math.round(rect.height||visual?.height||innerHeight))
    };
  }

  function resize(){
    const size=viewportSize();
    width=size.width;
    height=size.height;
    ctx.viewport.width=width;
    ctx.viewport.height=height;
    resizeRenderer(width,height);
    ctx.state.renderVersion=(ctx.state.renderVersion||0)+1;
  }

  function screenPosition(event:PointerEvent|WheelEvent){
    const rect=ctx.canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }

  function worldPosition(event:PointerEvent){
    const point=screenPosition(event);
    return screenToWorld(point.x,point.y,width,height);
  }

  function pan(dx:number,dy:number){ panScreen(dx,dy,width,height); }

  function zoomAt(point:{x:number;y:number},zoom:number){
    ctx.state.camera.zoom=Math.max(.55,Math.min(2.4,zoom));
    zoomAtScreen(point.x,point.y,ctx.state.camera.zoom,width,height);
  }

  function worldHitTolerance(screenPixels=22){
    const cx=width*.5,cy=height*.5;
    const a=screenToWorld(cx,cy,width,height);
    const b=screenToWorld(cx+screenPixels,cy,width,height);
    if(!a||!b)return 22;
    return Math.max(8,Math.min(70,Math.hypot(b.x-a.x,b.y-a.y)));
  }

  function reset(){ resetCamera(); ctx.state.renderVersion=(ctx.state.renderVersion||0)+1; }

  window.addEventListener('resize',resize,{passive:true});
  window.visualViewport?.addEventListener('resize',resize,{passive:true});
  window.visualViewport?.addEventListener('scroll',resize,{passive:true});

  return {resize,screenPosition,worldPosition,pan,zoomAt,worldHitTolerance,reset};
}
