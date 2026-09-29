import {freshState,hydrate,serialise,TYPES} from './state.js';
import {seed,nearestBuilding,nearestRoad,roadPath,roadPreview,addRoad,eraseRoad,dist,buildingCost,buildingUnlock,canBuild,placeBuilding} from './world.js';
import {updateEconomy,upgrade,newContract,research,researchCost} from './economy.js';
import {render} from './render.js';

const GAME_VERSION='1.0.5';
const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');let W=0,H=0,dpr=1;let s=load();let drag=null;let roadStart=null;let pointers=new Map();let pinch=null;let last=performance.now();let pinchCenter=null;let panelMode='none';
function resize(){dpr=devicePixelRatio||1;W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);if(s?.camera)clampCamera()}addEventListener('resize',resize);resize();clampCamera();
function load(){try{const d=JSON.parse(localStorage.getItem('miniFactoriesSaveV6'));const h=hydrate(d);if(h)return h}catch{}const n=freshState();seed(n);for(const b of n.buildings.filter(b=>b.kind==='shop'))newContract(n,b);return n}
function save(){if(s.gameOver)return;try{localStorage.setItem('miniFactoriesSaveV6',JSON.stringify(serialise(s)))}catch(e){flash('Save failed — storage unavailable')}}
function flash(text){const el=document.querySelector('#tip');el.textContent=text;clearTimeout(flash.timer);flash.timer=setTimeout(()=>el.textContent='Build roads between factories and shops.',1200)}
function reset(){localStorage.removeItem('miniFactoriesSaveV6');s=freshState();seed(s);for(const b of s.buildings.filter(b=>b.kind==='shop'))newContract(s,b);document.querySelector('#settingsMenu').style.display='none';document.querySelector('#gameOver').style.display='none';s.paused=false;hidePanel();sync();save();flash('New factory started')}
function sync(){document.querySelector('#cash').textContent='£'+Math.floor(s.cash);document.querySelector('#orders').textContent=s.orders;document.querySelector('#companyLevel').textContent=s.companyLevel;document.querySelector('#roads').textContent=s.roadBudget;const g=s.goals[s.objective];document.querySelector('#objective').innerHTML=g?`<b>Goal ${s.objective+1}/6</b> • ${g.text} <span>${Math.min(g.target,Math.floor(g.progress(s)))}/${g.target}</span>`:'All objectives complete';const p=document.querySelector('#panel');if(panelMode==='building'&&s.selected&&p.style.display!=='none')showPanel(s.selected);}
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
  const p=document.querySelector('#panel');p.style.display='block';document.querySelector('#objective').style.display='none';
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
    ['u3','🚚 Network','Roads: '+s.roads.length+' • Budget: '+s.roadBudget],
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
function hidePanel(){panelMode='none';s.selected=null;s.buildMode=null;if(s.mode==='build')s.mode='select';document.querySelector('#panel').style.display='none';document.querySelector('#objective').style.display='';}
function worldPos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left-s.camera.x)/s.camera.zoom+W/2,y:(e.clientY-r.top-s.camera.y)/s.camera.zoom+H/2}}
function worldFromScreen(p){return{x:(p.x-s.camera.x)/s.camera.zoom+W/2,y:(p.y-s.camera.y)/s.camera.zoom+H/2}}
function worldBounds(){
  const pad=260;
  const points=[];
  for(const b of s.buildings)points.push({x:b.x,y:b.y});
  for(const r of s.roads)for(const p of r.points)points.push({x:p.x,y:p.y});
  if(!points.length)return {minX:-500,maxX:500,minY:-500,maxY:500};
  let minX=points[0].x,maxX=points[0].x,minY=points[0].y,maxY=points[0].y;
  for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)}
  return {minX:minX-pad,maxX:maxX+pad,minY:minY-pad,maxY:maxY+pad};
}
function clampCamera(){
  const b=worldBounds();
  const halfW=W/(2*s.camera.zoom),halfH=H/(2*s.camera.zoom);
  const centerX=(b.minX+b.maxX)/2,centerY=(b.minY+b.maxY)/2;
  const spanX=b.maxX-b.minX,spanY=b.maxY-b.minY;
  if(spanX<=halfW*2)s.camera.x=W/2-(centerX-W/2)*s.camera.zoom;
  else{
    const minCam=W/2-(b.maxX-halfW)*s.camera.zoom;
    const maxCam=W/2-(b.minX+halfW)*s.camera.zoom;
    s.camera.x=Math.max(minCam,Math.min(maxCam,s.camera.x));
  }
  if(spanY<=halfH*2)s.camera.y=H/2-(centerY-H/2)*s.camera.zoom;
  else{
    const minCam=H/2-(b.maxY-halfH)*s.camera.zoom;
    const maxCam=H/2-(b.minY+halfH)*s.camera.zoom;
    s.camera.y=Math.max(minCam,Math.min(maxCam,s.camera.y));
  }
}
function panBy(dx,dy){s.camera.x+=dx;s.camera.y+=dy;clampCamera()}
function screenPos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function toggleMode(m){s.mode=s.mode===m?'select':m;roadStart=null;document.querySelector('#road').classList.toggle('active',s.mode==='road');document.querySelector('#erase').classList.toggle('active',s.mode==='erase')}
function setZoomAt(screen,z){
  const before=worldFromScreen(screen);
  s.camera.zoom=Math.max(.55,Math.min(2,z));
  s.camera.x=screen.x-(before.x-W/2)*s.camera.zoom;
  s.camera.y=screen.y-(before.y-H/2)*s.camera.zoom;
  clampCamera();
}
canvas.addEventListener('pointerdown',e=>{
  try{canvas.setPointerCapture?.(e.pointerId)}catch{}
  const sp=screenPos(e);
  pointers.set(e.pointerId,sp);
  if(pointers.size===2){
    const [a,b]=[...pointers.values()];
    pinch={d:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),z:s.camera.zoom};
    pinchCenter={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    drag=null;
    return;
  }
  const p=worldPos(e);
  if(s.mode==='build'){
    if(s.buildMode&&placeBuilding(s,s.buildMode,p.x,p.y)){s.buildMode=null;s.mode='select';save();sync();flash('Building constructed')}
    else flash('Too close to another building or river');
    return;
  }
  if(s.mode==='erase'){eraseRoad(s,p);save();return}
  if(s.mode==='road'&&roadStart){
    drag={start:roadStart,armed:false};
    return;
  }
  if(s.mode==='select'){
    const hit=nearestBuilding(s,p);
    drag={pan:true,last:sp,start:sp,moved:false,hit};
    return;
  }
  const start=nearestRoad(s,p)||nearestBuilding(s,p)||p;
  drag={start,building:nearestBuilding(s,start),armed:false};
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
    pinch={d,z:s.camera.zoom};
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
  if(!drag||s.mode!=='road')return;
  const p=worldPos(e);
  if(dist(drag.start,p)>8){
    drag.armed=true;
    const preview=roadPreview(s,drag.start,p);
    drag.preview=preview.path;
    drag.previewStart=preview.start;
    drag.previewEnd=preview.end;
    drag.snappedStart=preview.snappedStart;
    drag.snappedEnd=preview.snappedEnd;
  }
});
function finish(e){
  const sp=screenPos(e);
  pointers.delete(e.pointerId);
  try{canvas.releasePointerCapture?.(e.pointerId)}catch{}
  if(pinch&&pointers.size<2){pinch=null;pinchCenter=null;drag=null;return}
  if(drag?.pan&&s.mode==='select'){
    if(!drag.moved){
      if(drag.hit)showPanel(drag.hit);else hidePanel();
    }
    drag=null;
    return;
  }
  if(drag?.armed){
    const p=worldPos(e),preview=roadPreview(s,drag.start,p),path=preview.path;
    if(addRoad(s,path)){flash('Road built');save();roadStart=null}
    else flash('Not enough road budget or cash');
  }else if(s.mode==='road'){
    const p=worldPos(e);
    const snapped=nearestRoad(s,p)||nearestBuilding(s,p)||p;
    if(!roadStart){roadStart=snapped;flash('Start set — tap or drag to the road end')}
    else{
      const preview=roadPreview(s,roadStart,p);
      if(addRoad(s,preview.path)){flash('Road built');save();roadStart=null}
      else flash('Not enough road budget or cash');
    }
  }
  drag=null;
}
canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
document.querySelector('#gameVersion').textContent='v'+GAME_VERSION;
for(const [id,fn] of [['build',()=>showBuild()],['research',()=>showResearch()],['company',()=>showCompany()],['settings',()=>{document.querySelector('#settingsMenu').style.display='grid';s.paused=true}],['settingsClose',()=>{document.querySelector('#settingsMenu').style.display='none';s.paused=false}],['road',()=>toggleMode('road')],['erase',()=>toggleMode('erase')],['newgame',reset],['again',reset]])document.querySelector('#'+id)?.addEventListener('click',fn);
for(let i=1;i<=4;i++){const el=document.querySelector('#u'+i);el.onclick=null}
document.querySelector('#shop').onclick=null
let uiTimer=0;
function tick(dt){if(!s.paused&&!s.gameOver){updateEconomy(s,dt,flash);for(const p of s.particles)p.t+=dt;s.particles=s.particles.filter(p=>p.t<1);if(Math.random()<dt*.5)save()}uiTimer-=dt;if(uiTimer<=0||s.gameOver){uiTimer=.08;sync()}if(s.gameOver){document.querySelector('#gameOver').style.display='grid';document.querySelector('#score').textContent=`${s.orders} deliveries • Company Level ${s.companyLevel}.`;save()}}
function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;tick(dt);render(ctx,s,W,H);if((drag?.armed&&drag.preview)||roadStart){
  ctx.save();ctx.translate(s.camera.x,s.camera.y);ctx.scale(s.camera.zoom,s.camera.zoom);ctx.translate(-W/2,-H/2);
  const roadDraw=drag?.preview||[roadStart,roadStart];
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='#24313a55';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(roadDraw[0].x,roadDraw[0].y);for(let i=1;i<roadDraw.length;i++)ctx.lineTo(roadDraw[i].x,roadDraw[i].y);ctx.stroke();
  ctx.strokeStyle='#58a6d8';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(roadDraw[0].x,roadDraw[0].y);for(let i=1;i<roadDraw.length;i++)ctx.lineTo(roadDraw[i].x,roadDraw[i].y);ctx.stroke();
  for(const q of [drag?.previewStart||roadStart,drag?.previewEnd])if(q&&q.distance<Infinity){ctx.fillStyle='#fff9eb';ctx.beginPath();ctx.arc(q.x,q.y,8,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#247ba0';ctx.lineWidth=3;ctx.stroke()}
  ctx.restore()
}requestAnimationFrame(loop)}window.addEventListener('error',e=>{const el=document.querySelector('#tip');if(el){el.style.display='block';el.textContent='Game error: '+(e.message||'unknown error')}});window.addEventListener('unhandledrejection',e=>{const el=document.querySelector('#tip');if(el){el.style.display='block';el.textContent='Game error: '+(e.reason?.message||e.reason||'unknown error')}});sync();requestAnimationFrame(loop);