import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm';
import {riverY,isInsideWorldBounds,WORLD_BOUNDS,WORLD_MARGIN} from './world.js';

let renderer=null,scene=null,camera3d=null,root=null,previewGroup=null,roadEditGroup=null,roadEndpointGroup=null;
let target={x:0,z:0,yaw:0,pitch:.82,distance:620};
let desired={...target};
let home={x:0,z:0};
let cameraReady=false;
let viewport={width:1,height:1};
let previewKey='';
let roadEditKey='';
let lastBuildingSelection=null;
const meshes=new Map();
const worldObjects=new Set();
const truckMeshes=new Map();
const routeMetrics=new WeakMap();

function mat(color,roughness=.8,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function box(w,h,d,color){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));}
function roadMat(color){return new THREE.MeshStandardMaterial({color,roughness:.9,metalness:0,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});}
function roadIntersection(a,b,c,d){
  const abx=b.x-a.x,aby=b.y-a.y,cdx=d.x-c.x,cdy=d.y-c.y;
  const den=abx*cdy-aby*cdx;
  if(Math.abs(den)<1e-8)return null;
  const acx=c.x-a.x,acy=c.y-a.y;
  const t=(acx*cdy-acy*cdx)/den,u=(acx*aby-acy*abx)/den;
  if(t<0.0001||t>0.9999||u<0.0001||u>0.9999)return null;
  return{x:a.x+abx*t,y:a.y+aby*t};
}

const ROAD = Object.freeze({
  width:18,
  bridgeWidth:16,
  shoulderWidth:23,
  surfaceY:.68,
  shoulderY:.59,
  markingY:.80,
  curbY:.79,
  bridgeY:.72,
  railY:1.48
});
const roadMaterials={
  asphalt:roadMat('#343a3c'),
  shoulder:roadMat('#697173'),
  curb:roadMat('#9aa09f'),
  center:mat('#e4c95f'),
  edge:mat('#d6dcda'),
  bridgeDeck:roadMat('#735334'),
  bridgeRail:mat('#b58a52'),
  bridgeSupport:mat('#5f4631')
};

function addRoadBox(group,a,b,width,height,y,material){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(len<1)return null;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,height,width),material);
  mesh.position.set((a.x+b.x)/2,y,(a.y+b.y)/2);
  mesh.rotation.y=-Math.atan2(dy,dx);
  group.add(mesh);
  return {mesh,len,dx,dy,angle:Math.atan2(dy,dx)};
}

function addRoadMarkings(group,a,b,len,dx,dy,angle,width=ROAD.width){
  if(len<4)return;
  const nx=-Math.sin(angle),nz=Math.cos(angle);

  const edgeWidth=.72;
  for(const side of [-1,1]){
    const edge=new THREE.Mesh(new THREE.BoxGeometry(Math.max(1,len-2),.12,edgeWidth),roadMaterials.edge);
    edge.position.set(
      (a.x+b.x)/2+nx*side*(width/2-1.5),
      ROAD.markingY,
      (a.y+b.y)/2+nz*side*(width/2-1.5)
    );
    edge.rotation.y=-Math.atan2(dy,dx);
    group.add(edge);
  }

  // Keep the centre line sparse enough to read clearly on a phone.
  for(let along=10;along<len-6;along+=30){
    const dashLen=Math.min(14,len-along-4);
    if(dashLen<4)break;
    const t=(along+dashLen/2)/len;
    const dash=new THREE.Mesh(new THREE.BoxGeometry(dashLen,.12,1.05),roadMaterials.center);
    dash.position.set(a.x+dx*t,ROAD.markingY+.015,a.y+dy*t);
    dash.rotation.y=-Math.atan2(dy,dx);
    group.add(dash);
  }
}

function addRoadEndCap(group,p,radius,material,y){
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.11,24),material);
  cap.position.set(p.x,y,p.y);
  group.add(cap);
}

function makeRoadJunctions(roads){
  const group=new THREE.Group();
  const seen=[];
  const segments=[];
  const add=(p,radius=10)=>{
    if(!p||!isInsideWorldBounds(p))return;
    if(seen.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<2))return;
    seen.push({x:p.x,y:p.y});
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.13,28),roadMaterials.asphalt);
    mesh.position.set(p.x,ROAD.surfaceY-.01,p.y);
    group.add(mesh);

    // A thin curb ring visually stitches the separate segment meshes together.
    const curb=new THREE.Mesh(new THREE.RingGeometry(radius-.9,radius+.9,28),roadMaterials.curb);
    curb.rotation.x=-Math.PI/2;
    curb.position.set(p.x,ROAD.curbY,p.y);
    group.add(curb);
  };

  for(const road of roads||[]){
    const points=(road?.points||[]).filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&isInsideWorldBounds(p));
    if(points.length<2||road?.bridge)continue;
    for(let i=0;i<points.length;i++){
      // Endpoints and bends need a patch; intersections are added below.
      if(i===0||i===points.length-1||i>0&&i<points.length-1)add(points[i],10.5);
    }
    for(let i=1;i<points.length;i++)segments.push([points[i-1],points[i]]);
  }

  // Fill true crossings so there is no visible square/triangular gap.
  for(let i=0;i<segments.length;i++){
    for(let j=i+1;j<segments.length;j++){
      const hit=roadIntersection(segments[i][0],segments[i][1],segments[j][0],segments[j][1]);
      if(hit)add(hit,11);
    }
  }
  return group;
}

function makeRoad(points,bridge){
  if(!Array.isArray(points)||points.length<2)return new THREE.Group();
  const group=new THREE.Group();
  const clean=[];
  for(const p of points){
    if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))continue;
    const last=clean.at(-1);
    if(last&&Math.hypot(last.x-p.x,last.y-p.y)<.5)continue;
    clean.push({x:p.x,y:p.y});
  }
  if(clean.length<2)return group;

  const width=bridge?ROAD.bridgeWidth:ROAD.width;
  const shoulder=bridge?width+1.5:ROAD.shoulderWidth;

  for(let i=1;i<clean.length;i++){
    const a=clean[i-1],b=clean[i];
    const segment=addRoadBox(
      group,a,b,
      bridge?width:shoulder,
      bridge?.20:.16,
      bridge?ROAD.bridgeY:ROAD.shoulderY,
      bridge?roadMaterials.bridgeDeck:roadMaterials.shoulder
    );
    if(!segment)continue;

    if(bridge){
      addRoadBox(group,a,b,width,.13,ROAD.surfaceY,roadMaterials.asphalt);
      addRoadMarkings(group,a,b,segment.len,segment.dx,segment.dy,segment.angle,width);

      const nx=-Math.sin(segment.angle),nz=Math.cos(segment.angle);
      for(const side of [-1,1]){
        const rail=new THREE.Mesh(
          new THREE.BoxGeometry(segment.len,1.45,.75),
          roadMaterials.bridgeRail
        );
        rail.position.set(
          (a.x+b.x)/2+nx*side*(width/2),
          ROAD.railY,
          (a.y+b.y)/2+nz*side*(width/2)
        );
        rail.rotation.y=-segment.angle;
        group.add(rail);
      }

      // Short supports give the bridge a more intentional 3D silhouette.
      if(segment.len>55){
        const supportCount=Math.max(1,Math.floor(segment.len/100));
        for(let s=1;s<=supportCount;s++){
          const t=s/(supportCount+1);
          const x=a.x+(b.x-a.x)*t,z=a.y+(b.y-a.y)*t;
          const support=new THREE.Mesh(
            new THREE.CylinderGeometry(2.2,2.8,ROAD.bridgeY,10),
            roadMaterials.bridgeSupport
          );
          support.position.set(x,ROAD.bridgeY/2,z);
          group.add(support);
        }
      }
    }else{
      addRoadBox(group,a,b,width,.12,ROAD.surfaceY,roadMaterials.asphalt);
      addRoadMarkings(group,a,b,segment.len,segment.dx,segment.dy,segment.angle,width);

      const nx=-Math.sin(segment.angle),nz=Math.cos(segment.angle);
      for(const side of [-1,1]){
        const curb=new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(1,segment.len-1),.20,1.05),
          roadMaterials.curb
        );
        curb.position.set(
          (a.x+b.x)/2+nx*side*(width/2+.45),
          ROAD.curbY,
          (a.y+b.y)/2+nz*side*(width/2+.45)
        );
        curb.rotation.y=-segment.angle;
        group.add(curb);
      }
    }
  }

  // Round caps make road endpoints and boundary connections look intentional.
  const capRadius=(bridge?width:shoulder)/2;
  addRoadEndCap(group,clean[0],capRadius,bridge?roadMaterials.bridgeDeck:roadMaterials.shoulder,bridge?ROAD.bridgeY:ROAD.shoulderY);
  addRoadEndCap(group,clean.at(-1),capRadius,bridge?roadMaterials.bridgeDeck:roadMaterials.shoulder,bridge?ROAD.bridgeY:ROAD.shoulderY);

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
function updateRoadEndpointVisual(s){
  if(!roadEndpointGroup)return;
  while(roadEndpointGroup.children.length){const child=roadEndpointGroup.children[0];roadEndpointGroup.remove(child);disposeObject(child);}
  const endpoint=s.roadEditEndpoint;
  const preview=s.roadEditEndpointPreview;
  if(!endpoint&&!preview)return;
  const road=(s.roads||[]).find(x=>x?.id===(endpoint?.roadId||preview?.roadId));
  if(!road?.points)return;
  const index=endpoint?.index??preview?.index;
  const base=road.points[index];
  if(!base)return;
  const target=preview?.point||preview?.target||base;
  const invalid=!!preview?.invalid||!!preview?.blocked||!!preview?.duplicate;
  const material=new THREE.MeshBasicMaterial({color:invalid?'#d85a52':'#ffd45a',transparent:true,opacity:.95,depthWrite:false,side:THREE.DoubleSide});
  const ring=new THREE.Mesh(new THREE.RingGeometry(7,10,24),material);
  ring.rotation.x=-Math.PI/2;
  ring.position.set(target.x,1.2,target.y);
  roadEndpointGroup.add(ring);
  if(preview&&Math.hypot(target.x-base.x,target.y-base.y)>1){
    const dx=target.x-base.x,dy=target.y-base.y,len=Math.hypot(dx,dy);
    const line=new THREE.Mesh(new THREE.BoxGeometry(len,.18,4),material);
    line.position.set((base.x+target.x)/2,1.1,(base.y+target.y)/2);
    line.rotation.y=-Math.atan2(dy,dx);
    roadEndpointGroup.add(line);
  }
}
function updateRoadEditVisual(s){
  if(!roadEditGroup)return;
  const hover=s.roadEditHover, selected=s.roadEditSelection;
  const key=JSON.stringify([
    hover?.roadId||null,hover?.segment??null,
    selected?.roadId||null,selected?.segment??null
  ]);
  if(key===roadEditKey)return;
  roadEditKey=key;
  while(roadEditGroup.children.length){
    const child=roadEditGroup.children[0];
    roadEditGroup.remove(child);
    disposeObject(child);
  }
  const items=[];
  if(hover)items.push({state:hover});
  if(selected&&(!hover||selected.roadId!==hover.roadId||selected.segment!==hover.segment))items.push({state:selected});
  for(const item of items){
    const hit=item.state;
    const road=(s.roads||[]).find(r=>r?.id===hit.roadId);
    if(!road?.points||hit.segment<0||hit.segment>=road.points.length-1)continue;
    const a=road.points[hit.segment],b=road.points[hit.segment+1];
    if(!Number.isFinite(a?.x)||!Number.isFinite(a?.y)||!Number.isFinite(b?.x)||!Number.isFinite(b?.y))continue;
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<1)continue;
    const selectedState=selected&&hit.roadId===selected.roadId&&hit.segment===selected.segment;
    const material=new THREE.MeshBasicMaterial({
      color:selectedState?'#ffd45a':'#63d7ff',
      transparent:true,
      opacity:selectedState?.72:.52,
      depthWrite:false,
      side:THREE.DoubleSide
    });
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,.22,22),material);
    mesh.position.set((a.x+b.x)/2,.92,(a.y+b.y)/2);
    mesh.rotation.y=-Math.atan2(dy,dx);
    roadEditGroup.add(mesh);
    const markerMaterial=new THREE.MeshBasicMaterial({
      color:selectedState?'#fff0a6':'#9ceaff',
      transparent:true,
      opacity:.9,
      depthWrite:false
    });
    for(const p of [a,b]){
      const ring=new THREE.Mesh(new THREE.RingGeometry(4.5,6.5,20),markerMaterial);
      ring.rotation.x=-Math.PI/2;
      ring.position.set(p.x,1.12,p.y);
      roadEditGroup.add(ring);
    }
  }
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
  scene=new THREE.Scene();scene.background=new THREE.Color('#9eaf88');root=new THREE.Group();scene.add(root);previewGroup=new THREE.Group();scene.add(previewGroup);roadEditGroup=new THREE.Group();scene.add(roadEditGroup);roadEndpointGroup=new THREE.Group();scene.add(roadEndpointGroup);
  scene.add(new THREE.HemisphereLight('#f7f2df','#68745e',2.1));
  const sun=new THREE.DirectionalLight('#fff1cf',3.2);sun.position.set(-240,320,180);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
  const ground=box(2600,2,2600,'#b7c79d');ground.position.y=-1;ground.receiveShadow=true;scene.add(ground);
  const edgeOffset=WORLD_MARGIN*.5,edgeDepth=.22;
  const edgeLeft=box(edgeDepth,.12,2600-edgeOffset*2,'#6d775f');edgeLeft.position.set(WORLD_BOUNDS.minX+edgeOffset,.08,0);scene.add(edgeLeft);
  const edgeRight=box(edgeDepth,.12,2600-edgeOffset*2,'#6d775f');edgeRight.position.set(WORLD_BOUNDS.maxX-edgeOffset,.08,0);scene.add(edgeRight);
  const edgeTop=box(2600-edgeOffset*2,.12,edgeDepth,'#6d775f');edgeTop.position.set(0,.08,WORLD_BOUNDS.minY+edgeOffset);scene.add(edgeTop);
  const edgeBottom=box(2600-edgeOffset*2,.12,edgeDepth,'#6d775f');edgeBottom.position.set(0,.08,WORLD_BOUNDS.maxY-edgeOffset);scene.add(edgeBottom);
  const river=new THREE.Group();
  const riverWidth=82,riverStart=-1300,riverStep=44;
  for(let x=riverStart;x<=1300;x+=riverStep){
    const x2=Math.min(1300,x+riverStep+8),mid=(x+x2)/2,dy=riverY(x2)-riverY(x),angle=Math.atan2(dy,x2-x);
    const segment=box(Math.hypot(x2-x,dy)+10,.7,riverWidth,'#5f9db3');
    segment.position.set(mid,.1,(riverY(x)+riverY(x2))/2);
    segment.rotation.y=-angle;
    river.add(segment);
  }
  scene.add(river);
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
  for(const r of s.roads||[]){const points=(r.points||[]).filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&isInsideWorldBounds(p));if(points.length<2)continue;const g=makeRoad(points,!!r.bridge);scene.add(g);worldObjects.add(g);for(const p of points)pts.push({x:p.x,z:p.y});}
  const junctions=makeRoadJunctions(s.roads||[]);
  scene.add(junctions);worldObjects.add(junctions);
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
  const snapStart=start?.building?'building':start?.road?'road':start?.gridSnapped?'grid':'free';
  const snapEnd=end?.building?'building':end?.road?'road':end?.gridSnapped?'grid':'free';
  const key=path&&path.length>=2?JSON.stringify([path,start,end,blocked,snapStart,snapEnd]):'';
  if(key===previewKey)return;
  previewKey=key;
  while(previewGroup.children.length){
    const child=previewGroup.children[0];
    previewGroup.remove(child);
    disposeObject(child);
  }
  if(!path||path.length<2)return;

  const previewSurface=new THREE.MeshStandardMaterial({
    color:blocked?'#d85a52':'#58a6d8',
    transparent:true,
    opacity:.58,
    depthWrite:false,
    side:THREE.DoubleSide
  });
  const previewShoulder=new THREE.MeshStandardMaterial({
    color:blocked?'#b14c48':'#8ac4e2',
    transparent:true,
    opacity:.38,
    depthWrite:false,
    side:THREE.DoubleSide
  });
  const previewMarking=new THREE.MeshBasicMaterial({
    color:blocked?'#ffb0a8':'#eaf7ff',
    transparent:true,
    opacity:.88,
    depthWrite:false
  });

  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    const segment=addRoadBox(previewGroup,a,b,ROAD.shoulderWidth,.15,.66,previewShoulder);
    if(!segment)continue;
    addRoadBox(previewGroup,a,b,ROAD.width,.14,.74,previewSurface);

    const nx=-Math.sin(segment.angle),nz=Math.cos(segment.angle);
    for(const side of [-1,1]){
      const edge=new THREE.Mesh(new THREE.BoxGeometry(Math.max(1,segment.len-2),.1,.65),previewMarking);
      edge.position.set(
        (a.x+b.x)/2+nx*side*(ROAD.width/2-1.5),
        .84,
        (a.y+b.y)/2+nz*side*(ROAD.width/2-1.5)
      );
      edge.rotation.y=-segment.angle;
      previewGroup.add(edge);
    }
    for(let along=10;along<segment.len-6;along+=30){
      const dashLen=Math.min(14,segment.len-along-4);
      if(dashLen<4)break;
      const t=(along+dashLen/2)/segment.len;
      const dash=new THREE.Mesh(new THREE.BoxGeometry(dashLen,.1,1),previewMarking);
      dash.position.set(a.x+segment.dx*t,.85,a.y+segment.dy*t);
      dash.rotation.y=-segment.angle;
      previewGroup.add(dash);
    }
  }

  const endpointMaterial=kind=>new THREE.MeshBasicMaterial({
    color:blocked?'#d85a52':kind==='building'?'#f4e5a8':kind==='road'?'#67d5e8':kind==='grid'?'#b8c7ff':'#ffffff',
    transparent:true,
    opacity:.95,
    depthWrite:false,
    side:THREE.DoubleSide
  });
  for(const [q,kind] of [[start,snapStart],[end,snapEnd]]){
    if(!q)continue;
    const ring=new THREE.Mesh(
      new THREE.RingGeometry(kind==='building'?7:6,kind==='building'?9:8,24),
      endpointMaterial(kind)
    );
    ring.rotation.x=-Math.PI/2;
    ring.position.set(q.x,1.12,q.y);
    previewGroup.add(ring);
    const core=new THREE.Mesh(
      new THREE.CircleGeometry(kind==='building'?3.5:3,16),
      endpointMaterial(kind)
    );
    core.rotation.x=-Math.PI/2;
    core.position.set(q.x,1.14,q.y);
    previewGroup.add(core);
  }
  for(let i=1;i<path.length-1;i++){
    const q=path[i];
    if(!q)continue;
    const turn=new THREE.Mesh(
      new THREE.RingGeometry(3.5,4.5,16),
      endpointMaterial('grid')
    );
    turn.rotation.x=-Math.PI/2;
    turn.position.set(q.x,1.10,q.y);
    previewGroup.add(turn);
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
    roadEditKey='';
  }
  if(render.lastState===s){
    if(render.lastWorldBuildingSignature!==s.buildings?.length){
      render.lastWorldBuildingSignature=s.buildings?.length||0;
      for(const b of s.buildings||[])updateBuilding(b,false);
    }
    updateSelectionVisual(s);
    updateRoadEditVisual(s);
    updateRoadEndpointVisual(s);
  }
  updateCamera(s,W,H);
  drawTrucks(s);
  renderer.render(scene,camera3d);
}
export function resizeRenderer(W,H){resize(W,H)}
