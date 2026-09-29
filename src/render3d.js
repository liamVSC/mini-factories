import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm';

let renderer=null,scene=null,camera3d=null,root=null,previewGroup=null;
let target={x:0,z:0,yaw:0,pitch:.82,distance:620};
let desired={...target};
let home={x:0,z:0};
let cameraReady=false;
let viewport={width:1,height:1};
const meshes=new Map();

function mat(color,roughness=.8,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function box(w,h,d,color){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));}
function makeRoad(points,bridge){
  if(!Array.isArray(points)||points.length<2)return new THREE.Group();
  const group=new THREE.Group();
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p.x,.04,p.y)),false,'catmullrom',.15);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(8,points.length*10),bridge?4.8:5.8,8,false),mat(bridge?'#9b6f3f':'#3f4648')));
  if(!bridge){const lc=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p.x,.18,p.y)),false,'catmullrom',.15);group.add(new THREE.Mesh(new THREE.TubeGeometry(lc,Math.max(8,points.length*10),.42,6,false),mat('#d9c56d')));}
  return group;
}
function addBuilding(b){
  const g=new THREE.Group(),factory=b.kind==='factory',warehouse=b.kind==='warehouse';
  const w=factory?78:warehouse?96:70,d=factory?62:warehouse?66:56,h=factory?22:warehouse?18:14;
  const base=box(w,h,d,factory?'#aeb7b2':warehouse?'#b4b7b3':'#c7b89f');base.position.y=h/2;g.add(base);
  const roof=box(w+6,2,d+6,factory?'#465158':warehouse?'#4d5658':'#5a5149');roof.position.y=h+1;g.add(roof);
  const trim=box(w*.82,1.2,.8,b.color||'#d9c46a');trim.position.set(0,h*.58,d/2+.6);g.add(trim);
  if(factory){for(let i=-2;i<=2;i++){const win=box(8,6,.7,'#6f9ba5');win.position.set(i*13,h*.55,d/2+.5);g.add(win);}const door=box(20,10,.8,'#354247');door.position.set(0,5,d/2+.5);g.add(door);const chimney=box(9,32,9,'#667176');chimney.position.set(w*.28,32,d*.15);g.add(chimney);const cap=box(12,2,12,'#7f898d');cap.position.set(w*.28,48,d*.15);g.add(cap);const tank=new THREE.Mesh(new THREE.CylinderGeometry(7,7,18,16),mat('#7f898b'));tank.position.set(-w*.27,9,d*.1);g.add(tank);}
  else if(warehouse){for(let i=-2;i<=2;i++){const door=box(14,9,.8,'#465156');door.position.set(i*17,5,d/2+.5);g.add(door);}const sign=box(52,5,.8,'#d9b95f');sign.position.set(0,h*.72,d/2+.6);g.add(sign);}
  else{const glass=box(w*.58,7,.7,'#8ba9aa');glass.position.set(-4,6,d/2+.5);g.add(glass);const door=box(9,9,.8,'#536466');door.position.set(w*.30,5,d/2+.5);g.add(door);const awning=box(w*.9,2.2,5,b.color||'#d58f65');awning.position.set(0,h*.67,d/2+2.2);g.add(awning);}
  g.position.set(Number(b.x)||0,0,Number(b.y)||0);g.userData.building=b;g.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(g);meshes.set(b.id,g);
}
function updateBuilding(b,selected){const g=meshes.get(b.id);if(!g)return;g.position.set(Number(b.x)||0,0,Number(b.y)||0);g.scale.setScalar(selected?1.035:1);}
function clearDynamic(){for(const g of meshes.values())scene.remove(g);meshes.clear();}
function init(canvas){
  if(renderer)return;
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#9eaf88');root=new THREE.Group();scene.add(root);previewGroup=new THREE.Group();scene.add(previewGroup);
  scene.add(new THREE.HemisphereLight('#f7f2df','#68745e',2.1));
  const sun=new THREE.DirectionalLight('#fff1cf',3.2);sun.position.set(-240,320,180);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
  const ground=box(2600,2,2600,'#b7c79d');ground.position.y=-1;ground.receiveShadow=true;scene.add(ground);
  const water=box(2600,.7,78,'#5f9db3');water.position.set(0,.1,0);scene.add(water);
  resize(canvas.clientWidth||innerWidth,canvas.clientHeight||innerHeight);
}
function resize(w,h){
  if(!renderer)return;
  viewport.width=Math.max(1,w);viewport.height=Math.max(1,h);
  renderer.setSize(viewport.width,viewport.height,false);
  if(camera3d)camera3d.updateProjectionMatrix();
}
function syncWorld(s){
  if(!scene)return;clearDynamic();
  const pts=[];for(const b of s.buildings||[]){addBuilding(b);if(Number.isFinite(b.x)&&Number.isFinite(b.y))pts.push({x:b.x,z:b.y});}
  for(const r of s.roads||[]){scene.add(makeRoad(r.points,!!r.bridge));for(const p of r.points||[])if(Number.isFinite(p.x)&&Number.isFinite(p.y))pts.push({x:p.x,z:p.y});}
  if(pts.length){home={x:pts.reduce((n,p)=>n+p.x,0)/pts.length,z:pts.reduce((n,p)=>n+p.z,0)/pts.length};if(!cameraReady){desired.x=home.x;desired.z=home.z;target.x=home.x;target.z=home.z;}}
}
function updateCamera(s,W,H){
  const zoom=Math.max(.55,Math.min(2.4,s.camera.zoom||1));
  desired.distance=Math.max(320,Math.min(980,Math.max(W,H)*1.05))/zoom;
  if(!cameraReady){desired.x=home.x;desired.z=home.z;target={...desired,yaw:0,pitch:.82};cameraReady=true;}
  const ease=1-Math.pow(.001,1/60);for(const k of ['x','z','distance','yaw','pitch'])target[k]=THREE.MathUtils.lerp(target[k],desired[k],ease);
  const aspect=Math.max(.1,W/H),half=Math.max(150,target.distance*.55);if(!camera3d)camera3d=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,3000);camera3d.left=-half*aspect;camera3d.right=half*aspect;camera3d.top=half;camera3d.bottom=-half;
  const cp=Math.cos(target.pitch);camera3d.position.set(target.x+Math.sin(target.yaw)*target.distance*cp,Math.sin(target.pitch)*target.distance,target.z+Math.cos(target.yaw)*target.distance*cp);camera3d.lookAt(target.x,0,target.z);camera3d.updateProjectionMatrix();
}
export function resetCamera(){desired.x=home.x;desired.z=home.z;desired.yaw=0;desired.pitch=.82;desired.distance=620;target={...desired};}
export function focusCamera(x,z){desired.x=Number(x)||home.x;desired.z=Number(z)||home.z;}
export function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){desired.x+=dx;desired.z+=dy;desired.distance=Math.max(280,Math.min(1100,desired.distance+distanceDelta));desired.yaw+=yawDelta;desired.pitch=Math.max(.52,Math.min(1.18,desired.pitch+pitchDelta));}
export function screenToWorld(x,y,W,H){const p=cameraPointFromScreen(x,y,W,H);return{x:p.x,y:p.z};}
export function worldToScreen(x,z,W,H){if(!camera3d)return{x:W/2,y:H/2};const v=new THREE.Vector3(Number(x)||0,0,Number(z)||0);v.project(camera3d);return{x:(v.x+1)*.5*W,y:(1-v.y)*.5*H};}
export function panScreen(dx,dy,W,H){if(!camera3d)return;const a=cameraPointFromScreen(W*.5,H*.5,W,H);const b=cameraPointFromScreen(W*.5-dx,H*.5-dy,W,H);desired.x+=a.x-b.x;desired.z+=a.z-b.z;}
export function zoomAtScreen(x,y,nextZoom,W,H){if(!camera3d)return;const before=cameraPointFromScreen(x,y,W,H);const clamped=Math.max(.55,Math.min(2.4,nextZoom));const oldDistance=desired.distance;desired.distance=Math.max(320,Math.min(980,Math.max(W,H)*1.05))/clamped;const cp=Math.cos(desired.pitch);const pos=new THREE.Vector3(desired.x+Math.sin(desired.yaw)*desired.distance*cp,Math.sin(desired.pitch)*desired.distance,desired.z+Math.cos(desired.yaw)*desired.distance*cp);const saved=camera3d.position.clone();const savedTarget={x:target.x,z:target.z};target.x=desired.x;target.z=desired.z;target.distance=desired.distance;camera3d.position.copy(pos);camera3d.lookAt(desired.x,0,desired.z);camera3d.updateProjectionMatrix();const after=cameraPointFromScreen(x,y,W,H);desired.x+=before.x-after.x;desired.z+=before.z-after.z;target.x=savedTarget.x;target.z=savedTarget.z;target.distance=oldDistance;camera3d.position.copy(saved);return clamped;}
export function cameraPointFromScreen(x,y,W=viewport.width,H=viewport.height){
  if(!camera3d)return{x:home.x,z:home.z};
  const ndc=new THREE.Vector3((x/W)*2-1,-(y/H)*2+1,0);
  ndc.unproject(camera3d);
  const dir=ndc.sub(camera3d.position).normalize();
  const t=-camera3d.position.y/dir.y;
  return{x:camera3d.position.x+dir.x*t,z:camera3d.position.z+dir.z*t};
}
export function screenToWorld(x,y,W=viewport.width,H=viewport.height){return cameraPointFromScreen(x,y,W,H);}
export function worldToScreen(x,z,W=viewport.width,H=viewport.height){
  if(!camera3d)return{x:W/2,y:H/2,visible:false};
  const p=new THREE.Vector3(x,0,z).project(camera3d);
  return{x:(p.x+1)*.5*W,y:(1-p.y)*.5*H,visible:p.z>=-1&&p.z<=1};
}
export function panScreen(dx,dy,W=viewport.width,H=viewport.height){
  const a=cameraPointFromScreen(W/2,H/2,W,H),b=cameraPointFromScreen(W/2-dx,H/2-dy,W,H);
  controlCamera(b.x-a.x,b.z-a.z);
  return{x:b.x-a.x,z:b.z-a.z};
}
export function zoomAtScreen(x,y,zoomFactor,W=viewport.width,H=viewport.height){
  const before=cameraPointFromScreen(x,y,W,H);
  const current=Math.max(.55,Math.min(2.4,Number(desired.zoom)||Math.max(.55,Math.min(2.4,620/Math.max(1,desired.distance)))));
  const next=Math.max(.55,Math.min(2.4,current*zoomFactor));
  desired.distance=Math.max(280,Math.min(1100,Math.max(W,H)*1.05/next));
  updateCamera({camera:{zoom:next}},W,H);
  const after=cameraPointFromScreen(x,y,W,H);
  controlCamera(before.x-after.x,before.z-after.z);
  return next;
}
function drawTrucks(s){for(const [id,g] of [...meshes].filter(([k])=>String(k).startsWith('truck:'))){scene.remove(g);meshes.delete(id);}for(const t of s.trucks||[]){if(!t.route?.length)continue;const i=Math.min(t.route.length-1,Math.floor(t.t*(t.route.length-1))),p=t.route[i],q=t.route[Math.min(t.route.length-1,i+1)],g=new THREE.Group();const body=box(14,6,25,t.longDistance?'#8755c7':'#d79234');body.position.y=5;g.add(body);const cab=box(12,7,9,'#d9b75e');cab.position.set(0,6,8);g.add(cab);const wm=mat('#202729');for(const x of [-7,7])for(const z of [-7,7]){const wh=new THREE.Mesh(new THREE.CylinderGeometry(2.7,2.7,1.8,12),wm);wh.rotation.z=Math.PI/2;wh.position.set(x,2.7,z);g.add(wh);}g.position.set(p.x,0,p.y);g.lookAt(q.x,0,q.y);scene.add(g);meshes.set('truck:'+t.id,g);}}
export function setPreview(path,start,end,blocked=false){if(!previewGroup)return;while(previewGroup.children.length)previewGroup.remove(previewGroup.children[0]);if(!path||path.length<2)return;const curve=new THREE.CatmullRomCurve3(path.map(p=>new THREE.Vector3(p.x,.45,p.y)),false,'catmullrom',.1);previewGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(8,path.length*8),2.4,8,false),mat(blocked?'#d85a52':'#58a6d8')));for(const q of [start,end])if(q){const m=new THREE.Mesh(new THREE.SphereGeometry(5,12,8),mat(blocked?'#d85a52':'#f4e5a8'));m.position.set(q.x,.8,q.y);previewGroup.add(m);}}
export function render(ctx,s,W,H,canvas=document.querySelector('#game')){init(canvas);resize(W,H);const sig=worldSignature(s);if(render.lastSignature!==sig){syncWorld(s);render.lastSignature=sig;}for(const b of s.buildings||[])updateBuilding(b,s.selected===b);updateCamera(s,W,H);drawTrucks(s);renderer.render(scene,camera3d);}
function worldSignature(s){return JSON.stringify([(s.roads||[]).map(r=>[r.id,r.bridge,r.points]),(s.buildings||[]).map(b=>[b.id,b.x,b.y,b.kind,b.type,b.color])]);}
export function resizeRenderer(W,H){resize(W,H)}
