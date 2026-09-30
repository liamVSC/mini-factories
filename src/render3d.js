import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm';

let renderer=null,scene=null,camera3d=null,root=null,previewGroup=null;
let target={x:0,z:0,yaw:0,pitch:.82,distance:620};
let desired={...target};
let home={x:0,z:0};
let cameraReady=false;
let viewport={width:1,height:1};
let previewKey='';
let lastBuildingSelection=null;
const meshes=new Map();
const worldObjects=new Set();
const truckMeshes=new Map();
const routeMetrics=new WeakMap();

function mat(color,roughness=.8,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function box(w,h,d,color){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));}
function roadMat(color){return new THREE.MeshStandardMaterial({color,roughness:.9,metalness:0,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});}
function makeRoad(points,bridge){
  if(!Array.isArray(points)||points.length<2)return new THREE.Group();
  const group=new THREE.Group();
  const clean=points.filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y));
  if(clean.length<2)return group;

  const roadWidth=bridge?15:18;
  const addSegment=(a,b,width,height,y,color)=>{
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<1)return;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,height,width),roadMat(color));
    mesh.position.set((a.x+b.x)/2,y,(a.y+b.y)/2);
    mesh.rotation.y=-Math.atan2(dy,dx);
    group.add(mesh);
  };

  if(!bridge){
    for(let i=1;i<clean.length;i++){
      const a=clean[i-1],b=clean[i];
      addSegment(a,b,roadWidth+2.4,.14,.08,'#62696a');
      addSegment(a,b,roadWidth,.12,.16,'#3f4648');

      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
      if(len<1)continue;
      const angle=-Math.atan2(dy,dx);
      const dashMaterial=mat('#d9c56d');
      for(let along=6;along<len-1;along+=30){
        const dashLen=Math.min(18,len-along);
        if(dashLen<2)break;
        const t=(along+dashLen/2)/len;
        const dash=new THREE.Mesh(new THREE.BoxGeometry(dashLen,.16,1),dashMaterial);
        dash.position.set(a.x+dx*t,.24,a.y+dy*t);
        dash.rotation.y=angle;
        group.add(dash);
      }
    }
  }else{
    for(let i=1;i<clean.length;i++){
      const a=clean[i-1],b=clean[i];
      addSegment(a,b,roadWidth,.18,.18,'#755638');
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
      if(len<1)continue;
      const angle=Math.atan2(dy,dx);
      const normalX=Math.cos(angle+Math.PI/2);
      const normalZ=Math.sin(angle+Math.PI/2);
      for(const side of [-1,1]){
        const rail=box(len,1.5,.8,'#b58a52');
        rail.position.set(
          (a.x+b.x)/2+normalX*side*(roadWidth/2),
          .95,
          (a.y+b.y)/2+normalZ*side*(roadWidth/2)
        );
        rail.rotation.y=-angle;
        group.add(rail);
      }
    }
  }
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
  g.position.set(Number(b.x)||0,0,Number(b.y)||0);g.userData.building=b;g.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(g);meshes.set(b.id,g);worldObjects.add(g);
}
function updateBuilding(b,selected){
  const g=meshes.get(b.id);
  if(!g)return;
  const x=Number(b.x)||0,y=Number(b.y)||0;
  if(g.position.x!==x||g.position.z!==y){g.position.set(x,0,y);}
  const scale=selected?1.035:1;
  if(g.scale.x!==scale)g.scale.setScalar(scale);
}
function updateSelectionVisual(s){
  const selected=s.selected?.id||null;
  if(selected===lastBuildingSelection)return;
  for(const [id,g] of meshes){
    const scale=id===selected?1.035:1;
    if(g.scale.x!==scale)g.scale.setScalar(scale);
  }
  lastBuildingSelection=selected;
}
function disposeMaterial(material){if(Array.isArray(material))material.forEach(disposeMaterial);else material?.dispose?.()}
function disposeObject(g){g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)disposeMaterial(o.material);});}
function clearDynamic(){for(const g of worldObjects){scene.remove(g);disposeObject(g);}worldObjects.clear();meshes.clear();for(const g of truckMeshes.values()){scene.remove(g);disposeObject(g);}truckMeshes.clear();}
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
  const changed=renderer.domElement.width!==Math.round(viewport.width*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(viewport.height*renderer.getPixelRatio());
  if(changed)renderer.setSize(viewport.width,viewport.height,false);
  if(camera3d)camera3d.updateProjectionMatrix();
}
function syncWorld(s){
  if(!scene)return;clearDynamic();
  const pts=[];for(const b of s.buildings||[]){addBuilding(b);if(Number.isFinite(b.x)&&Number.isFinite(b.y))pts.push({x:b.x,z:b.y});}
  for(const r of s.roads||[]){const g=makeRoad(r.points,!!r.bridge);scene.add(g);worldObjects.add(g);for(const p of r.points||[])if(Number.isFinite(p.x)&&Number.isFinite(p.y))pts.push({x:p.x,z:p.y});}
  if(pts.length){home={x:pts.reduce((n,p)=>n+p.x,0)/pts.length,z:pts.reduce((n,p)=>n+p.z,0)/pts.length};if(!cameraReady){desired.x=home.x;desired.z=home.z;target.x=home.x;target.z=home.z;}}
}
function updateCamera(s,W,H){
  const zoom=Math.max(.55,Math.min(2.4,s.camera.zoom||1));
  desired.distance=Math.max(320,Math.min(980,Math.max(W,H)*1.05))/zoom;
  if(!cameraReady){desired.x=home.x;desired.z=home.z;target={...desired,yaw:0,pitch:.82};cameraReady=true;}
  const ease=1-Math.pow(.001,1/60);for(const k of ['x','z','distance','yaw','pitch'])target[k]=THREE.MathUtils.lerp(target[k],desired[k],ease);
  const aspect=Math.max(.1,W/H),half=Math.max(150,target.distance*.55);if(!camera3d)camera3d=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,3000);applyCameraTransform(W,H);
}
export function resetCamera(){desired.x=home.x;desired.z=home.z;desired.yaw=0;desired.pitch=.82;desired.distance=620;target={...desired};}
export function focusCamera(x,z){desired.x=Number(x)||home.x;desired.z=Number(z)||home.z;}
export function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){desired.x+=dx;desired.z+=dy;desired.distance=Math.max(280,Math.min(1100,desired.distance+distanceDelta));desired.yaw+=yawDelta;desired.pitch=Math.max(.52,Math.min(1.18,desired.pitch+pitchDelta));}
export function screenToWorld(x,y,W=viewport.width,H=viewport.height){const p=cameraPointFromScreen(x,y,W,H);return{x:p.x,y:p.z};}
export function worldToScreen(x,z,W=viewport.width,H=viewport.height){if(!camera3d)return{x:W/2,y:H/2,visible:false};const p=new THREE.Vector3(Number(x)||0,0,Number(z)||0).project(camera3d);return{x:(p.x+1)*.5*W,y:(1-p.y)*.5*H,visible:p.z>=-1&&p.z<=1};}
export function panScreen(dx,dy,W=viewport.width,H=viewport.height){if(!camera3d)return {x:0,z:0};const a=cameraPointFromScreen(W/2,H/2,W,H),b=cameraPointFromScreen(W/2-dx,H/2-dy,W,H);const mx=b.x-a.x,mz=b.z-a.z;controlCamera(mx,mz);return{x:mx,z:mz};}
export function zoomAtScreen(x,y,nextZoom,W=viewport.width,H=viewport.height){
  if(!camera3d)return Math.max(.55,Math.min(2.4,nextZoom));
  const zoom=Math.max(.55,Math.min(2.4,Number(nextZoom)||1));
  const before=cameraPointFromScreen(x,y,W,H);
  desired.distance=Math.max(320,Math.min(980,Math.max(W,H)*1.05))/zoom;
  target.x=desired.x;target.z=desired.z;target.distance=desired.distance;target.yaw=desired.yaw;target.pitch=desired.pitch;
  applyCameraTransform(W,H);
  const after=cameraPointFromScreen(x,y,W,H);
  const dx=before.x-after.x,dz=before.z-after.z;
  desired.x+=dx;desired.z+=dz;target.x+=dx;target.z+=dz;
  applyCameraTransform(W,H);
  return zoom;
}
function applyCameraTransform(W,H){
  if(!camera3d)return;
  const aspect=Math.max(.1,W/H),half=Math.max(150,target.distance*.55);
  camera3d.left=-half*aspect;camera3d.right=half*aspect;camera3d.top=half;camera3d.bottom=-half;
  const cp=Math.cos(target.pitch);
  camera3d.position.set(target.x+Math.sin(target.yaw)*target.distance*cp,Math.sin(target.pitch)*target.distance,target.z+Math.cos(target.yaw)*target.distance*cp);
  camera3d.lookAt(target.x,0,target.z);camera3d.updateProjectionMatrix();camera3d.updateMatrixWorld();
}
export function cameraPointFromScreen(x,y,W=viewport.width,H=viewport.height){
  if(!camera3d)return{x:home.x,z:home.z};
  const ndc=new THREE.Vector3((x/W)*2-1,-(y/H)*2+1,0).unproject(camera3d);
  const dir=ndc.sub(camera3d.position).normalize();
  const t=-camera3d.position.y/dir.y;
  return{x:camera3d.position.x+dir.x*t,z:camera3d.position.z+dir.z*t};
}
function createTruckMesh(t){const g=new THREE.Group();const body=box(14,6,25,t.longDistance?'#8755c7':'#d79234');body.position.y=5;g.add(body);const cab=box(12,7,9,'#d9b75e');cab.position.set(0,6,8);g.add(cab);const wm=mat('#202729');for(const x of [-7,7])for(const z of [-7,7]){const wh=new THREE.Mesh(new THREE.CylinderGeometry(2.7,2.7,1.8,12),wm);wh.rotation.z=Math.PI/2;wh.position.set(x,2.7,z);g.add(wh);}scene.add(g);return g;}
function routeMetric(route){
  let metric=routeMetrics.get(route);
  if(metric&&metric.count===route.length)return metric;
  const cumulative=[0];
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i];
    cumulative.push(cumulative[i-1]+Math.hypot(b.x-a.x,b.y-a.y));
  }
  metric={count:route.length,cumulative,total:cumulative.at(-1)||0};
  routeMetrics.set(route,metric);
  return metric;
}
function truckPoint(route,t){
  if(!Array.isArray(route)||!route.length)return null;
  if(route.length===1)return{x:route[0].x,y:route[0].y,next:route[0]};
  const clamped=Math.max(0,Math.min(1,Number(t)||0));
  const metric=routeMetric(route);
  if(!metric.total)return{x:route[0].x,y:route[0].y,next:route[1]};
  const wanted=metric.total*clamped;
  let lo=1,hi=route.length-1;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(metric.cumulative[mid]>=wanted)hi=mid;
    else lo=mid+1;
  }
  const i=lo,a=route[i-1],b=route[i],run=metric.cumulative[i-1],seg=metric.cumulative[i]-run;
  const q=seg?(wanted-run)/seg:0;
  return{x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q,next:b};
}
function drawTrucks(s){
  const active=new Set();
  for(const t of s.trucks||[]){
    if(!t.route?.length||!t.id)continue;
    active.add(t.id);
    let g=truckMeshes.get(t.id);
    if(!g){g=createTruckMesh(t);truckMeshes.set(t.id,g);}
    const p=truckPoint(t.route,t.t);
    if(!p)continue;
    g.position.set(p.x,0,p.y);
    g.lookAt(p.next.x,0,p.next.y);
  }
  for(const [id,g] of truckMeshes){
    if(active.has(id))continue;
    scene.remove(g);
    disposeObject(g);
    truckMeshes.delete(id);
  }
}
export function setPreview(path,start,end,blocked=false){
  if(!previewGroup)return;
  const key=path&&path.length>=2?JSON.stringify([path,start,end,blocked]):'';
  if(key===previewKey)return;
  previewKey=key;
  while(previewGroup.children.length){
    const child=previewGroup.children[0];
    previewGroup.remove(child);
    disposeObject(child);
  }
  if(!path||path.length<2)return;

  const material=mat(blocked?'#d85a52':'#58a6d8');
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<1)continue;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,.18,5),material);
    mesh.position.set((a.x+b.x)/2,.42,(a.y+b.y)/2);
    mesh.rotation.y=-Math.atan2(dy,dx);
    previewGroup.add(mesh);
  }
  for(const q of [start,end]){
    if(!q)continue;
    const m=new THREE.Mesh(new THREE.SphereGeometry(5,12,8),mat(blocked?'#d85a52':'#f4e5a8'));
    m.position.set(q.x,.8,q.y);
    previewGroup.add(m);
  }
}
export function render(ctx,s,W,H,canvas=document.querySelector('#game')){
  init(canvas);
  resize(W,H);
  if(render.lastState!==s||render.lastWorldVersion!==s.renderVersion){
    syncWorld(s);
    render.lastState=s;
    render.lastWorldVersion=s.renderVersion;
    lastBuildingSelection=null;
  }
  if(render.lastState===s){
    if(render.lastWorldBuildingSignature!==s.buildings?.length){
      render.lastWorldBuildingSignature=s.buildings?.length||0;
      for(const b of s.buildings||[])updateBuilding(b,false);
    }
    updateSelectionVisual(s);
  }
  updateCamera(s,W,H);
  drawTrucks(s);
  renderer.render(scene,camera3d);
}
export function resizeRenderer(W,H){resize(W,H)}
