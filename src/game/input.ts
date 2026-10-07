import { buildingAtPoint, buildingPlacementTarget, canPlaceBuildingAt } from '../world/buildings/index.js';
import { PlaceBuildingCommand, executeCommand } from '../commands.js';
import { setBuildingPreview, setPreview } from '../render.js';
import type { GameContext } from './types.js';
import type { Point } from '../world/worldTypes.js';

interface CameraApi {
  screenPosition(event:PointerEvent|WheelEvent):{x:number;y:number};
  worldPosition(event:PointerEvent):Point|null;
  pan(dx:number,dy:number):void;
  orbit(dx:number,dy:number):void;
  twist(delta:number):void;
  zoomAt(point:{x:number;y:number},zoom:number):void;
  worldHitTolerance(screenPixels?:number):number;
}
interface BuildApi { updateBuildingPlacementPreview(point:Point|null):unknown; }
interface RoadApi { pointerDown(event:PointerEvent):void; pointerMove(event:PointerEvent):void; pointerUp(event:PointerEvent):void; }

function angleBetween(a:{x:number;y:number},b:{x:number;y:number}){return Math.atan2(b.y-a.y,b.x-a.x);}
function shortestAngleDelta(from:number,to:number){return Math.atan2(Math.sin(to-from),Math.cos(to-from));}

export function bindInput(ctx:GameContext,camera:CameraApi,build:BuildApi,road:RoadApi){
  const canvas=ctx.canvas;
  const pointers=new Map<number,{x:number;y:number}>();
  let pinch:{distance:number;angle:number}|null=null;
  let pinchCenter:{x:number;y:number}|null=null;
  let cameraGesture:{multi:boolean;startX:number;startY:number;lastX:number;lastY:number;moved:boolean;pointerId:number;button:number}|null=null;

  const clearPreviews=()=>{
    setPreview([],{x:0,y:0},{x:0,y:0},false);
    setBuildingPreview(null,null,false);
  };

  canvas.addEventListener('pointerdown',event=>{
    event.preventDefault();
    try{canvas.setPointerCapture?.(event.pointerId);}catch{}
    const screen=camera.screenPosition(event);
    pointers.set(event.pointerId,screen);

    if(pointers.size===2){
      const [a,b]=[...pointers.values()];
      pinch={distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),angle:angleBetween(a,b)};
      pinchCenter={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      cameraGesture={multi:true,startX:0,startY:0,lastX:0,lastY:0,moved:true,pointerId:event.pointerId,button:event.button};
      ctx.drag=null;
      clearPreviews();
      return;
    }

    if(ctx.state.mode==='build'){
      const point=camera.worldPosition(event);
      const type=ctx.state.buildMode;
      if(!point||!type)return;
      const target=buildingPlacementTarget(ctx.state,type,point);
      const reason=target?canPlaceBuildingAt(ctx.state,type,target.point.x,target.point.y):'Invalid placement';
      if(reason||!target){build.updateBuildingPlacementPreview(point);ctx.flash(reason||'Invalid placement');return;}
      const result=executeCommand(ctx.commands,ctx.state,new PlaceBuildingCommand(type,target.point.x,target.point.y));
      if(result.ok){
        ctx.markWorldDirty();
        ctx.state.buildMode=null;
        ctx.state.mode='select';
        ctx.setMenuActive(null);
        setBuildingPreview(null,null,false);
        ctx.save(true);
        ctx.sync();
        ctx.flash('Building constructed');
      }
      return;
    }

    if(ctx.state.mode==='road'||ctx.state.mode==='erase'){
      road.pointerDown(event);
      return;
    }

    if(ctx.state.mode==='select'){
      cameraGesture={multi:false,startX:screen.x,startY:screen.y,lastX:screen.x,lastY:screen.y,moved:false,pointerId:event.pointerId,button:event.button};
      ctx.drag=null;
    }
  });

  canvas.addEventListener('pointermove',event=>{
    const screen=camera.screenPosition(event);
    pointers.set(event.pointerId,screen);

    if(pointers.size===2){
      const [a,b]=[...pointers.values()];
      if(!pinch){
        pinch={distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),angle:angleBetween(a,b)};
        pinchCenter={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      }
      const distance=Math.max(1,Math.hypot(b.x-a.x,b.y-a.y));
      const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const angle=angleBetween(a,b);
      const zoomFactor=distance/pinch.distance;
      camera.zoomAt(center,zoomFactor);
      if(pinchCenter)camera.pan(center.x-pinchCenter.x,center.y-pinchCenter.y);
      camera.twist(shortestAngleDelta(pinch.angle,angle));
      pinch={distance,angle};
      pinchCenter=center;
      cameraGesture={multi:true,startX:0,startY:0,lastX:0,lastY:0,moved:true,pointerId:event.pointerId,button:event.button};
      return;
    }

    if(cameraGesture?.multi)return;

    if(ctx.state.mode==='build'){
      build.updateBuildingPlacementPreview(camera.worldPosition(event));
      return;
    }
    if(ctx.state.mode==='road'||ctx.state.mode==='erase'){
      road.pointerMove(event);
      return;
    }
    if(cameraGesture?.pointerId===event.pointerId&&ctx.state.mode==='select'){
      const dx=screen.x-cameraGesture.lastX,dy=screen.y-cameraGesture.lastY;
      if(Math.hypot(screen.x-cameraGesture.startX,screen.y-cameraGesture.startY)>7)cameraGesture.moved=true;
      if(cameraGesture.moved&&(dx||dy)){
        if(cameraGesture.button===2||cameraGesture.button===1||(cameraGesture.button===0&&event.shiftKey))camera.orbit(dx,dy);
        else camera.pan(dx,dy);
      }
      cameraGesture.lastX=screen.x;
      cameraGesture.lastY=screen.y;
    }
  });

  canvas.addEventListener('pointerup',event=>{
    const wasMulti=!!cameraGesture?.multi||!!pinch;
    pointers.delete(event.pointerId);
    if(wasMulti){
      pinch=null;
      pinchCenter=null;
      cameraGesture=pointers.size?{multi:true,startX:0,startY:0,lastX:0,lastY:0,moved:true,pointerId:event.pointerId,button:event.button}:null;
      return;
    }
    if(pointers.size<2)pinch=null;

    if(ctx.state.mode==='road'||ctx.state.mode==='erase'){
      road.pointerUp(event);
    }else if(ctx.state.mode==='select'&&cameraGesture?.pointerId===event.pointerId&&!cameraGesture.moved){
      const point=camera.worldPosition(event);
      if(point){
        const building=buildingAtPoint(ctx.state,point,camera.worldHitTolerance(24));
        ctx.state.selected=building||null;
        if(building)ctx.showPanel(building);
        else ctx.hidePanel();
      }
    }
    cameraGesture=null;
  });

  const cancel=()=>{
    pointers.clear();
    ctx.drag=null;
    setBuildingPreview(null,null,false);
    pinch=null;
    pinchCenter=null;
    cameraGesture=null;
    setPreview([],{x:0,y:0},{x:0,y:0},false);
  };

  canvas.addEventListener('lostpointercapture',cancel);
  canvas.addEventListener('pointercancel',cancel);
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    const point=camera.screenPosition(event);
    // Trackpads and mouse wheels report very different delta magnitudes; use a
    // continuous, bounded factor so zoom remains smooth without allowing a
    // single wheel event to jump across the usable camera range.
    const factor=Math.max(.82,Math.min(1.22,Math.exp(-event.deltaY*.0015)));
    camera.zoomAt(point,factor);
  },{passive:false});

  for(const type of ['gesturestart','gesturechange','gestureend']){
    document.addEventListener(type,event=>event.preventDefault(),{passive:false});
  }
  document.addEventListener('touchmove',event=>{
    if(event.touches.length>1&&event.target===canvas)event.preventDefault();
  },{passive:false});
}