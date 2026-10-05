import { research, researchCost, upgrade } from '../economy.js';
import { TYPES } from '../state.js';
import type { Building } from '../state.js';
import type { GameContext, PanelMode } from './types.js';

export function createUiController(ctx:GameContext){
  let panelMode:PanelMode='none';
  let flashTimer:number|undefined;

  const $=<T extends Element=HTMLElement>(selector:string):T=>document.querySelector<T>(selector)!;

  function flash(message:string){
    const element=$<HTMLElement>('#tip');
    element.textContent=message;
    if(flashTimer!==undefined)window.clearTimeout(flashTimer);
    flashTimer=window.setTimeout(()=>{element.textContent='Build roads between factories and shops.'},1200);
  }

  function setMenuActive(id:string|null){
    document.querySelectorAll<HTMLElement>('.actions button').forEach(element=>element.classList.remove('active'));
    if(id)$(`#${id}`)?.classList.add('active');
    ctx.setMenuActive=id=>setMenuActive(id);
  }

  function clearDynamicBuildButtons(){
    document.querySelectorAll<HTMLElement>('#panel button[id^="build"]').forEach(element=>element.style.display='none');
  }

  function clearButtonActions(){
    for(let i=1;i<=4;i++)$<HTMLButtonElement>(`#u${i}`).onclick=null;
    $<HTMLButtonElement>('#shop').onclick=null;
  }

  function showPanel(building:Building){
    panelMode='building';
    setMenuActive(null);
    const panel=$<HTMLElement>('#panel');
    clearDynamicBuildButtons();
    clearButtonActions();
    panel.style.display='block';
    panel.classList.toggle('shop-panel',building.kind==='shop');
    panel.classList.toggle('factory-panel',building.kind==='factory');
    panel.classList.toggle('warehouse-panel',building.kind==='warehouse');
    $<HTMLElement>('#objective').style.display='none';
    const type=TYPES.find(item=>item.name===building.type);
    $<HTMLElement>('#name').textContent=building.type;
    $<HTMLElement>('#panelHint').textContent=building.kind==='factory'?'Production and upgrades':building.kind==='warehouse'?'Storage and logistics':'Demand and deliveries';
    $<HTMLElement>('#type').textContent=type?.role||(building.kind==='factory'?'Factory':'Shop');
    $<HTMLElement>('#info').innerHTML=building.kind==='factory'
      ?'<b>'+building.stock+'/'+building.max+'</b> stock • Lv '+building.level+'<br><small>'+(type?.desc||'Produces '+building.type+' for delivery.')+'</small>'
      :building.kind==='warehouse'
      ?'<b>'+Math.floor(building.storage||0)+'/'+building.max+'</b> storage • Lv '+building.level+'<br><small>Goods arriving from connected factories are stored here, then automatically sent to shops that need them.</small>'
      :'<b>'+Math.ceil(building.demand)+'</b> demand • '+(building.contract?(building.contract.remaining+'/'+building.contract.qty+' on current job'):'waiting for a job')+'<br><small>'+(type?.desc||'Consumes '+building.need+' for local demand.')+'</small>';

    for(let i=1;i<=4;i++){
      const element=$<HTMLButtonElement>(`#u${i}`);
      element.onclick=null;
      const warehouse=building.kind==='warehouse';
      const factory=building.kind==='factory';
      element.style.display=(factory||(warehouse&&i<=2))?'block':'none';
      let price=0,label='',description='',disabled=false;
      if(factory){
        price=i===1?120*building.level:i===2?180+(building.max-4)/2*70:i===3?220*(building.loading+1):300*(building.logistics+1);
        const labels=[
          ['⚡ Faster machines','Increase production speed.'],
          ['📦 Bigger storage','Increase maximum stock.'],
          ['🚚 Loading bay','Faster dispatch and higher delivery value.'],
          ['🧭 Logistics','Reduce congestion impact.']
        ] as const;
        [label,description]=labels[i-1];
        disabled=i===1?building.level>=3:i===2?building.max>=14:i===3?building.loading>=2:building.logistics>=2;
      }else if(warehouse){
        price=i===1?(building.level===1?180:320):0;
        label=i===1?'📦 Expand storage':'🚚 Improve logistics';
        description=i===1?'Increase warehouse capacity.':'Increase warehouse logistics efficiency.';
        disabled=i===1?building.level>=3:false;
      }
      element.innerHTML=label+' <span>£'+Math.round(price)+'</span><small>'+description+'</small>';
      element.disabled=disabled;
      element.onclick=()=>{
        if(!element.disabled&&upgrade(ctx.state,building,i)){
          ctx.save(true);ctx.sync();showPanel(building);
        }
      };
    }

    const shop=$<HTMLButtonElement>('#shop');
    shop.style.display=building.kind==='shop'?'inline-flex':'none';
    shop.onclick=null;
    if(building.kind==='shop'){
      shop.innerHTML='🏪 Upgrade shop <span>£'+(220*building.level)+'</span>';
      shop.disabled=building.level>=3;
      shop.onclick=()=>{
        if(!shop.disabled&&upgrade(ctx.state,building,1)){
          ctx.save(true);ctx.sync();showPanel(building);
        }
      };
    }
  }

  function showCompany(){
    panelMode='company';
    setMenuActive('company');
    ctx.state.selected=null;
    clearDynamicBuildButtons();
    clearButtonActions();
    const panel=$<HTMLElement>('#panel');
    panel.classList.remove('shop-panel','factory-panel','warehouse-panel','company-panel','research-panel','build-panel');
    panel.classList.add('company-panel');
    panel.style.display='block';
    $<HTMLElement>('#objective').style.display='none';
    $<HTMLElement>('#name').textContent='Company';
    $<HTMLElement>('#panelHint').textContent='Network overview';
    $<HTMLElement>('#type').textContent='Expansion';
    const unlocked=ctx.state.buildings.length;
    const cap=10+(ctx.state.research?.industry||0)*2;
    $<HTMLElement>('#info').innerHTML='<b>'+unlocked+'/'+cap+'</b> buildings • Level '+ctx.state.companyLevel+'<br><small>Research Industry to expand your maximum city size.</small>';
    $<HTMLButtonElement>('#shop').style.display='none';
    const items=[
      ['🏭 Production','Factories: '+ctx.state.buildings.filter(building=>building.kind==='factory').length],
      ['🏪 Retail','Shops: '+ctx.state.buildings.filter(building=>building.kind==='shop').length],
      ['🚚 Network','Roads: '+ctx.state.roads.length],
      ['📈 Performance','£'+Math.floor(ctx.state.deliveryIncome)+' delivery income • '+ctx.state.orders+' deliveries']
    ] as const;
    for(let i=1;i<=4;i++){
      const element=$<HTMLButtonElement>(`#u${i}`);
      const item=items[i-1];
      element.style.display='block';
      element.disabled=true;
      element.innerHTML=item[0]+'<small>'+item[1]+'</small>';
    }
  }

  function showResearch(){
    panelMode='research';
    setMenuActive('research');
    ctx.state.selected=null;
    clearDynamicBuildButtons();
    clearButtonActions();
    const panel=$<HTMLElement>('#panel');
    panel.classList.remove('shop-panel','factory-panel','warehouse-panel','company-panel','research-panel','build-panel');
    panel.classList.add('research-panel');
    panel.style.display='block';
    $<HTMLElement>('#objective').style.display='none';
    $<HTMLElement>('#name').textContent='Research';
    $<HTMLElement>('#panelHint').textContent='Spend cash to unlock improvements';
    $<HTMLElement>('#type').textContent='Company development';
    $<HTMLElement>('#info').innerHTML='<b>Level '+ctx.state.companyLevel+'</b> • XP '+Math.floor(ctx.state.xp)+'/'+ctx.state.xpToNext;
    $<HTMLButtonElement>('#shop').style.display='none';
    const data=[
      ['u1','automation','⚡ Automation','Faster factory production.'],
      ['u2','logistics','🚚 Logistics','Higher delivery value.'],
      ['u3','industry','🏭 Industry','Increase maximum city size.']
    ] as const;
    for(let i=0;i<4;i++)$<HTMLButtonElement>(`#u${i+1}`).style.display=i<3?'block':'none';
    for(const [id,key,label,description] of data){
      const element=$<HTMLButtonElement>(`#${id}`);
      const level=ctx.state.research[key];
      element.innerHTML=label+' <span>£'+researchCost(ctx.state,key)+'</span><small>Lv '+level+'/3 • '+description+'</small>';
      element.disabled=level>=3||ctx.state.cash<researchCost(ctx.state,key);
      element.onclick=()=>{
        if(research(ctx.state,key)){ctx.save(true);ctx.sync();showResearch();}
      };
    }
  }

  function hidePanel(){
    if(ctx.buildMenuOpen)ctx.closeBuildMenu();
    setMenuActive(null);
    const panel=$<HTMLElement>('#panel');
    panel.classList.remove('shop-panel','factory-panel','warehouse-panel','research-panel','company-panel','build-panel');
    panelMode='none';
    ctx.state.selected=null;
    ctx.state.buildMode=null;
    if(ctx.state.mode==='build')ctx.state.mode='select';
    panel.style.display='none';
    $<HTMLElement>('#objective').style.display='';
  }

  function bind(){
    $<HTMLButtonElement>('#road').onclick=()=>ctx.state.mode=ctx.state.mode==='road'?'select':'road';
    $<HTMLButtonElement>('#erase').onclick=()=>ctx.setRoadEditorOpen(true);
    $<HTMLButtonElement>('#roadEditorClose').onclick=()=>ctx.closeRoadEditor();
    $<HTMLButtonElement>('#roadEditorCancel').onclick=()=>ctx.closeRoadEditor();
    $<HTMLButtonElement>('#roadEditMove').onclick=()=>ctx.setRoadEditAction('move');
    $<HTMLButtonElement>('#roadEditRemove').onclick=()=>ctx.setRoadEditAction('remove');
    $<HTMLButtonElement>('#research').onclick=showResearch;
    $<HTMLButtonElement>('#company').onclick=showCompany;
    $<HTMLButtonElement>('#panelClose').onclick=hidePanel;
    $<HTMLButtonElement>('#settings').onclick=()=>{ctx.state.paused=true;ctx.save(true);$<HTMLElement>('#settingsMenu').style.display='flex';};
    $<HTMLButtonElement>('#settingsClose').onclick=()=>{ctx.state.paused=false;$<HTMLElement>('#settingsMenu').style.display='none';};
    $<HTMLButtonElement>('#changeLogOpen').onclick=()=>{$<HTMLElement>('#settingsMenu').style.display='none';$<HTMLElement>('#changeLogPage').style.display='grid';};
    $<HTMLButtonElement>('#changeLogClose').onclick=()=>{$<HTMLElement>('#changeLogPage').style.display='none';$<HTMLElement>('#settingsMenu').style.display='flex';};
    $<HTMLButtonElement>('#newgame').onclick=()=>ctx.reset();
    $<HTMLButtonElement>('#again').onclick=()=>ctx.reset();
    $<HTMLButtonElement>('#cameraHome').onclick=()=>ctx.camera.reset();
    return {showPanel,hidePanel,showCompany,showResearch,bind,getPanelMode:()=>panelMode,flash,setMenuActive};
  }

  return {showPanel,hidePanel,showCompany,showResearch,bind,flash,setMenuActive,getPanelMode:()=>panelMode};
}
