import { AddRoadCommand, DeleteRoadCommand, MoveRoadEndpointCommand, executeCommand } from '../commands.js';
import { roadBuildingTarget, roadTarget, roadPreview, roadSegmentAtPoint, roadEndpointAtPoint, roadEndpointPreview, dist } from '../world/roads/index.js';
import type { RoadTarget } from '../world/roads/placement.js';
import { setPreview } from '../render.js';
import type { Point } from '../world/worldTypes.js';
import type { GameContext, RoadDragState } from './types.js';

interface RoadPreviewResult { path:Point[]; start:RoadTarget; end:RoadTarget; blocked:boolean; [key:string]:unknown; }

interface CameraApi {
  worldPosition(event:PointerEvent):Point|null;
  screenPosition(event:PointerEvent):{x:number;y:number};
  worldHitTolerance(screenPixels?:number):number;
}

export function createRoadController(ctx:GameContext,camera:CameraApi){
  function roadPreviewTip(preview:RoadPreviewResult|null){
    if(!preview)return 'Invalid road';
    if(preview.blocked)return 'Road blocked — move around the building';
    const start=preview.start?.building?.type||preview.start?.building?.kind;
    const end=preview.end?.building?.type||preview.end?.building?.kind;
    if(start&&end)return 'Connect '+start+' to '+end;
    if(start)return 'Road from '+start;
    if(end)return 'Road to '+end;
    return 'Drag to build road';
  }

  function roadResultMessage(result:unknown,path:Point[]){
    if(result===true)return 'Road built';
    if(result==='cash'){
      const lengthEstimate=path.length>1?path.reduce((total,point,index)=>index?total+dist(path[index-1],point):0,0):0;
      const cost=Math.max(1,Math.ceil(lengthEstimate/180))*2;
      return 'Need £'+cost+' cash (you have £'+Math.floor(ctx.state.cash)+')';
    }
    if(result==='too-short')return 'Select two different points or buildings';
    if(result==='blocked')return 'Road blocked — move around the building';
    if(result==='duplicate')return 'Road already exists here';
    return 'Invalid road';
  }

  function roadPathSafe(a:Point,b:Point){
    try{return (roadPreview(ctx.state,a as RoadTarget,b as RoadTarget) as RoadPreviewResult|null)?.path||[a,b];}
    catch{return[a,b];}
  }

  function toggleMode(){
    ctx.state.mode=ctx.state.mode==='road'?'select':'road';
    ctx.setMenuActive(ctx.state.mode==='road'?'road':null);
    ctx.drag=null;
    ctx.state.roadEditSelection=undefined;
    ctx.state.roadEditHover=undefined;
    ctx.state.roadEditEndpoint=undefined;
    ctx.state.roadEditEndpointPreview=undefined;
    $('#road')?.classList.toggle('active',ctx.state.mode==='road');
    $('#erase')?.classList.toggle('active',false);
    $('#tip')!.textContent=ctx.state.mode==='road'?'Drag on the map to build a road.':'Build roads between factories and shops.';
  }

  function startFromPoint(point:Point){
    ctx.state.mode='road';
    ctx.state.buildMode=null;
    ctx.drag={start:point,current:point};
    ctx.setMenuActive('road');
    $('#road')?.classList.add('active');
    $('#erase')?.classList.remove('active');
  }

  function setEditorOpen(open:boolean){
    if(open)openRoadEditor();
    else closeRoadEditor();
  }

  function openRoadEditor(){
    if(ctx.buildMenuOpen)ctx.closeBuildMenu();
    ctx.drag=null;
    ctx.state.mode='select';
    ctx.state.roadEditSelection=undefined;
    ctx.state.roadEditEndpoint=undefined;
    ctx.state.roadEditEndpointPreview=undefined;
    ctx.roadEditAction=null;
    const element=$<HTMLElement>('#roadEditor');
    element.classList.add('open');
    element.setAttribute('aria-hidden','false');
    ctx.setMenuActive(null);
  }

  function closeRoadEditor(){
    const element=$<HTMLElement>('#roadEditor');
    element.classList.remove('open');
    element.setAttribute('aria-hidden','true');
    ctx.roadEditAction=null;
    ctx.state.mode='select';
    ctx.state.roadEditSelection=undefined;
    ctx.state.roadEditEndpoint=undefined;
    ctx.state.roadEditEndpointPreview=undefined;
    ctx.drag=null;
    ctx.setMenuActive(null);
    $('#erase')?.classList.remove('active');
    $('#tip')!.textContent='Build roads between factories and shops.';
  }

  function setEditAction(action:'move'|'remove'){
    ctx.roadEditAction=action;
    const element=$<HTMLElement>('#roadEditor');
    element.classList.remove('open');
    element.setAttribute('aria-hidden','true');
    ctx.state.mode='erase';
    ctx.drag=null;
    ctx.state.roadEditSelection=undefined;
    ctx.state.roadEditEndpoint=undefined;
    ctx.state.roadEditEndpointPreview=undefined;
    ctx.setMenuActive('erase');
    $('#erase')?.classList.add('active');
    $('#tip')!.textContent=action==='move'?'Drag a road endpoint':'Tap any part of a road to delete it';
  }

  function pointerDown(event:PointerEvent){
    const point=camera.worldPosition(event);
    if(!point)return;
    if(ctx.state.mode==='road'){
      const target=roadBuildingTarget(ctx.state,point)||roadTarget(ctx.state,point as RoadTarget)||point;
      if(!ctx.drag)ctx.drag={start:target,current:target};
      return;
    }
    if(ctx.state.mode!=='erase')return;
    if(ctx.roadEditAction==='move'){
      const endpoint=roadEndpointAtPoint(ctx.state,point,camera.worldHitTolerance(30));
      if(endpoint){
        ctx.drag={start:endpoint.point,current:endpoint.point};
        ctx.state.roadEditEndpoint={roadId:endpoint.roadId,index:endpoint.index,point:endpoint.point};
        ctx.state.roadEditEndpointPreview=roadEndpointPreview(ctx.state,endpoint.road,endpoint.index,point);
      }
      return;
    }
    const hit=roadSegmentAtPoint(ctx.state,point,camera.worldHitTolerance(26));
    if(hit&&ctx.roadEditAction==='remove'){
      const result=executeCommand(ctx.commands,ctx.state,new DeleteRoadCommand(point));
      ctx.state.roadEditSelection=undefined;
      if(result.ok){
        ctx.markWorldDirty();ctx.save(true);ctx.sync();ctx.flash('Road deleted');
      }else ctx.flash('Could not delete road');
    }
  }

  function pointerMove(event:PointerEvent){
    const point=camera.worldPosition(event);
    if(!point)return;
    if(ctx.state.mode==='road'&&ctx.drag){
      ctx.drag.current=roadBuildingTarget(ctx.state,point)||roadTarget(ctx.state,point as RoadTarget)||point;
      let preview:RoadPreviewResult|null=null;
      try{preview=roadPreview(ctx.state,ctx.drag.start as RoadTarget,ctx.drag.current as RoadTarget) as RoadPreviewResult|null;}
      catch{preview={path:[ctx.drag.start,ctx.drag.current],start:ctx.drag.start as RoadTarget,end:ctx.drag.current as RoadTarget,blocked:true,blockedReason:'preview-error'};}
      setPreview(preview?.path,preview?.start,preview?.end,preview?.blocked);
      $('#tip')!.textContent=roadPreviewTip(preview);
      return;
    }
    if(ctx.state.mode==='erase'&&ctx.drag&&ctx.state.roadEditEndpoint){
      const endpoint=ctx.state.roadEditEndpoint;
      const road=ctx.state.roads.find(item=>item.id===endpoint.roadId);
      if(road)ctx.state.roadEditEndpointPreview=roadEndpointPreview(ctx.state,road,endpoint.index,point);
      setPreview(null,null,null,false);
      return;
    }
    if(ctx.state.mode==='erase'){
      ctx.state.roadEditHover=roadSegmentAtPoint(ctx.state,point,camera.worldHitTolerance(22));
      setPreview(null,null,null,false);
    }
  }

  function pointerUp(event:PointerEvent){
    if(ctx.state.mode==='road'&&ctx.drag){
      const drag=ctx.drag;
      ctx.drag=null;
      const point=camera.worldPosition(event)||drag.current;
      const target=roadBuildingTarget(ctx.state,point)||roadTarget(ctx.state,point as RoadTarget)||point;
      let preview:RoadPreviewResult|null=null;
      try{preview=roadPreview(ctx.state,drag.start as RoadTarget,target as RoadTarget) as RoadPreviewResult|null;}
      catch{preview=null;}
      const path=preview?.path||roadPathSafe(drag.start,target);
      const meta={startBuilding:preview?.start?.building||undefined,endBuilding:preview?.end?.building||undefined};
      let result:{ok:boolean;result?:unknown};
      try{
        const command=executeCommand(ctx.commands,ctx.state,new AddRoadCommand(path,meta));
        result={ok:command.ok,result:command.result};
      }catch{result={ok:false};}
      setPreview(null,null,null,false);
      $('#tip')!.textContent=roadResultMessage(result.ok?result.result:false,path);
      if(result.result===true){ctx.markWorldDirty();ctx.save(true);ctx.sync();}
      return;
    }
    if(ctx.state.mode==='erase'&&ctx.drag&&ctx.state.roadEditEndpoint){
      const drag=ctx.drag;
      const endpoint=ctx.state.roadEditEndpoint;
      ctx.drag=null;
      const point=camera.worldPosition(event);
      if(!point)return;
      const result=executeCommand(ctx.commands,ctx.state,new MoveRoadEndpointCommand(endpoint.roadId,endpoint.index,point));
      ctx.state.roadEditEndpoint=undefined;
      ctx.state.roadEditEndpointPreview=undefined;
      setPreview(null,null,null,false);
      if(result.ok){ctx.markWorldDirty();ctx.save(true);ctx.sync();ctx.flash('Road endpoint moved');}
      else ctx.flash('Invalid road endpoint');
      return;
    }
    ctx.drag=null;
  }

  return {toggleMode,startFromPoint,setEditorOpen,closeRoadEditor,setEditAction,pointerDown,pointerMove,pointerUp,openRoadEditor};
}

function $<T extends Element=HTMLElement>(selector:string):T{return document.querySelector<T>(selector)!;}
