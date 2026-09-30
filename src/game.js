import {freshState,hydrate,serialise,TYPES} from './state.js';
import {seed,nearestBuilding,roadBuildingTarget,nearestRoad,roadTarget,roadPreview,addRoad,eraseRoad,dist,buildingCost,buildingUnlock,canBuild,placeBuilding} from './world.js';
import {updateEconomy,upgrade,newContract,research,researchCost} from './economy.js';
import {render,setPreview,resizeRenderer,controlCamera,screenToWorld,panScreen,zoomAtScreen,resetCamera} from './render.js';

const GAME_VERSION='1.5';
const CHANGELOG=[
  {version:'1.4',date:'29 Sep 2026',items:[
    'Unified screen-to-world input around the 3D camera projection.',
    'Improved zoom-at-cursor, pan and pinch camera behaviour.',
    'Cleaned up camera reset, resize and input state handling.',
    'Added syntax checks to the automated test command.'
  ]},
  {version:'1.3',date:'29 Sep 2026',items:[
    'Rebuilt the map renderer as a real-time 3D scene.',
    'Added 3D factories, warehouses, shops and trucks.',
    'Added 3D roads, bridges, lighting and depth.',
    'Added a 3D road construction preview.',
    'Kept the existing logistics and economy systems intact.'
  ]},
  {version:'1.2',date:'29 Sep 2026',items:[
    'Rebuilt road routing around the physical road network.',
    'Buildings now attach to real road segments.',
    'Road intersections now work as proper junctions.',
    'Fixed truck dispatch and delivery routing.',
    'Added automated road and delivery regression tests.',
    'Improved road drag handling on mobile.'
  ]},
  {version:'1.1',date:'28 Sep 2026',items:[
    'Improved building visuals and road presentation.',
    'Added clearer placement and erase feedback.',
    'Improved mobile controls and compact panels.'
  ]}
];

const canvas=document.querySelector('#game');let W=0,H=0;let s=load();let drag=null;let pointers=new Map();let pinch=null;let last=performance.now();let pinchCenter=null;let pinchAngle=0;let panelMode='none';
function resize(){W=innerWidth;H=innerHeight;resizeRenderer(W,H)}addEventListener('resize',resize);resize();
function load(){try{const d=JSON.parse(localStorage.getItem('miniFactoriesSaveV6'));const h=hydrate(d);if(h)return h}catch{}const n=freshState();seed(n);for(const b of n.buildings.filter(b=>b.kind==='shop'))newContract(n,b);return n}
function markWorldDirty(){s.renderVersion=(s.renderVersion||0)+1}
function save(){if(s.gameOver)return;try{localStorage.setItem('miniFactoriesSaveV6',JSON.stringify(serialise(s)))}catch(e){flash('Save failed — storage unavailable')}}
function roadResultMessage(result,path){if(result===true)return 'Road built';if(result==='cash'){const lengthEstimate=path.length>1?path.reduce((n,p,i)=>i?n+dist(path[i-1],p):0,0):0;const cost=Math.max(1,Math.ceil(lengthEstimate/180))*2;return 'Need £'+cost+' cash (you have £'+Math.floor(s.cash)+')'}if(result==='too-short')return 'Select two different points or buildings';if(result==='blocked')return 'Road blocked — move around the building';if(result==='duplicate')return 'Road already exists here';return 'Invalid road'}
function flash(text){const el=document.querySelector('#tip');el.textContent=text;clearTimeout(flash.timer);flash.timer=setTimeout(()=>el.textContent='Build roads between factories and shops.',1200)}
function roadPreviewTip(preview){
  if(!preview)return 'Build roads between factories and shops.';
  const state=preview.blocked?'Blocked — move around buildings':s.cash<preview.cost?'Need £'+preview.cost+' cash':'Ready to build';
  const snap=[];
  if(preview.snappedStart)snap.push('start');
  if(preview.snappedEnd)snap.push('end');
  const snapText=snap.length?' • Snapped '+snap.join(' + '):'';
  return state+' • '+Math.round(preview.length)+'m • £'+preview.cost+snapText;
}
function reset(){localStorage.removeItem('miniFactoriesSaveV6');s=freshState();seed(s);s.renderVersion=1;for(const b of s.buildings.filter(b=>b.kind==='shop'))newContract(s,b);document.querySelector('#settingsMenu').style.display='none';document.querySelector('#gameOver').style.display='none';s.paused=false;hidePanel();sync();save();flash('New factory started')}
function renderChangeLog(){
  const el=document.querySelector('#changeLog');
  if(!el)return;
  el.innerHTML=CHANGELOG.map(v=>'<section class="changelog-version"><div class="changelog-head"><b>v'+v.version+'</b><span>'+v.date+'</span></div><ul>'+v.items.map(x=>'<li>'+x+'</li>').join('')+'</ul></section>').join('');
}
renderChangeLog();
function sync(){document.querySelector('#cash').textContent='£'+Math.floor(s.cash);document.querySelector('#orders').textContent=s.orders;document.querySelector('#companyLevel').textContent=s.companyLevel;const g=s.goals[s.objective];document.querySelector('#objective').innerHTML=g?`<b>Goal ${s.objective+1}/6</b> • ${g.text} <span>${Math.min(g.target,Math.floor(g.progress(s)))}/${g.target}</span>`:'All objectives complete';const p=document.querySelector('#panel');if(panelMode==='building'&&s.selected&&p.style.display!=='none')showPanel(s.selected);}
function clearDynamicBuildButtons(){
  document.querySelectorAll('#panel button[id^="build"]').forEach(el=>el.style.display='none');
}
function clearButtonActions(){
  for(let i=1;i<=4;i++){
    const el=document.querySelector('#u'+i);
    el.onclick=null;
  }
  document.querySelector('#shop').onclick=null;
}
function showPanel(b){
  panelMode='building';
  const p=document.querySelector('#panel');
  clearDynamicBuildButtons();
  clearButtonActions();
  p.style.display='block';
  p.classList.toggle('shop-panel',b.kind==='shop');
  p.classList.toggle('factory-panel',b.kind==='factory');
  p.classList.toggle('warehouse-panel',b.kind==='warehouse');
  document.querySelector('#objective').style.display='none';
  const t=TYPES.find(x=>x.name===b.type);
  document.querySelector('#name').textContent=b.type;
  document.querySelector('#type').textContent=t?.role||(b.kind==='factory'?'Factory':'Shop');
  document.querySelector('#info').innerHTML=b.kind==='factory'
    ? '<b>'+b.stock+'/'+b.max+'</b> stock • Lv '+b.level+'<br><small>'+(t?.desc||'Produces '+b.type+' for delivery.')+'</small>'
    : b.kind==='warehouse'
      ? '<b>'+Math.floor(b.storage||0)+'/'+b.max+'</b> storage<br><small>Nearby factories can move goods here for later retail deliveries.</small>'
      : '<b>'+Math.ceil(b.demand)+'</b> demand • '+(b.contract?(b.contract.remaining+'/'+b.contract.qty+' on current job'):'waiting for a job')+'<br><small>'+(t?.desc||'Consumes '+b.need+' for local demand.')+'</small>';

  for(let i=1;i<=4;i++){
    const el=document.querySelector('#u'+i);
    el.onclick=null;
    el.style.display=b.kind==='factory'?'block':'none';
    const price=i===1?120*b.level:i===2?180+(b.max-4)/2*70:i===3?220*(b.loading+1):300*(b.logistics+1);
    const labels=[
      ['⚡ Faster machines','Increase production speed.'],
      ['📦 Bigger storage','Increase maximum stock.'],
      ['🚚 Loading bay','Faster dispatch and higher delivery value.'],
      ['🧭 Logistics','Reduce congestion impact.']
    ][i-1];
    el.innerHTML=labels[0]+' <span>£'+Math.round(price)+'</span><small>'+labels[1]+'</small>';
    el.disabled=i===1?b.level>=3:i===2?b.max>=14:i===3?b.loading>=2:b.logistics>=2;
    el.onclick=()=>{if(!el.disabled&&upgrade(s,b,i)){save();sync();showPanel(b)}};
  }

  const shop=document.querySelector('#shop');
  shop.style.display=b.kind==='shop'?'block':'none';
  shop.onclick=null;
  if(b.kind==='shop'){
    shop.innerHTML='🏪 Upgrade shop <span>£'+(220*b.level)+'</span>';
    shop.disabled=b.level>=3;
    shop.onclick=()=>{if(!shop.disabled&&upgrade(s,b,1)){save();sync();showPanel(b)}};
  }
}
function showBuild(){
  panelMode='build';s.selected=null;
  clearDynamicBuildButtons();
  clearButtonActions();
  const p=document.querySelector('#panel');p.classList.remove('shop-panel','factory-panel','warehouse-panel','research-panel','company-panel');p.classList.add('build-panel');p.style.display='block';document.querySelector('#objective').style.display='none';
  document.querySelector('#name').textContent='Build';document.querySelector('#type').textContent='Construction';
  document.querySelector('#info').innerHTML='<b>Cash £'+Math.floor(s.cash)+'</b> • Choose a building';
  document.querySelector('#shop').style.display='none';
  const available=TYPES.filter(t=>!t.unlock||(s.research?.[t.unlock]||0)>=t.unlockLevel);
  const items=[...available];
  for(let i=1;i<=4;i++){const el=document.querySelector('#u'+i);const t=items[i-1];el.style.display=t?'block':'none';if(!t)continue;const reason=buildingUnlock(t,s);const cost=buildingCost(s,t);el.innerHTML='🏗️ '+t.name+' <span>£'+cost+'</span><small>'+ (reason||t.role||'Build production')+'</small>';el.disabled=!!reason||s.cash<cost;el.onclick=()=>startBuild(t);}
  if(items.length>4){for(let i=5;i<=items.length;i++){const id='build'+i;let el=document.querySelector('#'+id);if(!el){el=document.createElement('button');el.id=id;el.className='upgrade';p.appendChild(el)}const t=items[i-1],reason=buildingUnlock(t,s),cost=buildingCost(s,t);el.style.display='block';el.innerHTML='🏗️ '+t.name+' <span>£'+cost+'</span><small>'+ (reason||t.role||'Build production')+'</small>';el.disabled=!!reason||s.cash<cost;el.onclick=()=>startBuild(t);}}
}
function startBuild(t){const reason=canBuild(s,t);if(reason){flash(reason);return}hidePanel();s.buildMode=t;s.mode='build';document.querySelector('#road').classList.remove('active');document.querySelector('#erase').classList.remove('active');flash('Tap an empty area to place '+t.name)}
function showCompany(){
  panelMode='company';s.selected=null;
  clearDynamicBuildButtons();
  clearButtonActions();
  const p=document.querySelector('#panel');
  p.classList.remove('shop-panel','factory-panel','warehouse-panel','research-panel','build-panel');p.classList.add('company-panel');
  p.style.display='block';
  document.querySelector('#objective').style.display='none';
  document.querySelector('#name').textContent='Company';
  document.querySelector('#type').textContent='Expansion';
  const unlocked=s.buildings.length;
  const cap=10+(s.research?.industry||0)*2;
  document.querySelector('#info').innerHTML='<b>'+unlocked+'/'+cap+'</b> buildings • Level '+s.companyLevel+'<br><small>Research Industry to expand your maximum company size.</small>';
  document.querySelector('#shop').style.display='none';
  const items=[
    ['u1','🏭 Production','Factories: '+s.buildings.filter(b=>b.kind==='factory').length],
    ['u2','🏪 Retail','Shops: '+s.buildings.filter(b=>b.kind==='shop').length],
    ['u3','🚚 Network','Roads: '+s.roads.length],
    ['u4','📈 Performance','£'+Math.floor(s.deliveryIncome)+' delivery income • '+s.orders+' deliveries']
  ];
  for(let i=1;i<=4;i++){
    const el=document.querySelector('#u'+i),item=items[i-1];
    el.style.display='block';el.disabled=true;el.innerHTML=item[1]+'<small>'+item[2]+'</small>';
  }
}
function showResearch(){
  panelMode='research';s.selected=null;
  clearDynamicBuildButtons();
  clearButtonActions();
  const p=document.querySelector('#panel');
  p.classList.remove('shop-panel','factory-panel','warehouse-panel','company-panel','build-panel');p.classList.add('research-panel');
  p.style.display='block';
  document.querySelector('#objective').style.display='none';
  document.querySelector('#name').textContent='Research';
  document.querySelector('#type').textContent='Company development';
  document.querySelector('#info').innerHTML='<b>Level '+s.companyLevel+'</b> • XP '+Math.floor(s.xp)+'/'+s.xpToNext;
  document.querySelector('#shop').style.display='none';
  const data=[
    ['u1','automation','⚡ Automation','Faster factory production.'],
    ['u2','logistics','🚚 Logistics','Higher delivery value.'],
    ['u3','industry','🏭 Industry','Increase maximum city size.']
  ];
  for(let i=0;i<4;i++)document.querySelector('#u'+(i+1)).style.display=i<3?'block':'none';
  for(const [id,key,label,desc] of data){
    const el=document.querySelector('#'+id),level=s.research[key]||0;
    el.innerHTML=label+' <span>£'+researchCost(s,key)+'</span><small>Lv '+level+'/3 • '+desc+'</small>';
    el.disabled=level>=3||s.cash<researchCost(s,key);
    el.onclick=()=>{if(research(s,key)){save();sync();showResearch()}};
  }
}
function hidePanel(){const p=document.querySelector('#panel');p.classList.remove('shop-panel','factory-panel','warehouse-panel','research-panel','company-panel','build-panel');panelMode='none';s.selected=null;s.buildMode=null;if(s.mode==='build')s.mode='select';document.querySelector('#panel').style.display='none';document.querySelector('#objective').style.display='';}
function worldPos(e){const sp=screenPos(e);return screenToWorld(sp.x,sp.y,W,H)}
function panBy(dx,dy){panScreen(dx,dy,W,H)}
function screenPos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function toggleMode(m){s.mode=s.mode===m?'select':m;drag=null;document.querySelector('#road').classList.toggle('active',s.mode==='road');document.querySelector('#erase').classList.toggle('active',s.mode==='erase')}
function setZoomAt(screen,z){
  s.camera.zoom=Math.max(.55,Math.min(2.4,z));
  zoomAtScreen(screen.x,screen.y,s.camera.zoom,W,H);
}
canvas.addEventListener('pointerdown',e=>{
  try{canvas.setPointerCapture?.(e.pointerId)}catch{}
  const sp=screenPos(e);
  pointers.set(e.pointerId,sp);
  if(pointers.size===2){
    const [a,b]=[...pointers.values()];
    pinch={d:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),z:s.camera.zoom};
    pinchCenter={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    pinchAngle=Math.atan2(b.y-a.y,b.x-a.x);
    drag=null;
    return;
  }
  const p=worldPos(e);
  if(s.mode==='build'){
    if(s.buildMode&&placeBuilding(s,s.buildMode,p.x,p.y)){markWorldDirty();s.buildMode=null;s.mode='select';save();sync();flash('Building constructed')}
    else flash('Too close to another building or river');
    return;
  }
  if(s.mode==='erase'){if(eraseRoad(s,p))markWorldDirty();save();return}
  if(s.mode==='select'){
    const hit=nearestBuilding(s,p);
    drag={pan:true,last:sp,start:sp,moved:false,hit};
    return;
  }
  if(s.mode==='road'){
    const target=roadTarget(s,p)||p;
    drag={road:true,start:target,startScreen:sp,preview:null,previewStart:null,previewEnd:null,moved:false,last:sp};
    return;
  }
});
canvas.addEventListener('pointermove',e=>{
  const sp=screenPos(e);
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,sp);
  if(pinch&&pointers.size>=2){
    const [a,b]=[...pointers.values()];
    const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const d=Math.max(30,Math.hypot(b.x-a.x,b.y-a.y));
    const ratio=d/pinch.d;
    setZoomAt(pinchCenter,pinch.z*ratio);
    panBy(center.x-pinchCenter.x,center.y-pinchCenter.y);
    const angle=Math.atan2(b.y-a.y,b.x-a.x);
    let da=angle-pinchAngle;
    while(da>Math.PI)da-=Math.PI*2;
    while(da<-Math.PI)da+=Math.PI*2;
    controlCamera(0,0,0,-da,0);
    pinch={d,z:s.camera.zoom};
    pinchAngle=angle;
    pinchCenter=center;
    return;
  }
  if(drag?.pan&&s.mode==='select'){
    const dx=sp.x-drag.last.x,dy=sp.y-drag.last.y;
    if(Math.hypot(sp.x-drag.start.x,sp.y-drag.start.y)>6)drag.moved=true;
    if(drag.moved)panBy(dx,dy);
    drag.last=sp;
    return;
  }
  if(!drag?.road||s.mode!=='road')return;
  const p=worldPos(e);
  if(Math.hypot(sp.x-drag.startScreen.x,sp.y-drag.startScreen.y)>8)drag.moved=true;
  if(drag.moved){
    const endTarget=roadTarget(s,p)||p;
    const preview=roadPreview(s,drag.start,endTarget);
    drag.preview=preview.path;
    drag.previewStart=preview.start;
    drag.previewEnd=preview.end;
    drag.blocked=preview.blocked;
    drag.previewInfo=preview;
    const tip=document.querySelector('#tip');
    if(tip)tip.textContent=roadPreviewTip(preview);
  }
  drag.last=sp;
});
function finish(e){
  pointers.delete(e.pointerId);
  try{canvas.releasePointerCapture?.(e.pointerId)}catch{}
  if(pinch&&pointers.size<2){pinch=null;pinchCenter=null;pinchAngle=0;drag=null;return}
  if(drag?.pan&&s.mode==='select'){
    if(!drag.moved){
      if(drag.hit)showPanel(drag.hit);else hidePanel();
    }
    drag=null;
    return;
  }
  if(drag?.road&&s.mode==='road'){
    if(drag.moved&&drag.preview?.length>=2){
      const result=addRoad(s,drag.preview,{startBuilding:drag.previewStart?.building,endBuilding:drag.previewEnd?.building});
      if(result===true){markWorldDirty();flash('Road built');save();sync()}else flash(roadResultMessage(result,drag.preview));
    }else if(!drag.moved){
      flash('Drag from one point to another to build a road');
    }
  }
  drag=null;
}
canvas.addEventListener('pointerup',finish);
canvas.addEventListener('pointercancel',e=>{
  // Treat a cancelled single-pointer road gesture like pointerup so a
  // browser gesture interruption cannot silently discard a valid road.
  if(drag?.road&&!pinch){
    finish(e);
    return;
  }
  pointers.delete(e.pointerId);
  try{canvas.releasePointerCapture?.(e.pointerId)}catch{}
  pinch=null;pinchCenter=null;pinchAngle=0;drag=null;
});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const sp=screenPos(e);
  setZoomAt(sp,s.camera.zoom*Math.exp(-e.deltaY*.0012));
},{passive:false});
document.querySelector('#gameVersion').textContent='v'+GAME_VERSION;
for(const [id,fn] of [['build',()=>showBuild()],['research',()=>showResearch()],['company',()=>showCompany()],["cameraHome",()=>{s.camera.zoom=1;resetCamera();flash('Camera reset')}],['settings',()=>{document.querySelector('#settingsMenu').style.display='grid';document.querySelector('#changeLog')?.style.removeProperty('display');s.paused=true}],['settingsClose',()=>{document.querySelector('#settingsMenu').style.display='none';s.paused=false}],['road',()=>toggleMode('road')],['erase',()=>toggleMode('erase')],['newgame',reset],['again',reset]])document.querySelector('#'+id)?.addEventListener('click',fn);
for(let i=1;i<=4;i++){const el=document.querySelector('#u'+i);el.onclick=null}
document.querySelector('#shop').onclick=null
let uiTimer=0,saveTimer=0;
function tick(dt){if(!s.paused&&!s.gameOver){updateEconomy(s,dt,flash);for(const p of s.particles)p.t+=dt;s.particles=s.particles.filter(p=>p.t<1);saveTimer+=dt;if(saveTimer>=4){saveTimer=0;save()}}uiTimer-=dt;if(uiTimer<=0||s.gameOver){uiTimer=.08;sync()}if(s.gameOver){document.querySelector('#gameOver').style.display='grid';document.querySelector('#score').textContent=`${s.orders} deliveries • Company Level ${s.companyLevel}.`;save()}}
function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;tick(dt);render(null,s,W,H,canvas);if(drag?.road&&drag.preview)setPreview(drag.preview,drag.previewStart,drag.previewEnd,!!drag.blocked);else setPreview(null);requestAnimationFrame(loop)}window.addEventListener('error',e=>{const el=document.querySelector('#tip');if(el){el.style.display='block';el.textContent='Game error: '+(e.message||'unknown error')}});window.addEventListener('unhandledrejection',e=>{const el=document.querySelector('#tip');if(el){el.style.display='block';el.textContent='Game error: '+(e.reason?.message||e.reason||'unknown error')}});sync();requestAnimationFrame(loop);