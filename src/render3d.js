import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

let renderer=null,scene=null,camera3d=null,root=null,previewGroup=null;
let target={x:0,z:0,yaw:0,pitch:.82,distance:620};
let desired={...target};
let cameraReady=false;
const meshes=new Map();

function mat(color,roughness=.8,metalness=0){
  return new THREE.MeshStandardMaterial({color,roughness,metalness});
}
function box(w,h,d,color){
  return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));
}
function makeRoad(points,bridge){
  const group=new THREE.Group();
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p.x,0.04,p.y)),false,'catmullrom',.15);
  const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(8,points.length*10),bridge?4.8:5.8,8,false),mat(bridge?'#9b6f3f':'#3f4648'));
  group.add(tube);
  if(!bridge){
    const lineCurve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p.x,0.18,p.y)),false,'catmullrom',.15);
    const line=new THREE.Mesh(new THREE.TubeGeometry(lineCurve,Math.max(8,points.length*10),.42,6,false),mat('#d9c56d'));
    group.add(line);
  }
  return group;
}
function addBuilding(b){
  const g=new THREE.Group();
  const factory=b.kind==='factory', warehouse=b.kind==='warehouse';
  const w=factory?78:warehouse?96:70, d=factory?62:warehouse?66:56;
  const h=factory?22:warehouse?18:14;
  const base=box(w,h,d,factory?'#aeb7b2':warehouse?'#b4b7b3':'#c7b89f');
  base.position.y=h/2;
  g.add(base);
  const roof=box(w+6,2,d+6,factory?'#465158':warehouse?'#4d5658':'#5a5149');
  roof.position.y=h+1;
  g.add(roof);
  const trim=box(w*.82,1.2,.8,b.color||'#d9c46a');
  trim.position.set(0,h*.58,d/2+.6);
  g.add(trim);
  if(factory){
    for(let i=-2;i<=2;i++){
      const win=box(8,6,.7,'#6f9ba5');win.position.set(i*13,h*.55,d/2+.5);g.add(win);
    }
    const door=box(20,10,.8,'#354247');door.position.set(0,5,d/2+.5);g.add(door);
    const chimney=box(9,32,9,'#667176');chimney.position.set(w*.28,32,d*.15);g.add(chimney);
    const cap=box(12,2,12,'#7f898d');cap.position.set(w*.28,48,d*.15);g.add(cap);
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(7,7,18,16),mat('#7f898b'));tank.position.set(-w*.27,9,d*.1);g.add(tank);
  }else if(warehouse){
    for(let i=-2;i<=2;i++){
      const door=box(14,9,.8,'#465156');door.position.set(i*17,5,d/2+.5);g.add(door);
    }
    const sign=box(52,5,.8,'#d9b95f');sign.position.set(0,h*.72,d/2+.6);g.add(sign);
  }else{
    const glass=box(w*.58,7,.7,'#8ba9aa');glass.position.set(-4,6,d/2+.5);g.add(glass);
    const door=box(9,9,.8,'#536466');door.position.set(w*.30,5,d/2+.5);g.add(door);
    const awning=box(w*.9,2.2,5,b.color||'#d58f65');awning.position.set(0,h*.67,d/2+2.2);g.add(awning);
  }
  const shadow=box(w*.94,.5,d*.94,'#6e766d');shadow.position.y=.25;shadow.material.transparent=true;shadow.material.opacity=.22;g.add(shadow);
  g.position.set(b.x,0,b.y);
  g.userData.building=b;
  g.traverse(o=>{if(o.isMesh)o.castShadow=true});
  scene.add(g);
  meshes.set(b.id,g);
}
function updateBuilding(b,selected){
  const g=meshes.get(b.id);if(!g)return;
  g.position.set(b.x,0,b.y);
  g.rotation.y=0;
  g.scale.setScalar(selected?1.035:1);
}
function clearDynamic(){
  for(const g of meshes.values())scene.remove(g);
  meshes.clear();
}
function init(canvas){
  if(renderer)return;
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();
  scene.background=new THREE.Color('#aebd91');
  root=new THREE.Group();
  scene.add(root);
  previewGroup=new THREE.Group();
  scene.add(previewGroup);
  const hemi=new THREE.HemisphereLight('#f7f2df','#68745e',2.1);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#fff1cf',3.2);
  sun.position.set(-240,320,180);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
  const ground=box(2600,2,2600,'#c7d5ae');ground.position.y=-1;ground.receiveShadow=true;scene.add(ground);
  const water=box(2600,.7,78,'#5f9db3');water.position.set(0,.1,0);scene.add(water);
  resize(canvas.clientWidth||innerWidth,canvas.clientHeight||innerHeight);
}
function resize(w,h){
  if(!renderer)return;
  renderer.setSize(Math.max(1,w),Math.max(1,h),false);
  camera3d?.updateProjectionMatrix();
}
function syncWorld(s){
  if(!scene)return;
  clearDynamic();
  for(const r of s.roads||[]){
    const g=makeRoad(r.points,!!r.bridge);
    scene.add(g);
  }
  for(const b of s.buildings||[])addBuilding(b);
}
function updateCamera(s,W,H){
  const zoom=Math.max(.55,Math.min(2.4,s.camera.zoom||1));
  const cx=(W/2-s.camera.x)/zoom;
  const cz=(H/2-s.camera.y)/zoom;
  const baseDistance=Math.max(320,Math.min(980,Math.max(W,H)*1.05));
  const targetDistance=baseDistance/zoom;
  desired.distance=targetDistance;
  desired.x=cx; desired.z=cz;
  if(!cameraReady){target={...desired};cameraReady=true}
  const ease=1-Math.pow(.001,1/60);
  target.x=THREE.MathUtils.lerp(target.x,desired.x,ease);
  target.z=THREE.MathUtils.lerp(target.z,desired.z,ease);
  target.distance=THREE.MathUtils.lerp(target.distance,desired.distance,ease);
  target.yaw=THREE.MathUtils.lerp(target.yaw,desired.yaw,ease);
  target.pitch=THREE.MathUtils.lerp(target.pitch,desired.pitch,ease);
  const aspect=Math.max(.1,W/H);
  const half=Math.max(150,target.distance*.55);
  if(!camera3d)camera3d=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,3000);
  camera3d.left=-half*aspect;camera3d.right=half*aspect;camera3d.top=half;camera3d.bottom=-half;
  const cp=Math.cos(target.pitch),sp=Math.sin(target.pitch);
  camera3d.position.set(
    target.x+Math.sin(target.yaw)*target.distance*cp,
    Math.sin(target.pitch)*target.distance,
    target.z+Math.cos(target.yaw)*target.distance*cp
  );
  camera3d.lookAt(target.x,0,target.z);
  camera3d.updateProjectionMatrix();
}
export function resetCamera(){
  const next={x:0,z:0,yaw:0,pitch:.82,distance:620};
  desired={...next};
  if(cameraReady)target={...next};
}
export function focusCamera(x,z){
  desired.x=x;desired.z=z;
}
export function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){
  desired.x+=dx;
  desired.z+=dy;
  desired.distance=Math.max(280,Math.min(1100,desired.distance+distanceDelta));
  desired.yaw+=yawDelta;
  desired.pitch=Math.max(.52,Math.min(1.18,desired.pitch+pitchDelta));
}
export function cameraPointFromScreen(x,y,W,H){
  if(!camera3d)return{x:W/2,z:H/2};
  const ndc=new THREE.Vector3((x/W)*2-1,-(y/H)*2+1,0);
  ndc.unproject(camera3d);
  const dir=ndc.sub(camera3d.position).normalize();
  const t=-camera3d.position.y/dir.y;
  return{x:camera3d.position.x+dir.x*t,z:camera3d.position.z+dir.z*t};
}
function drawTrucks(s){
  for(const [id,g] of [...meshes].filter(([k])=>String(k).startsWith('truck:'))){scene.remove(g);meshes.delete(id)}
  for(const t of s.trucks||[]){
    if(!t.route?.length)continue;
    const i=Math.min(t.route.length-1,Math.floor(t.t*(t.route.length-1)));
    const p=t.route[i],q=t.route[Math.min(t.route.length-1,i+1)];
    const g=new THREE.Group();
    const body=box(14,6,25,t.longDistance?'#8755c7':'#d79234');body.position.y=5;g.add(body);
    const cab=box(12,7,9,'#d9b75e');cab.position.set(0,6,8);g.add(cab);
    const wheelMat=mat('#202729');
    for(const x of [-7,7])for(const z of [-7,7]){
      const wh=new THREE.Mesh(new THREE.CylinderGeometry(2.7,2.7,1.8,12),wheelMat);wh.rotation.z=Math.PI/2;wh.position.set(x,2.7,z);g.add(wh);
    }
    g.position.set(p.x,0,p.y);
    g.lookAt(q.x,0,q.y);
    scene.add(g);meshes.set('truck:'+t.id,g);
  }
}
export function setPreview(path,start,end,blocked=false){
  if(!previewGroup)return;
  while(previewGroup.children.length)previewGroup.remove(previewGroup.children[0]);
  if(!path||path.length<2)return;
  const curve=new THREE.CatmullRomCurve3(path.map(p=>new THREE.Vector3(p.x,.45,p.y)),false,'catmullrom',.1);
  const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(8,path.length*8),2.4,8,false),mat(blocked?'#d85a52':'#58a6d8'));
  previewGroup.add(tube);
  for(const q of [start,end])if(q){const m=new THREE.Mesh(new THREE.SphereGeometry(5,12,8),mat(blocked?'#d85a52':'#f4e5a8'));m.position.set(q.x,.8,q.y);previewGroup.add(m)}
}
export function render(ctx,s,W,H,canvas=document.querySelector('#game')){
  init(canvas);
  resize(W,H);
  if(!render.lastSignature||render.lastSignature!==worldSignature(s)){
    syncWorld(s);render.lastSignature=worldSignature(s);
  }
  for(const b of s.buildings||[])updateBuilding(b,s.selected===b);
  updateCamera(s,W,H);
  drawTrucks(s);
  renderer.render(scene,camera3d);
}
function worldSignature(s){
  return JSON.stringify([
    (s.roads||[]).map(r=>[r.id,r.bridge,r.points]),
    (s.buildings||[]).map(b=>[b.id,b.x,b.y,b.kind,b.type,b.color])
  ]);
}
export function resizeRenderer(W,H){resize(W,H)}
