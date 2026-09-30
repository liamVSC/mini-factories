import {riverY} from './world.js';

// Keep the game usable when WebGL/Three.js cannot initialise on a mobile browser.
// The normal 3D renderer is loaded lazily; a lightweight 2D renderer takes over if
// the CDN or WebGL context fails instead of leaving the player on a blank beige canvas.
let renderer3d=null;
let rendererFailed=false;
let previewState=null;
let fallbackCamera={x:0,y:0,zoom:1};
let fallbackSize={w:1,h:1};
let loadPromise=import('./render3d.js').then(m=>{renderer3d=m}).catch(()=>{rendererFailed=true;renderer3d=null});

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function screenToFallback(x,y){return{x:(x-fallbackSize.w/2)/fallbackCamera.zoom+fallbackCamera.x,y:(y-fallbackSize.h/2)/fallbackCamera.zoom+fallbackCamera.y}}
function worldToFallback(x,y){return{x:fallbackSize.w/2+(x-fallbackCamera.x)*fallbackCamera.zoom,y:fallbackSize.h/2+(y-fallbackCamera.y)*fallbackCamera.zoom}}
function roadLine(ctx,points){if(!points?.length)return;ctx.beginPath();points.forEach((p,i)=>{const q=worldToFallback(p.x,p.y);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y)});ctx.stroke()}
function drawFallback(s,W,H,canvas){
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#b7c79d';ctx.fillRect(0,0,W,H);
  // River
  ctx.beginPath();
  for(let x=-1200;x<=1200;x+=20){const q=worldToFallback(x,riverY(x)-41);if(x===-1200)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y)}
  for(let x=1200;x>=-1200;x-=20){const q=worldToFallback(x,riverY(x)+41);ctx.lineTo(q.x,q.y)}
  ctx.closePath();ctx.fillStyle='#5f9db3';ctx.fill();
  // Roads
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const r of s.roads||[]){ctx.lineWidth=22*fallbackCamera.zoom;ctx.strokeStyle=r.bridge?'#755638':'#3f4648';roadLine(ctx,r.points);ctx.stroke();ctx.lineWidth=2*fallbackCamera.zoom;ctx.strokeStyle='#d9c56d';roadLine(ctx,r.points);ctx.stroke()}
  // Road preview
  const p=Array.isArray(previewState?.path)?previewState.path:null;
  if(p&&p.length>=2){ctx.lineWidth=18*fallbackCamera.zoom;ctx.strokeStyle=previewState.blocked?'#d85a52':'#58a6d8';roadLine(ctx,p);ctx.stroke()}
  // Buildings
  for(const b of s.buildings||[]){const q=worldToFallback(b.x,b.y);const w=(b.kind==='warehouse'?96:b.kind==='factory'?78:70)*fallbackCamera.zoom;const h=(b.kind==='warehouse'?66:b.kind==='factory'?62:56)*fallbackCamera.zoom;ctx.fillStyle=b.color||'#c7b89f';ctx.fillRect(q.x-w/2,q.y-h/2,w,h);ctx.strokeStyle='#465158';ctx.lineWidth=2;ctx.strokeRect(q.x-w/2,q.y-h/2,w,h);ctx.fillStyle='#26353c';ctx.font=`${Math.max(9,11*fallbackCamera.zoom)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.type,q.x,q.y)}
  // Trucks
  for(const t of s.trucks||[]){if(!t.route?.length)continue;const p=t.route[Math.min(t.route.length-1,Math.floor((t.t||0)*(t.route.length-1)))];if(!p)continue;const q=worldToFallback(p.x,p.y);ctx.fillStyle=t.longDistance?'#8755c7':'#d79234';ctx.fillRect(q.x-7,q.y-4,14,8)}
  // Selection
  if(s.selected){const q=worldToFallback(s.selected.x,s.selected.y);ctx.beginPath();ctx.arc(q.x,q.y,34*fallbackCamera.zoom,0,Math.PI*2);ctx.strokeStyle='#ffd45a';ctx.lineWidth=3;ctx.stroke()}
}

export function render(s,W,H,canvas=document.querySelector('#game')){
  fallbackSize={w:Math.max(1,W),h:Math.max(1,H)};
  if(renderer3d&&!rendererFailed){
    try{renderer3d.render(null,s,W,H,canvas);return}catch(error){rendererFailed=true;renderer3d=null;console.warn('3D renderer unavailable; using mobile-safe fallback.',error)}
  }
  drawFallback(s,W,H,canvas);
}
export function setPreview(path,start,end,blocked=false){
  previewState={path,start,end,blocked,points:path};
  if(renderer3d&&!rendererFailed){try{renderer3d.setPreview(path,start,end,blocked)}catch{rendererFailed=true;renderer3d=null}}
}
export function resizeRenderer(W,H){fallbackSize={w:Math.max(1,W),h:Math.max(1,H)};try{renderer3d?.resizeRenderer(W,H)}catch{rendererFailed=true;renderer3d=null}}
export function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){fallbackCamera.x+=dx;fallbackCamera.y+=dy;fallbackCamera.zoom=clamp(fallbackCamera.zoom*(distanceDelta<0?1.05:distanceDelta>0?.95:1),.55,2.4);try{renderer3d?.controlCamera(dx,dy,distanceDelta,yawDelta,pitchDelta)}catch{rendererFailed=true;renderer3d=null}}
export function cameraPointFromScreen(x,y){return screenToFallback(x,y)}
export function screenToWorld(x,y){if(renderer3d&&!rendererFailed){try{return renderer3d.screenToWorld(x,y,fallbackSize.w,fallbackSize.h)}catch{rendererFailed=true;renderer3d=null}}return screenToFallback(x,y)}
export function worldToScreen(x,y){if(renderer3d&&!rendererFailed){try{return renderer3d.worldToScreen(x,y,fallbackSize.w,fallbackSize.h)}catch{rendererFailed=true;renderer3d=null}}return worldToFallback(x,y)}
export function panScreen(dx,dy){const before=screenToFallback(fallbackSize.w/2,fallbackSize.h/2);const after=screenToFallback(fallbackSize.w/2-dx,fallbackSize.h/2-dy);fallbackCamera.x+=after.x-before.x;fallbackCamera.y+=after.y-before.y;try{renderer3d?.panScreen(dx,dy,fallbackSize.w,fallbackSize.h)}catch{rendererFailed=true;renderer3d=null}return{x:after.x-before.x,y:after.y-before.y}}
export function zoomAtScreen(x,y,nextZoom){const zoom=clamp(Number(nextZoom)||1,.55,2.4);const before=screenToFallback(x,y);fallbackCamera.zoom=zoom;const after=screenToFallback(x,y);fallbackCamera.x+=before.x-after.x;fallbackCamera.y+=before.y-after.y;try{renderer3d?.zoomAtScreen(x,y,zoom,fallbackSize.w,fallbackSize.h)}catch{rendererFailed=true;renderer3d=null}return zoom}
export function resetCamera(){fallbackCamera={x:0,y:0,zoom:1};try{renderer3d?.resetCamera()}catch{rendererFailed=true;renderer3d=null}}
export function focusCamera(x,y){fallbackCamera.x=Number(x)||0;fallbackCamera.y=Number(y)||0;try{renderer3d?.focusCamera(x,y)}catch{rendererFailed=true;renderer3d=null}}

// Give Three.js a moment to load before the first render without blocking the UI.
void loadPromise;
