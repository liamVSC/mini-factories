import { TYPES } from '../state.js';
import { buildingCost, buildingUnlock, canBuild, canPlaceBuildingAt, buildingPlacementTarget } from '../world/buildings/index.js';
import { roadBuildingTarget, roadTarget } from '../world/roads/index.js';
import { screenToWorld, setBuildingPreview } from '../render.js';
import { PlaceBuildingCommand, executeCommand } from '../commands.js';
import type { BuildingType } from '../state.js';
import type { Point } from '../world/worldTypes.js';
import type { BuildDragState, GameContext } from './types.js';

export function createBuildController(ctx:GameContext){
  let buildDrag:BuildDragState|null=null;

  const $=<T extends Element=HTMLElement>(selector:string):T=>document.querySelector<T>(selector)!;

  function buildIcon(type:BuildingType|{kind:string}){if(type.kind==='factory')return '🏭';if(type.kind==='shop')return '🏪';if(type.kind==='warehouse')return '📦';return '🛣️';}
  function buildEntries(){return [{name:'Road',kind:'road',role:'Connect buildings',desc:'Drag onto the map to start a road.'},...TYPES];}

  function placementTarget(type:BuildingType,point:Point){return buildingPlacementTarget(ctx.state,type,point);}
  function placementReason(type:BuildingType,point:Point){
    const target=placementTarget(type,point);
    return target?canPlaceBuildingAt(ctx.state,type,target.point.x,target.point.y):'Invalid placement';
  }

  function renderBuildMenu(){
    const menu=$<HTMLElement>('#buildMenu');
    const grid=$<HTMLElement>('#buildCards');
    const entries=buildEntries().filter(type=>ctx.buildFilter==='all'||type.kind==='road'||type.kind===ctx.buildFilter);
    grid.innerHTML=entries.map(type=>{
      if(type.kind==='road')return '<button class="build-card" data-build-type="Road"><span class="build-icon">🛣️</span><span class="build-copy"><b>Road</b><small>Connect buildings</small></span><strong>From £2</strong></button>';
      const reason=buildingUnlock(type,ctx.state);
      const cost='£'+buildingCost(ctx.state,type);
      const locked=!!reason;
      const subtitle=reason||(('role' in type&&type.role)||('desc' in type&&type.desc)||'Build');
      return '<button class="build-card'+(locked?' locked':'')+'" data-build-type="'+type.name+'" '+(locked?'disabled':'')+'><span class="build-icon">'+buildIcon(type)+'</span><span class="build-copy"><b>'+type.name+'</b><small>'+subtitle+'</small></span><strong>'+cost+'</strong>'+(locked?'<span class="build-lock">🔒</span>':'')+'</button>';
    }).join('');
    menu.querySelector<HTMLElement>('.build-cash')?.replaceChildren(document.createTextNode('£'+Math.floor(ctx.state.cash)));
  }

  function showBuild(){
    ctx.state.selected=null;
    ctx.hidePanel();
    ctx.buildMenuOpen=true;
    ctx.setMenuActive('build');
    renderBuildMenu();
    const menu=$<HTMLElement>('#buildMenu');
    menu.classList.add('open');
    menu.setAttribute('aria-hidden','false');
  }

  function closeBuildMenu(){
    ctx.buildMenuOpen=false;
    buildDrag=null;
    setBuildingPreview(null,null,false);
    $('#buildMenu')?.classList.remove('open');
    $('#buildMenu')?.setAttribute('aria-hidden','true');
    $('#buildGhost')?.classList.remove('show');
    ctx.state.buildMode=null;
    if(ctx.state.mode==='build')ctx.state.mode='select';
    ctx.setMenuActive(null);
  }

  function updateBuildingPlacementPreview(point:Point|null){
    const type=ctx.state.buildMode;
    if(ctx.state.mode!=='build'||!type||!point){
      setBuildingPreview(null,null,false);
      return null;
    }
    const typed=TYPES.find(item=>item.name===type.name);
    if(!typed){setBuildingPreview(null,null,false);return 'Invalid building';}
    const target=placementTarget(typed,point);
    const reason=target?canPlaceBuildingAt(ctx.state,typed,target.point.x,target.point.y):'Invalid placement';
    setBuildingPreview(typed.name,target?.point||point,!!reason);
    $('#tip')!.textContent=reason||((target?.snapType?'Snapped to '+target.snapType+' • ':'')+'Place '+typed.name+' • tap to build');
    return reason;
  }

  function clearBuildingPlacementPreview(){
    setBuildingPreview(null,null,false);
    if(ctx.state.mode==='build')$('#tip')!.textContent='Tap an empty area to place '+(ctx.state.buildMode||'a building');
  }

  function startBuild(type:BuildingType|{kind:string;name:string}){
    if(type.kind==='road'){
      closeBuildMenu();
      ctx.state.buildMode=null;
      ctx.toggleRoadMode();
      ctx.flash('Drag on the map to build a road');
      return;
    }
    const typed=TYPES.find(item=>item.name===type.name);
    if(!typed)return;
    const reason=canBuild(ctx.state,typed);
    if(reason){ctx.flash(reason);renderBuildMenu();return;}
    closeBuildMenu();
    ctx.state.buildMode=typed;
    ctx.state.mode='build';
    ctx.setMenuActive('build');
    $('#road')?.classList.remove('active');
    $('#erase')?.classList.remove('active');
    setBuildingPreview(typed.name,{x:ctx.state.camera.x,y:ctx.state.camera.y},false);
    ctx.flash('Tap an empty area to place '+typed.name);
  }

  function buildCardForTarget(event:PointerEvent){
    const card=(event.target as Element).closest<HTMLElement>('.build-card');
    if(!card)return null;
    const type=buildEntries().find(item=>item.name===card.dataset.buildType);
    if(!type||type.kind==='road')return type||null;
    const typed=TYPES.find(item=>item.name===type.name);
    return typed&&canBuild(ctx.state,typed)?typed:null;
  }

  function canvasDropPoint(clientX:number,clientY:number){
    const element=document.elementFromPoint(clientX,clientY);
    if(element!==ctx.canvas&&!ctx.canvas.contains(element))return null;
    const rect=ctx.canvas.getBoundingClientRect();
    return screenToWorld(clientX-rect.left,clientY-rect.top,ctx.viewport.width,ctx.viewport.height);
  }

  function updateBuildGhost(clientX:number,clientY:number){
    const ghost=$<HTMLElement>('#buildGhost');
    if(!ghost||!buildDrag)return;
    ghost.style.left=clientX+'px';
    ghost.style.top=clientY+'px';
    ghost.classList.add('show');
    const point=canvasDropPoint(clientX,clientY);
    const type=buildDrag.type;
    if(!point){
      ghost.classList.remove('valid');ghost.classList.add('invalid');
      ghost.querySelector('small')!.textContent='Drop on the map';return;
    }
    if(type.kind==='road'){
      ghost.classList.remove('invalid');ghost.classList.add('valid');
      ghost.querySelector('small')!.textContent='Drop to start road';return;
    }
    const reason=placementReason(type as BuildingType,point);
    ghost.classList.toggle('valid',!reason);
    ghost.classList.toggle('invalid',!!reason);
    ghost.querySelector('small')!.textContent=reason||'Release to build';
  }

  function finishBuildDrag(event:PointerEvent){
    if(!buildDrag)return;
    const current=buildDrag;
    buildDrag=null;
    $('#buildGhost')?.classList.remove('show');
    if(current.cancelled)return;
    if(!current.dragging){startBuild(current.type);return;}
    const point=canvasDropPoint(event.clientX,event.clientY);
    if(!point){ctx.flash('Drop the building on the map');return;}
    if(current.type.kind==='road'){
      const target=roadBuildingTarget(ctx.state,point)||roadTarget(ctx.state,point as Parameters<typeof roadTarget>[1])||point;
      ctx.startRoadFromPoint(target);
      closeBuildMenu();
      ctx.setMenuActive('road');
      $('#road')?.classList.add('active');
      ctx.flash('Road start set — drag to the next point');
      return;
    }
    const type=TYPES.find(item=>item.name===current.type.name);
    if(!type)return;
    const target=placementTarget(type,point);
    const reason=target?canPlaceBuildingAt(ctx.state,type,target.point.x,target.point.y):'Invalid placement';
    if(reason){
      ctx.flash(reason);renderBuildMenu();
      ctx.buildMenuOpen=true;
      $('#buildMenu')?.classList.add('open');
      $('#buildMenu')?.setAttribute('aria-hidden','false');
      return;
    }
    if(!target){ctx.flash('Invalid placement');return;}
    const result=executeCommand(ctx.commands,ctx.state,new PlaceBuildingCommand(type,target.point.x,target.point.y));
    if(result.ok){
      ctx.markWorldDirty();ctx.save(true);ctx.sync();renderBuildMenu();ctx.flash(type.name+' constructed');
    }else ctx.flash('Could not construct '+type.name);
  }

  function setFilter(filter:string){
    ctx.buildFilter=filter;
    document.querySelectorAll<HTMLElement>('.build-category').forEach(element=>{
      const active=element.dataset.buildFilter===filter;
      element.classList.toggle('active',active);
      element.setAttribute('aria-selected',active?'true':'false');
    });
    renderBuildMenu();
  }

  function bind(){
    const menu=$<HTMLElement>('#buildMenu');
    menu.querySelectorAll<HTMLElement>('.build-category').forEach(element=>{
      element.addEventListener('click',()=>setFilter(element.dataset.buildFilter||'all'));
    });
    menu.addEventListener('pointerdown',(event)=>{
      const pointer=event as PointerEvent;
      const type=buildCardForTarget(pointer);
      if(!type)return;
      buildDrag={type:type as BuildingType,pointerId:pointer.pointerId,startX:pointer.clientX,startY:pointer.clientY,dragging:false,cancelled:false};
      const ghost=$<HTMLElement>('#buildGhost');
      ghost.querySelector('span')!.textContent=buildIcon(type);
      ghost.querySelector('b')!.textContent=type.name;
      ghost.querySelector('small')!.textContent=type.kind==='road'?'Drop to start road':'Drag onto the map';
      ghost.classList.remove('valid','invalid');
    });
    menu.addEventListener('pointermove',(event)=>{
      const pointer=event as PointerEvent;
      if(!buildDrag||buildDrag.pointerId!==pointer.pointerId)return;
      const dx=pointer.clientX-buildDrag.startX,dy=pointer.clientY-buildDrag.startY;
      if(Math.hypot(dx,dy)<=7)return;
      if(Math.abs(dy)<=Math.abs(dx)+4){buildDrag.cancelled=true;return;}
      if(!buildDrag.dragging){
        buildDrag.dragging=true;
        try{menu.setPointerCapture(pointer.pointerId);}catch{}
      }
      pointer.preventDefault();
      updateBuildGhost(pointer.clientX,pointer.clientY);
    });
    menu.addEventListener('pointerup',event=>finishBuildDrag(event as PointerEvent));
    menu.addEventListener('pointercancel',()=>{buildDrag=null;$('#buildGhost')?.classList.remove('show');});
    menu.addEventListener('lostpointercapture',()=>{
      if(buildDrag&&!buildDrag.dragging){buildDrag=null;$('#buildGhost')?.classList.remove('show');}
    });
    $('#buildMenuClose')?.addEventListener('click',closeBuildMenu);
    $('#build')!.addEventListener('click',showBuild);
  }

  return {bind,showBuild,closeBuildMenu,renderBuildMenu,updateBuildingPlacementPreview,clearBuildingPlacementPreview};
}
