import {freshState,hydrate,serialise,TYPES} from './state.js';
import {seed,nearestBuilding,nearestRoad,roadPath,addRoad,eraseRoad,dist,buildingCost,buildingUnlock,canBuild,placeBuilding} from './world.js';
import {updateEconomy,upgrade,newContract,research,researchCost} from './economy.js';
import {render} from './render.js';

const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');let W=0,H=0,dpr=1;let s=load();let drag=null;let pointers=new Map();let pinch=null;let last=performance.now();let pinchCenter=null;let panelMode='none';
function resize(){dpr=devicePixelRatio||1;W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}addEventListener('resize',resize);resize();clampCamera();
function load(){try{const d=JSON.parse(localStorage.getItem('miniFactoriesSaveV6'));const h=hydrate(d);if(h)return h}catch{}const n=freshState();seed(n);for(const b of n.buildings.filter(b=>b.kind==='shop'))newContract(n,b);return n}
function save(){if(s.gameOver)return;try{localStorage.setItem('miniFactoriesSaveV6',JSON.stringify(serialise(s)))}catch{}}
function flash(text){const el=document.querySelector('#tip');el.textContent=text;clearTimeout(flash.timer);flash.timer=setTimeout(()=>el.textContent='Build roads between factories and shops.',1200)}
function reset(){localStorage.removeItem('miniFactoriesSaveV6');s=freshState();seed(s);for(const b of s.buildings.filter(b=>b.kind==='shop'))newContract(s,b);document.querySelector('#pauseMenu').style.display='none';document.querySelector('#gameOver').style.display='none';s.paused=false;document.querySelector('#pause').textContent='Ⅱ Pause';hidePanel();sync();flash('New factory started')}
function sync(){document.querySelector('#cash').textContent='£'+Math.floor(s.cash);document.querySelector('#orders').textContent=s.orders;document.querySelector('#companyLevel').textContent=s.companyLevel;document.querySelector('#roads').textContent=s.roadBudget;const g=s.goals[s.objective];document.querySelector('#objective').innerHTML=g?`<b>Goal ${s.objective+1}/6</b> • ${g.text} <span>${Math.min(g.target,Math.floor(g.progress(s)))}/${g.target}</span>`:'All objectives complete';const p=document.querySelector('#panel');if(panelMode==='building'&&s.selected&&p.style.display!=='none')showPanel(s.selected);}
function showPanel(b){
  panelMode='building';
  const p=document.querySelector('#panel');
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
  }

  const shop=document.querySelector('#shop');
  shop.style.display=b.kind==='shop'?'block':'none';
  if(b.kind==='shop'){
    shop.innerHTML='🏪 Upgrade shop <span>£'+(220*b.level)+'</span><small>Increase capacity and customer demand.</small>';
    shop.disabled=b.level>=3;
  }
}
function showBuild(){
  panelMode='build';s.selected=null;
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
function clampCamera(){const margin=180;const worldW=W/s.camera.zoom,worldH=H/s.camera.zoom;const minX=W/2-(worldW-margin),maxX=W/2+(worldW-margin),minY=H/2-(worldH-margin),maxY=H/2+(worldH-margin);s.camera.x=Math.max(Math.min(s.camera.x,maxX),minX);s.camera.y=Math.max(Math.min(s.camera.y,maxY),minY)}
function panBy(dx,dy){s.camera.x+=dx;s.camera.y+=dy;clampCamera()}
function screenPos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function toggleMode(m){s.mode=s.mode===m?'select':m;document.querySelector('#road').classList.toggle('active',s.mode==='road');document.querySelector('#erase').classList.toggle('active',s.mode==='erase')}
canvas.addEventListener('pointerdown',e=>{try{canvas.setPointerCapture?.(e.pointerId)}catch{}pointers.set(e.pointerId,screenPos(e));if(pointers.size===2){const a=[...pointers.values()][0],b=[...pointers.values()][1];pinch={d:Math.hypot(b.x-a.x,b.y-a.y),z:s.camera.zoom,cx:s.camera.x,cy:s.camera.y};pinchCenter={x:(a.x+b.x)/2,y:(a.y+b.y)/2};drag=null;return}const p=worldPos(e);if(s.mode==='build'){if(s.buildMode&&placeBuilding(s,s.buildMode,p.x,p.y)){s.buildMode=null;s.mode='select';save();sync();flash('Building constructed');}else flash('Too close to another building or river');return}if(s.mode==='erase'){eraseRoad(s,p);save();return}if(s.mode==='select'){s.selected=nearestBuilding(s,p);if(s.selected)showPanel(s.selected);else hidePanel();if(!s.selected)drag={pan:true,last:screenPos(e)};return}const start=nearestRoad(s,p)||nearestBuilding(s,p)||p;drag={start,building:nearestBuilding(s,start),armed:false};canvas.setPointerCapture?.(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(pointers.has(e.pointerId))pointers.set(e.pointerId,screenPos(e));if(pinch&&pointers.size>=2){const a=[...pointers.values()][0],b=[...pointers.values()][1],d=Math.max(30,Math.hypot(b.x-a.x,b.y-a.y)),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const z=Math.max(.55,Math.min(2,pinch.z*d/pinch.d));const anchor=worldFromScreen(pinchCenter);s.camera.zoom=z;const anchored=worldFromScreen(pinchCenter);s.camera.x+=(anchored.x-anchor.x)*s.camera.zoom;s.camera.y+=(anchored.y-anchor.y)*s.camera.zoom;panBy(center.x-pinchCenter.x,center.y-pinchCenter.y);pinchCenter=center;return}if(drag?.pan&&s.mode==='select'){const q=screenPos(e);panBy(q.x-drag.last.x,q.y-drag.last.y);drag.last=q;return}if(!drag||s.mode!=='road')return;const p=worldPos(e);if(dist(drag.start,p)>8){drag.armed=true;drag.preview=roadPath(s,drag.start,p)}});
function finish(e){pointers.delete(e.pointerId);try{canvas.releasePointerCapture?.(e.pointerId)}catch{}if(pinch&&pointers.size<2){pinch=null;pinchCenter=null;drag=null;return}if(drag?.armed){const p=worldPos(e),path=roadPath(s,drag.start,p);if(addRoad(s,path)){flash('Road built');save()}else flash('Not enough road budget or cash')}drag=null}
canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
for(const [id,fn] of [['build',()=>showBuild()],['research',()=>showResearch()],['company',()=>showCompany()],['road',()=>toggleMode('road')],['erase',()=>toggleMode('erase')],['pause',()=>{s.paused=!s.paused;document.querySelector('#pauseMenu').style.display=s.paused?'grid':'none';document.querySelector('#pause').textContent=s.paused?'▶ Resume':'Ⅱ Pause'}],['resume',()=>{s.paused=false;document.querySelector('#pauseMenu').style.display='none';document.querySelector('#pause').textContent='Ⅱ Pause'}],['newgame',reset],['again',reset]])document.querySelector('#'+id)?.addEventListener('click',fn);
for(let i=1;i<=4;i++)document.querySelector('#u'+i).addEventListener('click',()=>{if(s.selected&&upgrade(s,s.selected,i)){save();sync();showPanel(s.selected)}});document.querySelector('#shop').addEventListener('click',()=>{if(s.selected&&upgrade(s,s.selected,1)){save();sync();showPanel(s.selected)}});
let uiTimer=0;
function tick(dt){if(!s.paused&&!s.gameOver){updateEconomy(s,dt,flash);for(const p of s.particles)p.t+=dt;s.particles=s.particles.filter(p=>p.t<1);if(Math.random()<dt*.5)save()}uiTimer-=dt;if(uiTimer<=0||s.gameOver){uiTimer=.08;sync()}if(s.gameOver){document.querySelector('#gameOver').style.display='grid';document.querySelector('#score').textContent=`${s.orders} deliveries • Company Level ${s.companyLevel}.`;save()}}
function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;tick(dt);render(ctx,s,W,H);if(drag?.armed){const p=drag.preview;if(p){ctx.save();ctx.translate(s.camera.x,s.camera.y);ctx.scale(s.camera.zoom,s.camera.zoom);ctx.translate(-W/2,-H/2);ctx.strokeStyle='#8bd5ff99';ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);ctx.stroke();ctx.restore()}}requestAnimationFrame(loop)}window.addEventListener('error',e=>{const el=document.querySelector('#tip');if(el){el.style.display='block';el.textContent='Game error: '+(e.message||'unknown error')}});window.addEventListener('unhandledrejection',e=>{const el=document.querySelector('#tip');if(el){el.style.display='block';el.textContent='Game error: '+(e.reason?.message||e.reason||'unknown error')}});sync();requestAnimationFrame(loop);