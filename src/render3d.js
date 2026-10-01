import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm';
import {riverY,isInsideWorldBounds,WORLD_BOUNDS,WORLD_MARGIN,WORLD_HALF_SIZE,roadTopology,buildingConnectionPoint,buildingHitbox,buildingDockPoints,roadAttachment} from './world.js';

let renderer=null,scene=null,camera3d=null,root=null,previewGroup=null,buildingPreviewGroup=null,roadEditGroup=null,roadEndpointGroup=null;
let target={x:0,z:0,yaw:0,pitch:.82,distance:620};
let desired={...target};
let home={x:0,z:0};
let cameraReady=false;
let viewport={width:1,height:1};
let previewKey='';
let buildingPreviewKey='';
let roadEditKey='';
let lastBuildingSelection=null;
const meshes=new Map();
const worldObjects=new Set();
const truckMeshes=new Map();
const routeMetrics=new WeakMap();
let ws=null;

function mat(color,roughness=.8,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function box(w,h,d,color){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));}
function roadMat(color){return new THREE.MeshStandardMaterial({color,roughness:.9,metalness:0,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});}
function roadIntersection(a,b,c,d){const abx=b.x-a.x,aby=b.y-a.y,cdx=d.x-c.x,cdy=d.y-c.y,den=abx*cdy-aby*cdx;if(Math.abs(den)<1e-8)return null;const acx=c.x-a.x,acy=c.y-a.y,t=(acx*cdy-acy*cdx)/den,u=(acx*aby-acy*abx)/den;if(t<.0001||t>.9999||u<.0001||u>.9999)return null;return{x:a.x+abx*t,y:a.y+aby*t};}
const ROAD=Object.freeze({width:28,bridgeWidth:26,shoulderWidth:34,surfaceY:.68,shoulderY:.59,markingY:.80,curbY:.79,bridgeY:.72,railY:1.48});
const roadMaterials={asphalt:roadMat('#343a3c'),shoulder:roadMat('#697173'),curb:roadMat('#9aa09f'),center:mat('#e8e9e5',.72),edge:mat('#f1f1ec',.78),bridgeDeck:roadMat('#735334'),bridgeRail:mat('#b58a52'),bridgeSupport:mat('#5f4631')};
const sharedMaterials=new Set(Object.values(roadMaterials));
function addRoadBox(group,a,b,width,height,y,material){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1)return null;const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,height,width),material);mesh.position.set((a.x+b.x)/2,y,(a.y+b.y)/2);mesh.rotation.y=-Math.atan2(dy,dx);group.add(mesh);return{mesh,len,dx,dy,angle:Math.atan2(dy,dx)};}
function samplePathByDistance(points,step=.8){const samples=[];if(!Array.isArray(points)||points.length<2)return samples;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(len<.01)continue;const count=Math.max(1,Math.ceil(len/step));for(let j=0;j<count;j++){const t=j/count;samples.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}samples.push(points.at(-1));return samples;}
function addRibbonStrip(group,points,width,y,material){if(points.length<2)return;const mesh=new THREE.Mesh(ribbonGeometry(points,width,y,.08),material);mesh.renderOrder=3;group.add(mesh);}
function addRoadMarkings(group,points,width=ROAD.width,markingY=ROAD.markingY){
  if(!Array.isArray(points)||points.length<2)return;
  const samples=samplePathByDistance(points,.9);if(samples.length<2)return;
  const left=offsetPath(samples,width/2-1.6),right=offsetPath(samples,-(width/2-1.6));
  addRibbonStrip(group,left,.62,markingY,roadMaterials.edge);
  addRibbonStrip(group,right,.62,markingY,roadMaterials.edge);
  const dashLen=12,gap=18;let distance=10,run=0;
  for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i],seg=Math.hypot(b.x-a.x,b.y-a.y);
    if(seg<.01)continue;
    while(distance<run+seg-3){
      const start=distance,end=Math.min(distance+dashLen,run+seg-1),t0=(start-run)/seg,t1=(end-run)/seg;
      const dashStart={x:a.x+(b.x-a.x)*t0,y:a.y+(b.y-a.y)*t0},dashEnd={x:a.x+(b.x-a.x)*t1,y:a.y+(b.y-a.y)*t1};
      addRibbonStrip(group,[dashStart,dashEnd],1.02,markingY+.018,roadMaterials.center);
      distance+=dashLen+gap;
    }
    run+=seg;
  }
}
function addRoadEndCap(group,p,radius,material,y){const cap=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.11,32),material);cap.position.set(p.x,y,p.y);cap.receiveShadow=true;group.add(cap);}
function addRoadEndpointJoin(group,p,roadWidth){
  const join=new THREE.Mesh(new THREE.CylinderGeometry(roadWidth*.53,roadWidth*.53,.12,32),roadMaterials.asphalt);
  join.position.set(p.x,ROAD.surfaceY+.012,p.y);join.receiveShadow=true;group.add(join);
  const shoulder=new THREE.Mesh(new THREE.CylinderGeometry((roadWidth+6)*.53,(roadWidth+6)*.53,.08,32),roadMaterials.shoulder);
  shoulder.position.set(p.x,ROAD.shoulderY+.012,p.y);shoulder.receiveShadow=true;group.add(shoulder);
}
function roundedRoadPoints(points){const clean=[];for(const p of points||[]){if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))continue;const last=clean.at(-1);if(last&&Math.hypot(last.x-p.x,last.y-p.y)<.5)continue;clean.push({x:p.x,y:p.y});}if(clean.length<3)return clean;const result=[clean[0]],radius=Math.min(30,Math.max(10,ROAD.width*1.35));for(let i=1;i<clean.length-1;i++){const prev=clean[i-1],cur=clean[i],next=clean[i+1],inLen=Math.hypot(cur.x-prev.x,cur.y-prev.y),outLen=Math.hypot(next.x-cur.x,next.y-cur.y);if(inLen<1||outLen<1){result.push(cur);continue;}const trim=Math.min(radius,inLen*.32,outLen*.32),inT={x:cur.x+(prev.x-cur.x)*(trim/inLen),y:cur.y+(prev.y-cur.y)*(trim/inLen)},outT={x:cur.x+(next.x-cur.x)*(trim/outLen),y:cur.y+(next.y-cur.y)*(trim/outLen)};result.push(inT);for(let s=1;s<=Math.max(3,Math.min(10,Math.ceil(trim/5)));s++){const t=s/Math.max(3,Math.min(10,Math.ceil(trim/5))),mt=1-t;result.push({x:mt*mt*inT.x+2*mt*t*cur.x+t*t*outT.x,y:mt*mt*inT.y+2*mt*t*cur.y+t*t*outT.y});}}result.push(clean.at(-1));return result;}
function ribbonGeometry(points,width,y,thickness=.12){
  const verts=[],indices=[];
  for(let i=0;i<points.length;i++){
    const p=points[i],prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    let tx=next.x-prev.x,tz=next.y-prev.y,len=Math.hypot(tx,tz)||1;tx/=len;tz/=len;
    const nx=-tz,nz=tx;
    verts.push(p.x+nx*width/2,y-thickness/2,p.y+nz*width/2,p.x-nx*width/2,y-thickness/2,p.y-nz*width/2);
    if(i<points.length-1){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function addRoadSurface(group,points,width,y,material){
  if(points.length<2)return;
  const mesh=new THREE.Mesh(ribbonGeometry(points,width,y,.14),material);
  mesh.receiveShadow=true;group.add(mesh);
}
function offsetPath(points,offset){
  return points.map((p,i)=>{const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    let tx=next.x-prev.x,tz=next.y-prev.y,len=Math.hypot(tx,tz)||1;tx/=len;tz/=len;
    return{x:p.x-tz*offset,y:p.y+tx*offset};
  });
}
function addRoadCurbs(group,points,width){
  for(const side of[-1,1]){
    const curbPoints=offsetPath(points,side*(width/2+.45));
    const mesh=new THREE.Mesh(ribbonGeometry(curbPoints,1.05,ROAD.curbY,.20),roadMaterials.curb);
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
}
function addFlatCurve(group,start,control,end,width,y,material,steps=8){
  const points=[];
  for(let i=0;i<=steps;i++){const t=i/steps,mt=1-t;points.push({x:mt*mt*start.x+2*mt*t*control.x+t*t*end.x,y:mt*mt*start.y+2*mt*t*control.y+t*t*end.y});}
  addRoadSurface(group,points,width,y,material);
}
function addRoadRails(group,points,width){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(len<1)continue;const angle=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(angle),nz=Math.cos(angle);for(const side of[-1,1]){const rail=new THREE.Mesh(new THREE.BoxGeometry(len+.8,1.45,.75),roadMaterials.bridgeRail);rail.position.set((a.x+b.x)/2+nx*side*(width/2),ROAD.railY,(a.y+b.y)/2+nz*side*(width/2));rail.rotation.y=-angle;group.add(rail);}}}
function addBridgeSupports(group,points){const total=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);if(total<55)return;const count=Math.max(1,Math.floor(total/100));for(let s=1;s<=count;s++){const target=total*s/(count+1);let run=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],seg=Math.hypot(b.x-a.x,b.y-a.y);if(run+seg<target){run+=seg;continue;}const t=(target-run)/Math.max(1,seg),x=a.x+(b.x-a.x)*t,z=a.y+(b.y-a.y)*t,support=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.8,ROAD.bridgeY,10),roadMaterials.bridgeSupport);support.position.set(x,ROAD.bridgeY/2,z);group.add(support);break;}}}
function addBoundaryRoadEnd(group,p,width,y){const minX=WORLD_BOUNDS.minX+WORLD_MARGIN,maxX=WORLD_BOUNDS.maxX-WORLD_MARGIN,minY=WORLD_BOUNDS.minY+WORLD_MARGIN,maxY=WORLD_BOUNDS.maxY-WORLD_MARGIN,nearX=Math.abs(p.x-minX)<2||Math.abs(p.x-maxX)<2,nearY=Math.abs(p.y-minY)<2||Math.abs(p.y-maxY)<2;if(!nearX&&!nearY)return;const line=new THREE.Mesh(new THREE.BoxGeometry(width+.8,.12,1.2),roadMaterials.edge);line.position.set(p.x,y+.06,p.y);line.rotation.y=nearY?0:Math.PI/2;group.add(line);for(const side of[-1,1]){const post=new THREE.Mesh(new THREE.BoxGeometry(1.4,7,1.4),roadMaterials.edge);if(nearY)post.position.set(p.x+side*Math.min(7,width*.35),y+3.5,p.y);else post.position.set(p.x,y+3.5,p.y+side*Math.min(7,width*.35));group.add(post);}}
function buildingForRoadEndpoint(s,p){let best=null,bd=9;for(const b of s.buildings||[]){const q=buildingConnectionPoint(b,p,0),d=Math.hypot(q.x-p.x,q.y-p.y);if(d<bd){bd=d;best={building:b,facade:q};}}return best;}
function addBuildingAccessApron(group,building,roadPoint,facade,bridge){
  if(!building||bridge)return;
  const dx=roadPoint.x-facade.x,dy=roadPoint.y-facade.y,len=Math.hypot(dx,dy);if(len<1)return;
  const ux=dx/len,uy=dy/len,apronLength=Math.max(10,Math.min(22,len+7));
  const outer={x:facade.x+ux*apronLength,y:facade.y+uy*apronLength};
  const shoulderWidth=ROAD.shoulderWidth+2,roadWidth=ROAD.width+3;
  const points=[facade,{x:facade.x+ux*apronLength*.45,y:facade.y+uy*apronLength*.45},outer];
  addRoadSurface(group,points,shoulderWidth,ROAD.shoulderY+.018,roadMaterials.shoulder);
  addRoadSurface(group,points,roadWidth,ROAD.surfaceY+.018,roadMaterials.asphalt);
  addRoadCurbs(group,points,roadWidth);
}
function makeRoad(points,bridge,s=null){if(!Array.isArray(points)||points.length<2)return new THREE.Group();const group=new THREE.Group(),clean=roundedRoadPoints(points);if(clean.length<2)return group;const width=bridge?ROAD.bridgeWidth:ROAD.width,shoulder=bridge?width+1.5:ROAD.shoulderWidth;if(bridge){addRoadSurface(group,clean,shoulder,ROAD.bridgeY,roadMaterials.bridgeDeck);addRoadSurface(group,clean,width,ROAD.surfaceY,roadMaterials.asphalt);addRoadMarkings(group,clean,width);addRoadRails(group,clean,width);addBridgeSupports(group,clean);}else{addRoadSurface(group,clean,shoulder,ROAD.shoulderY,roadMaterials.shoulder);addRoadSurface(group,clean,width,ROAD.surfaceY,roadMaterials.asphalt);addRoadMarkings(group,clean,width);addRoadCurbs(group,clean,width);}if(!bridge&&s)for(const p of[clean[0],clean.at(-1)]){const connection=buildingForRoadEndpoint(s,p);if(connection)addBuildingAccessApron(group,connection.building,p,connection.facade,bridge);}const capRadius=(bridge?width:shoulder)/2;addRoadEndCap(group,clean[0],capRadius,bridge?roadMaterials.bridgeDeck:roadMaterials.shoulder,bridge?ROAD.bridgeY:ROAD.shoulderY);addRoadEndCap(group,clean.at(-1),capRadius,bridge?roadMaterials.bridgeDeck:roadMaterials.shoulder,bridge?ROAD.bridgeY:ROAD.shoulderY);if(!bridge){addRoadEndpointJoin(group,clean[0],width);addRoadEndpointJoin(group,clean.at(-1),width);addBoundaryRoadEnd(group,clean[0],width,ROAD.shoulderY);addBoundaryRoadEnd(group,clean.at(-1),width,ROAD.shoulderY);}return group;}
function roadDirection(a,b){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);return len?{x:dx/len,y:dy/len}:null;}
function addLaneAwareJunction(group,center,connections){
  if(connections.length<2)return;
  const radius=ROAD.width*.66+Math.min(9,connections.length*1.6),apronRadius=radius+ROAD.shoulderWidth*.18;
  const apron=new THREE.Mesh(new THREE.CylinderGeometry(apronRadius,apronRadius,.10,64),roadMaterials.shoulder);
  apron.position.set(center.x,ROAD.shoulderY-.015,center.y);apron.receiveShadow=true;group.add(apron);
  const asphalt=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.16,64),roadMaterials.asphalt);
  asphalt.position.set(center.x,ROAD.surfaceY-.015,center.y);asphalt.receiveShadow=true;group.add(asphalt);
  const sorted=[...connections].sort((a,b)=>Math.atan2(a.outer.y-center.y,a.outer.x-center.x)-Math.atan2(b.outer.y-center.y,b.outer.x-center.x));
  const innerRadius=radius*.58;
  for(let i=0;i<sorted.length;i++){
    const a=sorted[i],b=sorted[(i+1)%sorted.length];
    const aa=Math.atan2(a.outer.y-center.y,a.outer.x-center.x),ab=Math.atan2(b.outer.y-center.y,b.outer.x-center.x);
    let delta=ab-aa;if(delta<0)delta+=Math.PI*2;
    if(delta<.25||delta>Math.PI*1.5)continue;
    const mid=aa+delta/2;
    const sweep=Math.min(delta-.18,Math.PI*.72),start=mid-sweep/2,end=mid+sweep/2;
    const curve=[];
    for(let s=0;s<=14;s++){const t=s/14,ang=start+(end-start)*t;curve.push({x:center.x+Math.cos(ang)*innerRadius,y:center.y+Math.sin(ang)*innerRadius});}
    addRibbonStrip(group,curve,ROAD.width*.9,ROAD.surfaceY+.09,roadMaterials.asphalt);
  }
}
function makeRoadJunctions(roads){const group=new THREE.Group();const network=roadTopology({roads:(roads||[]).filter(road=>!road?.bridge)});for(const node of network.nodes){const links=network.adjacency.get(node)||[];if(links.length<3)continue;const connections=[];for(const link of links){const dx=link.node.x-node.x,dy=link.node.y-node.y,len=Math.hypot(dx,dy)||1;connections.push({inner:{x:node.x,y:node.y},outer:{x:node.x+dx/len*20,y:node.y+dy/len*20}});}const unique=[];for(const connection of connections)if(!unique.some(existing=>Math.abs(existing.outer.x-connection.outer.x)<8&&Math.abs(existing.outer.y-connection.outer.y)<8))unique.push(connection);if(unique.length>=3){const active=unique.slice(0,4),center={x:node.x,y:node.y},radius=ROAD.width*.66+Math.min(9,active.length*1.6);addLaneAwareJunction(group,center,active);addJunctionControlLines(group,center,active,radius);}}return group;}
function addJunctionControlLines(group,center,connections,radius){
  for(const connection of connections){
    const d=roadDirection(connection.inner,connection.outer);if(!d)continue;
    const travel={x:-d.x,y:-d.y},left={x:-travel.y,y:travel.x};
    const distance=radius+9,centerOffset=7;
    const p={x:center.x+d.x*distance+left.x*centerOffset,y:center.y+d.y*distance+left.y*centerOffset};
    const a={x:p.x-travel.x*(ROAD.width*.56),y:p.y-travel.y*(ROAD.width*.56)};
    const b={x:p.x+travel.x*(ROAD.width*.56),y:p.y+travel.y*(ROAD.width*.56)};
    addRibbonStrip(group,[a,b],.92,ROAD.markingY+.035,roadMaterials.edge);
  }
}
function disposeMaterial(material){if(Array.isArray(material)){material.forEach(disposeMaterial);return;}if(!material||sharedMaterials.has(material))return;material.dispose?.();}
function disposeObject(g){g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)disposeMaterial(o.material);});}
function clearDynamic(){for(const g of worldObjects){scene.remove(g);disposeObject(g);}worldObjects.clear();meshes.clear();for(const g of truckMeshes.values()){scene.remove(g);disposeObject(g);}truckMeshes.clear();}
function init(canvas){if(renderer)return;renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=true;scene=new THREE.Scene();scene.background=new THREE.Color('#c3c6c2');root=new THREE.Group();scene.add(root);previewGroup=new THREE.Group();scene.add(previewGroup);buildingPreviewGroup=new THREE.Group();scene.add(buildingPreviewGroup);roadEditGroup=new THREE.Group();scene.add(roadEditGroup);roadEndpointGroup=new THREE.Group();scene.add(roadEndpointGroup);scene.add(new THREE.HemisphereLight('#f6f7f3','#69746d',1.4));const sun=new THREE.DirectionalLight('#fff8e8',1.75);sun.position.set(-240,360,180);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.near=20;sun.shadow.camera.far=1100;sun.shadow.camera.left=-520;sun.shadow.camera.right=520;sun.shadow.camera.top=520;sun.shadow.camera.bottom=-520;scene.add(sun);const fill=new THREE.DirectionalLight('#d7e4ff',0.72);fill.position.set(180,160,-260);scene.add(fill);const ground=box(2600,2,2600,'#9aa39a');ground.position.y=-1;ground.receiveShadow=true;scene.add(ground);const river=new THREE.Group(),riverWidth=82,riverStart=-1300,riverStep=44;for(let x=riverStart;x<=1300;x+=riverStep){const x2=Math.min(1300,x+riverStep+8),mid=(x+x2)/2,dy=riverY(x2)-riverY(x),angle=Math.atan2(dy,x2-x),segment=box(Math.hypot(x2-x,dy)+10,.7,riverWidth,'#6f98a3');segment.position.set(mid,.1,(riverY(x)+riverY(x2))/2);segment.rotation.y=-angle;river.add(segment);}scene.add(river);addEnvironment();resize(canvas.clientWidth||innerWidth,canvas.clientHeight||innerHeight);}
function resize(w,h){if(!renderer)return;viewport.width=Math.max(1,w);viewport.height=Math.max(1,h);renderer.setSize(viewport.width,viewport.height,false);if(camera3d){camera3d.aspect=viewport.width/viewport.height;camera3d.updateProjectionMatrix();}}
function ensureCamera(){if(!camera3d)camera3d=new THREE.PerspectiveCamera(48,viewport.width/Math.max(1,viewport.height),1,5000);const yaw=target.yaw,pitch=Math.max(.35,Math.min(1.35,target.pitch)),horizontal=Math.cos(pitch)*target.distance;camera3d.position.set(target.x+Math.sin(yaw)*horizontal,Math.sin(pitch)*target.distance,target.z+Math.cos(yaw)*horizontal);camera3d.lookAt(target.x,0,target.z);camera3d.updateProjectionMatrix();cameraReady=true;}
function updateCameraBounds(){const limit=WORLD_HALF_SIZE-WORLD_MARGIN;desired.x=Math.max(-limit,Math.min(limit,desired.x));desired.z=Math.max(-limit,Math.min(limit,desired.z));}
function syncCamera(){const lerp=(a,b,t)=>a+(b-a)*t;target.x=lerp(target.x,desired.x,.16);target.z=lerp(target.z,desired.z,.16);target.yaw=lerp(target.yaw,desired.yaw,.16);target.pitch=lerp(target.pitch,desired.pitch,.16);target.distance=lerp(target.distance,desired.distance,.16);ensureCamera();}
function clearPreview(group){while(group.children.length){const child=group.children[0];group.remove(child);disposeObject(child);}}
function addPolylinePreview(group,points,color='#ffd45a'){if(!Array.isArray(points)||points.length<2)return;const material=roadMat(color);for(let i=1;i<points.length;i++)addRoadBox(group,points[i-1],points[i],ROAD.width*.72,.18,ROAD.surfaceY+.25,material);}
function setPreview(path,start,end,blocked=false){if(!previewGroup)return;const key=JSON.stringify([path||null,start?.x,start?.y,end?.x,end?.y,!!blocked]);if(key===previewKey)return;previewKey=key;clearPreview(previewGroup);if(Array.isArray(path)&&path.length>1)addPolylinePreview(previewGroup,path,blocked?'#d85a52':'#ffd45a');}
function setBuildingPreview(type,point,blocked=false){if(!buildingPreviewGroup)return;clearPreview(buildingPreviewGroup);if(!point||!type)return;const fp=type.kind==='warehouse'?{w:96,d:66}:type.kind==='factory'?{w:78,d:62}:{w:70,d:56},material=new THREE.MeshBasicMaterial({color:blocked?'#d85a52':'#7fd8a8',transparent:true,opacity:.38,depthWrite:false}),mesh=new THREE.Mesh(new THREE.BoxGeometry(fp.w,8,fp.d),material);mesh.position.set(point.x,4,point.y);buildingPreviewGroup.add(mesh);}
function pointOnRoute(points,t){const total=points.reduce((n,p,i)=>i?n+Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y):0,0);if(!total)return points[0];let want=total*Math.max(0,Math.min(1,t)),run=0;for(let i=1;i<points.length;i++){const seg=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);if(run+seg>=want){const q=(want-run)/seg;return{x:points[i-1].x+(points[i].x-points[i-1].x)*q,y:points[i-1].y+(points[i].y-points[i-1].y)*q};}run+=seg;}return points.at(-1);}
function addBoxPart(g,geo,material,x,y,z,rotationY=0,cast=true){
  const m=new THREE.Mesh(geo,material);
  m.position.set(x,y,z);m.rotation.y=rotationY;m.castShadow=cast;m.receiveShadow=true;g.add(m);return m;
}
function addFacadeWindows(g,w,d,y,glass,frame,side=false){
  const count=Math.max(3,Math.floor((side?w:d)/15));
  for(let i=0;i<count;i++){
    const t=(i+.5)/count;
    if(side){
      const z=-d/2+t*d;
      for(const x of[-w/2-.18,w/2+.18]){
        addBoxPart(g,new THREE.BoxGeometry(.35,4.4,6.5),glass,x,y,z,false);
        addBoxPart(g,new THREE.BoxGeometry(.5,4.8,.35),frame,x,y,z-3.35);
        addBoxPart(g,new THREE.BoxGeometry(.5,4.8,.35),frame,x,y,z+3.35);
      }
    }else{
      const x=-w/2+t*w;
      for(const z of[-d/2-.18,d/2+.18]){
        addBoxPart(g,new THREE.BoxGeometry(6.5,4.4,.35),glass,x,y,z,false);
        addBoxPart(g,new THREE.BoxGeometry(6.9,.38,.5),frame,x,y-2.4,z);
        addBoxPart(g,new THREE.BoxGeometry(6.9,.38,.5),frame,x,y+2.4,z);
      }
    }
  }
}
function addGableRoof(g,w,d,h,roof,metal){
  const over=4,halfW=w/2+over,base=h+2.2,ridge=h+9;
  const verts=[
    -halfW,base,-d/2-over, halfW,base,-d/2-over, 0,ridge,-d/2-over,
    -halfW,base,d/2+over, halfW,base,d/2+over, 0,ridge,d/2+over
  ];
  const indices=[0,1,2,3,5,4,0,3,4,0,4,1,1,4,5,1,5,2,2,5,3,2,3,0];
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  geo.setIndex(indices);geo.computeVertexNormals();
  const roofMesh=new THREE.Mesh(geo,roof);roofMesh.castShadow=true;roofMesh.receiveShadow=true;g.add(roofMesh);
  addBoxPart(g,new THREE.BoxGeometry(2.4,1.2,d+6),metal,0,ridge+.2,0);
  for(const x of[-w*.32,-w*.1,w*.1,w*.32])addBoxPart(g,new THREE.BoxGeometry(1.4,1.2,d+3),metal,x,h+3.1,0);
}
function addRecessedLoadingBay(g,x,z,w,h,dark,metal){
  const depth=3.2;
  addBoxPart(g,new THREE.BoxGeometry(w+4,h+3,depth),dark,x,h/2+2,z+(z>0?-depth/2:depth/2));
  addBoxPart(g,new THREE.BoxGeometry(w+5,.65,2.2),metal,x,h+3.5,z+(z>0?-depth-1:depth+1));
  for(const side of[-1,1])addBoxPart(g,new THREE.BoxGeometry(1.4,h+1,depth+1),metal,x+side*(w/2+1),h/2+2,z);
  addBoxPart(g,new THREE.BoxGeometry(w*.82,1.2,.45),mat('#555b59',.9),x,h-1,z+(z>0?-depth-1.7:depth+1.7),0,false);
}
function addLoadingYard(g,x,z,w,d,metal,dark){
  const yard=mat('#555b5b',.98);
  addBoxPart(g,new THREE.BoxGeometry(w,.22,d),yard,x,.12,z,0,false);
  const bayZ=z+(z>0?d/2-7:-d/2+7);
  for(const offset of[-w*.32,0,w*.32]){
    addBoxPart(g,new THREE.BoxGeometry(3.2,.12,d*.58),metal,x+offset,.27,bayZ,0,false);
    addBoxPart(g,new THREE.BoxGeometry(3.2,.08,1.4),dark,x+offset,.34,bayZ+(z>0?-d*.29:d*.29),0,false);
  }
  const trailerMat=mat('#858b88',.94);
  for(const offset of[-w*.28,w*.28]){
    addBoxPart(g,new THREE.BoxGeometry(16,3.8,6.5),trailerMat,x+offset,2.05,z+(z>0?d*.14:-d*.14));
    for(const wx of[-5,-1,3])addBoxPart(g,new THREE.CylinderGeometry(1.1,1.1,.7,12),dark,x+offset+wx,.95,z+(z>0?d*.14:-d*.14)-3.3);
  }
  addBoxPart(g,new THREE.BoxGeometry(w+4,1.1,1),metal,x,.65,z+(z>0?d/2:-d/2));
}
function addIndustrialProps(g,w,d,h,metal,dark){
  for(const x of[-w*.38,w*.38]){
    addBoxPart(g,new THREE.CylinderGeometry(2.4,2.8,7,12),metal,x,h+4.5,d*.18);
    addBoxPart(g,new THREE.CylinderGeometry(2.9,2.9,.8,12),dark,x,h+8.1,d*.18);
  }
  addBoxPart(g,new THREE.BoxGeometry(9,2.4,4),dark,w*.34,2,d*.42);
  addBoxPart(g,new THREE.BoxGeometry(7,2.8,3.5),metal,-w*.34,2,d*.42);
}
function addCylinderPart(g,radius,height,material,x,y,z,segments=12,cast=true){
  return addBoxPart(g,new THREE.CylinderGeometry(radius,radius,height,segments),material,x,y,z,0,cast);
}
function addPallet(g,x,z,metal,dark){
  const wood=mat('#71675b',.96);
  addBoxPart(g,new THREE.BoxGeometry(5,.45,4),wood,x,.55,z,0,false);
  for(const px of[-1.8,0,1.8])addBoxPart(g,new THREE.BoxGeometry(.45,.65,3.4),wood,x+px,.35,z,0,false);
  for(const pz of[-1.35,1.35])addBoxPart(g,new THREE.BoxGeometry(4.8,.35,.35),metal,x,.8,z+pz,0,false);
  const load=new THREE.Mesh(new THREE.BoxGeometry(4.4,1.8,3.2),mat('#8a8f8b',.92));load.position.set(x,1.65,z);load.castShadow=true;g.add(load);return load;
}
function addDumpster(g,x,z,metal,dark){
  const body=mat('#4e5553',.94),lid=mat('#363c3b',.96);
  addBoxPart(g,new THREE.BoxGeometry(6,3.4,4.2),body,x,1.9,z);
  addBoxPart(g,new THREE.BoxGeometry(6.4,.45,4.5),lid,x,3.75,z);
  for(const px of[-2.2,2.2])addCylinderPart(g,.35,4,lid,x+px,1.2,z,10);
}
function addFuelTank(g,x,z,metal,dark){
  const tankMat=mat('#68706d',.78,.45),darkMat=mat('#3e4442',.92);
  const tank=new THREE.Mesh(new THREE.CylinderGeometry(3.2,3.2,10,16),tankMat);
  tank.rotation.z=Math.PI/2;tank.position.set(x,4,z);tank.castShadow=true;tank.receiveShadow=true;g.add(tank);
  for(const px of[-3.2,3.2])addBoxPart(g,new THREE.BoxGeometry(.8,2.4,5),darkMat,x+px,1.7,z);
  addBoxPart(g,new THREE.BoxGeometry(2,1.2,1.5),darkMat,x,9,z);
}
function addPipeRun(g,points,material,radius=.55){
  if(points.length<2)return;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    if(len<.1)continue;
    const pipe=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,len,8),material);
    pipe.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx,b.y-a.y,dz).normalize());
    pipe.castShadow=true;g.add(pipe);
  }
}
function addForklift(g,x,z,metal,dark){
  const forkMat=mat('#a18c56',.82,.35),frame=mat('#4b514f',.88,.25);
  addBoxPart(g,new THREE.BoxGeometry(4.4,2.5,2.8),forkMat,x,2,z);
  addBoxPart(g,new THREE.BoxGeometry(.7,5.5,2.1),frame,x+1.65,4.2,z);
  addBoxPart(g,new THREE.BoxGeometry(2.8,.3,.5),forkMat,x+3.2,1.05,z-.85);
  addBoxPart(g,new THREE.BoxGeometry(2.8,.3,.5),forkMat,x+3.2,1.05,z+.85);
  for(const px of[-1.3,1.5])for(const pz of[-1.35,1.35])addCylinderPart(g,.65,1.0,dark,x+px,1,z+pz,10);
  g.userData.baseX=x;g.userData.baseZ=z;g.userData.forklift=true;return g;
}
function addFenceLine(g,x1,z1,x2,z2,metal,postSpacing=9){
  const fenceMat=metal||mat('#4b514f',.9,.25),dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz),count=Math.max(1,Math.ceil(len/postSpacing));
  for(let i=0;i<=count;i++){const t=i/count,x=x1+dx*t,z=z1+dz*t;addCylinderPart(g,.28,4.2,fenceMat,x,2.1,z,8);}
  for(const y of[1.1,3.1]){
    const rail=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,len,8),fenceMat);
    rail.position.set((x1+x2)/2,y,(z1+z2)/2);rail.rotation.z=Math.PI/2;rail.rotation.y=-Math.atan2(dz,dx);g.add(rail);
  }
}
function addGate(g,x,z,width,metal){
  const gateMat=mat('#454b49',.88,.3);
  addCylinderPart(g,.38,5,gateMat,x-width/2,2.5,z,8);
  addCylinderPart(g,.38,5,gateMat,x+width/2,2.5,z,8);
  addBoxPart(g,new THREE.BoxGeometry(width,3.8,.35),gateMat,x,2.4,z);
  addBoxPart(g,new THREE.BoxGeometry(width+.8,.25,.5),metal,x,4.5,z);
}
function addStaffParking(g,x,z,w,d,metal,dark){
  const asphalt=mat('#4b5150',.98);
  addBoxPart(g,new THREE.BoxGeometry(w,.18,d),asphalt,x,.1,z,0,false);
  const lineMat=mat('#d7d9d4',.7);
  const spaces=Math.max(3,Math.floor(w/8));
  for(let i=0;i<=spaces;i++){
    const px=x-w/2+i*w/spaces;
    addBoxPart(g,new THREE.BoxGeometry(.28,.08,d*.78),lineMat,px,.22,z,0,false);
  }
  addBoxPart(g,new THREE.BoxGeometry(w+3,.5,1.2),metal,x,.4,z-d/2+2,0,false);
}
function addEntrance(g,x,z,w,h,metal,dark){
  const frame=metal||dark,glass=mat('#334b4f',.24,.08);
  addBoxPart(g,new THREE.BoxGeometry(w+.8,h+.8,.7),frame,x,h/2+2,z);
  addBoxPart(g,new THREE.BoxGeometry(w*.42,h-.8,.28),glass,x-w*.22,h/2+2,z-.38,false);
  addBoxPart(g,new THREE.BoxGeometry(w*.42,h-.8,.28),glass,x+w*.22,h/2+2,z-.38,false);
  addBoxPart(g,new THREE.BoxGeometry(.35,h-.8,.5),frame,x,h/2+2,z-.58);
  addBoxPart(g,new THREE.BoxGeometry(w+4,.7,3),frame,x,h+2.7,z+1.2);
  addBoxPart(g,new THREE.BoxGeometry(w+5,.25,5),frame,x,.25,z+3,0,false);
  addBoxPart(g,new THREE.BoxGeometry(1.2,.8,.6),dark,x+w*.38,h/2+2,z-.7);
}
function addTruckTurningPad(g,x,z,radius,metal){
  const pad=mat('#5a605e',.98);
  const ring=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.18,48),pad);
  ring.position.set(x,.1,z);ring.receiveShadow=true;g.add(ring);
  const inner=new THREE.Mesh(new THREE.CylinderGeometry(radius*.55,radius*.55,.2,48),mat('#777c78',.98));
  inner.position.set(x,.21,z);inner.receiveShadow=true;g.add(inner);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;addBoxPart(g,new THREE.BoxGeometry(radius*.45,.12,1),metal,x+Math.cos(a)*radius*.72,.27,z+Math.sin(a)*radius*.72,a,0,false);
  }
}
function addIndustrialSite(g,w,d,h,metal,dark,kind){
  const yardZ=d/2+35, yardD=38;
  addTruckTurningPad(g,0,yardZ+8,24,metal);
  const forklifts=[addForklift(g,-w*.28,yardZ-4,metal,dark),addForklift(g,w*.28,yardZ-4,metal,dark)];
  const pallets=[addPallet(g,-w*.35,yardZ+17,metal,dark),addPallet(g,-w*.18,yardZ+17,metal,dark),addPallet(g,w*.34,yardZ+17,metal,dark)];
  g.userData.siteForklifts=forklifts.filter(Boolean);g.userData.sitePallets=pallets.filter(Boolean);
  addDumpster(g,w*.48,d*.42,metal,dark);
  addFuelTank(g,-w*.42,d*.42,metal,dark);
  addStaffParking(g,w*.22,-d/2-24,34,15,metal,dark);
  addEntrance(g,-w*.25,-d/2-.8,10,9,metal,dark);
  addFenceLine(g,-w/2-10,-d/2-5,-w/2-10,d/2+15,metal);
  addFenceLine(g,w/2+10,-d/2-5,w/2+10,d/2+15,metal);
  addGate(g,0,d/2+55,18,metal);
  const pipeMat=mat('#555c59',.84,.35);
  addPipeRun(g,[{x:-w*.42,y:10,z:-d/2},{x:-w*.42,y:10,z:d*.15},{x:-w*.28,y:18,z:d*.15}],pipeMat,.7);
  addPipeRun(g,[{x:w*.38,y:7,z:-d/2},{x:w*.38,y:7,z:d*.22},{x:w*.25,y:14,z:d*.22}],pipeMat,.6);
}
function addDockDetails(g,x,z,w,h,front,metal,dark){
  const signMat=mat('#c1c5bf',.72);
  const doorMat=mat('#303635',.98);
  const signZ=z+(front>0?.7:-.7);
  addBoxPart(g,new THREE.BoxGeometry(w,.9,.5),signMat,x,h+4,signZ,false,false);
  addBoxPart(g,new THREE.BoxGeometry(w*.86,h*.72,.28),doorMat,x,h*.46+2,signZ-front*.25,false);
  for(const side of[-1,1]){
    addBoxPart(g,new THREE.BoxGeometry(1.2,.65,.9),metal,x+side*(w/2+1.3),1.2,z+front*1.2,0,false);
    addBoxPart(g,new THREE.BoxGeometry(.35,2.8,.35),dark,x+side*(w/2+1.3),2.1,z+front*1.2);
  }
}
function addRoofEquipment(g,w,d,h,metal,dark,count=3){
  for(let i=0;i<count;i++){
    const x=-w*.32+i*(w*.32);
    addBoxPart(g,new THREE.BoxGeometry(8,2.2,5),dark,x,h+10.5,0);
    addBoxPart(g,new THREE.BoxGeometry(5.5,.7,3.5),metal,x,h+11.9,0);
    addBoxPart(g,new THREE.CylinderGeometry(.5,.7,1.8,10),metal,x,h+13,0);
  }
}
function addBuildingFoundation(g,w,d,metal){
  addBoxPart(g,new THREE.BoxGeometry(w+4,.7,d+4),metal,0,1.65,0,0,false);
  addBoxPart(g,new THREE.BoxGeometry(w+7,.35,d+7),mat('#626966',.98),0,.45,0,0,false);
}
function addSafetyDetails(g,w,d,h,metal,dark){
  const safety=mat('#6d736f',.86,.2);
  addBoxPart(g,new THREE.BoxGeometry(2.2,1.1,.7),safety,-w*.45,h*.58,d/2+.5);
  addBoxPart(g,new THREE.BoxGeometry(2.2,1.1,.7),safety,w*.45,h*.58,d/2+.5);
  for(const x of[-w*.42,w*.42]){
    addCylinderPart(g,.22,h*.55,safety,x,h*.3,-d/2-.7,8);
    addBoxPart(g,new THREE.BoxGeometry(3,.25,.25),dark,x,h*.55,-d/2-.7);
  }
}
function createFactoryModel(){
  const g=new THREE.Group(),w=78,d=62,h=25;
  const body=mat('#747b7b',.9),dark=mat('#3f4443',.96),metal=mat('#59605e',.84),glass=mat('#3d5559',.3,.12),roof=mat('#4e5453',.96);
  addBuildingFoundation(g,w,d,metal);
  addBoxPart(g,new THREE.BoxGeometry(w,h,d),body,0,h/2+2,0);
  addBoxPart(g,new THREE.BoxGeometry(w*.58,3,d+.8),dark,0,7,d/2+.45);
  addFacadeWindows(g,w,d,16,glass,dark,false);addFacadeWindows(g,w,d,16,glass,dark,true);
  addRecessedLoadingBay(g,0,d/2+.5,22,14,dark,metal);
  addRecessedLoadingBay(g,-w*.3,-d/2-.5,13,10,dark,metal);
  addDockDetails(g,0,d/2+.5,22,14,1,metal,dark);
  addDockDetails(g,-w*.3,-d/2-.5,13,10,-1,metal,dark);
  addGableRoof(g,w,d,h,roof,metal);
  addRoofEquipment(g,w,d,h,metal,dark,3);
  addSafetyDetails(g,w,d,h,metal,dark);
  addLoadingYard(g,0,d/2+35,70,38,metal,dark);
  addIndustrialProps(g,w,d,h,metal,dark);
  addIndustrialSite(g,w,d,h,metal,dark,'factory');
  for(const x of[-w*.28,w*.28]){
    addBoxPart(g,new THREE.CylinderGeometry(3.2,4.1,20,14),dark,x,h+12,0);
    addBoxPart(g,new THREE.CylinderGeometry(3.7,3.7,1.4,14),metal,x,h+22.5,0);
  }
  for(const x of[-w*.36,w*.36])addBoxPart(g,new THREE.BoxGeometry(10,5,.8),dark,x,5,-d/2-.5);
  return g;
}
function createWarehouseModel(){
  const g=new THREE.Group(),w=96,d=66,h=21;
  const body=mat('#858b89',.94),roof=mat('#535957',.97),dark=mat('#414746',.97),glass=mat('#43585b',.3,.1),metal=mat('#656b68',.86);
  addBuildingFoundation(g,w,d,metal);
  addBoxPart(g,new THREE.BoxGeometry(w,h,d),body,0,h/2+2,0);
  addFacadeWindows(g,w,d,14,glass,dark,false);addFacadeWindows(g,w,d,14,glass,dark,true);
  addRecessedLoadingBay(g,0,d/2+.5,24,13,dark,metal);
  addRecessedLoadingBay(g,-w*.32,d/2+.5,14,10,dark,metal);
  addRecessedLoadingBay(g,w*.32,-d/2-.5,14,10,dark,metal);
  addDockDetails(g,0,d/2+.5,24,13,1,metal,dark);
  addDockDetails(g,-w*.32,d/2+.5,14,10,1,metal,dark);
  addDockDetails(g,w*.32,-d/2-.5,14,10,-1,metal,dark);
  addGableRoof(g,w,d,h,roof,metal);
  addRoofEquipment(g,w,d,h,metal,dark,4);
  addSafetyDetails(g,w,d,h,metal,dark);
  addLoadingYard(g,0,d/2+38,88,42,metal,dark);
  addIndustrialProps(g,w,d,h,metal,dark);
  addIndustrialSite(g,w,d,h,metal,dark,'warehouse');
  for(const x of[-w*.3,0,w*.3]){
    addBoxPart(g,new THREE.BoxGeometry(10,3.2,7),dark,x,h+4.5,0);
    addBoxPart(g,new THREE.BoxGeometry(7,1,5),metal,x,h+6.3,0);
  }
  return g;
}
function createShopModel(){
  const g=new THREE.Group(),w=70,d=56,h=17;
  const body=mat('#777d7a',.9),roof=mat('#505655',.96),glass=mat('#354b4f',.25,.12),dark=mat('#3c4241',.96),metal=mat('#6b706d',.82);
  addBuildingFoundation(g,w,d,metal);
  addBoxPart(g,new THREE.BoxGeometry(w,h,d),body,0,h/2+2,0);
  addBoxPart(g,new THREE.BoxGeometry(w+5,1.8,d+5),roof,0,h+3,0);
  addBoxPart(g,new THREE.BoxGeometry(w*.78,7,.5),glass,0,7,d/2+.35,false);
  for(const x of[-w*.39,w*.39])addBoxPart(g,new THREE.BoxGeometry(5,7,.6),dark,x,7,d/2+.6);
  addBoxPart(g,new THREE.BoxGeometry(9,8,.7),dark,0,7,d/2+.7);
  addBoxPart(g,new THREE.BoxGeometry(w*.82,1.1,3),metal,0,11,d/2+1.5);
  addBoxPart(g,new THREE.BoxGeometry(w*.55,2.8,.8),dark,0,14,d/2+.7);
  addFacadeWindows(g,w,d,11,glass,dark,true);
  for(const x of[-w*.32,w*.32])addBoxPart(g,new THREE.BoxGeometry(5,2,4),metal,x,h+3.5,0);
  addBoxPart(g,new THREE.BoxGeometry(48,.2,34),mat('#5c6260',.98),0,.12,d/2+25,0,false);
  for(const x of[-19,0,19])addBoxPart(g,new THREE.BoxGeometry(2.8,.12,15),metal,x,.27,d/2+25,0,false);
  for(const x of[-22,22])addBoxPart(g,new THREE.BoxGeometry(2.5,1.5,2.5),dark,x,.9,d/2+25);
  addEntrance(g,0,-d/2-.7,12,8,metal,dark);
  addStaffParking(g,0,d/2+38,50,20,metal,dark);
  addDumpster(g,w*.42,d*.38,metal,dark);
  addFenceLine(g,-w/2-8,-d/2-4,-w/2-8,d/2+8,metal);addGate(g,0,d/2+38,16,metal);
  return g;
}
function addBuildingStatusVisual(g,building){
  const dims=building.kind==='warehouse'?{w:96,d:66,h:21}:building.kind==='factory'?{w:78,d:62,h:25}:{w:70,d:56,h:17};
  const statusMat=new THREE.MeshStandardMaterial({color:'#7b8581',roughness:.45,metalness:.15,emissive:'#26302d',emissiveIntensity:.15});
  const beacon=addBoxPart(g,new THREE.BoxGeometry(2.2,1.2,2.2),statusMat,dims.w*.38,dims.h+11,0);
  beacon.userData.statusMaterial=statusMat;
  const dockLightMat=new THREE.MeshStandardMaterial({color:'#777d79',roughness:.35,emissive:'#222827',emissiveIntensity:.12});
  const dockLightY=dims.h*.62;
  const dockLight=addBoxPart(g,new THREE.BoxGeometry(3.5,1.2,.5),dockLightMat,0,dockLightY,dims.d/2+1.4,false);
  dockLight.userData.statusMaterial=dockLightMat;
  const statusRing=new THREE.Mesh(new THREE.TorusGeometry(2.2,.25,6,16),new THREE.MeshStandardMaterial({color:'#5d6562',roughness:.5,emissive:'#222827',emissiveIntensity:.1}));
  statusRing.rotation.x=Math.PI/2;statusRing.position.set(0,.35,dims.d/2+1.8);statusRing.userData.statusMaterial=statusRing.material;g.add(statusRing);
  g.userData.statusBeacon=beacon;g.userData.dockLight=dockLight;g.userData.statusRing=statusRing;g.userData.buildingId=building.id;
}
function addFactorySmoke(g,w,d,h){
  const smokeMat=new THREE.MeshStandardMaterial({color:'#7f8582',transparent:true,opacity:.12,roughness:1});
  const puffs=[];
  for(const x of[-w*.28,w*.28])for(let i=0;i<3;i++){
    const puff=new THREE.Mesh(new THREE.SphereGeometry(2.2+i*.5,8,6),smokeMat);
    puff.position.set(x,h+22+i*4,0);puff.visible=false;g.add(puff);puffs.push(puff);
  }
  g.userData.smokePuffs=puffs;
}
function segmentHitsBuilding(a,b,building){
  const hit=buildingHitbox(building,1);
  const inside=p=>p.x>=hit.minX&&p.x<=hit.maxX&&p.y>=hit.minY&&p.y<=hit.maxY;
  if(inside(a)||inside(b))return true;
  const cross=(u,v)=>u.x*v.y-u.y*v.x;
  const ab={x:b.x-a.x,y:b.y-a.y};
  const edgeHit=(c,d)=>{
    const cd={x:d.x-c.x,y:d.y-c.y},ac={x:c.x-a.x,y:c.y-a.y},den=cross(ab,cd);
    if(Math.abs(den)<1e-8)return false;
    const t=cross(ac,cd)/den,u=cross(ac,ab)/den;
    return t>0&&t<1&&u>0&&u<1;
  };
  const edges=[
    [{x:hit.minX,y:hit.minY},{x:hit.maxX,y:hit.minY}],
    [{x:hit.maxX,y:hit.minY},{x:hit.maxX,y:hit.maxY}],
    [{x:hit.maxX,y:hit.maxY},{x:hit.minX,y:hit.maxY}],
    [{x:hit.minX,y:hit.maxY},{x:hit.minX,y:hit.minY}]
  ];
  return edges.some(([c,d])=>edgeHit(c,d));
}
function addBuildingAccess(g,building){
  const attachment=roadAttachment(ws||{},building);
  if(!attachment)return null;
  const docks=buildingDockPoints(building);
  if(!docks.length)return null;
  const dock=docks.reduce((best,current)=>{
    const score=Math.hypot(attachment.point.x-current.approach.x,attachment.point.y-current.approach.y);
    return !best||score<best.score?{...current,score}:best;
  },null);
  if(!dock)return null;
  const a={x:attachment.point.x,y:attachment.point.y},b={x:dock.approach.x,y:dock.approach.y};
  if(segmentHitsBuilding(a,b,building))return null;
  const la={x:a.x-building.x,y:a.y-building.y},lb={x:b.x-building.x,y:b.y-building.y};
  addRoadBox(g,la,lb,16,.16,.6,roadMaterials.asphalt);
  addRoadBox(g,la,lb,17.5,.10,.7,roadMaterials.curb);
  const marker=new THREE.Mesh(new THREE.BoxGeometry(Math.max(6,dock.width),.12,5),roadMaterials.edge);
  marker.position.set(dock.x,.8,dock.y);g.add(marker);
  g.userData.buildingAccess={roadPoint:a,dock,connected:true};
  return g.userData.buildingAccess;
}
function createBuildingModel(building){
  const g=building.kind==='factory'?createFactoryModel(building):building.kind==='warehouse'?createWarehouseModel(building):createShopModel(building);
  addBuildingStatusVisual(g,building);
  if(building.kind==='factory')addFactorySmoke(g,78,62,25);
  return g;
}
function updateWorld(s){ws=s;clearDynamic();root.clear();addEnvironment(s);for(const road of s.roads||[]){const g=makeRoad(road.points,!!road.bridge,s);g.userData.road=road;root.add(g);worldObjects.add(g);}root.add(makeRoadJunctions(s.roads||[]));for(const building of s.buildings||[]){const g=createBuildingModel(building);g.position.set(Number(building.x)||0,0,Number(building.y)||0);g.userData.building=building;scene.add(g);meshes.set(building.id,g);worldObjects.add(g);}}
function createTruckMesh(){
  const g=new THREE.Group(),cabMat=mat('#59615f',.88),trailerMat=mat('#aeb2ae',.92),dark=mat('#242829',.98),glass=mat('#3f5155',.22,.08),metal=mat('#68706d',.82);
  addBoxPart(g,new THREE.BoxGeometry(6.8,6.3,7),cabMat,4.1,4.2,0);
  addBoxPart(g,new THREE.BoxGeometry(2.4,1.7,6.4),cabMat,7.8,2.8,0);
  addBoxPart(g,new THREE.BoxGeometry(.3,2.4,5.3),glass,7.55,5.25,0,false);
  addBoxPart(g,new THREE.BoxGeometry(11.5,7.6,7.5),trailerMat,-4.5,4.7,0);
  addBoxPart(g,new THREE.BoxGeometry(11.7,.55,7.7),metal,-4.5,8.55,0);
  for(const x of[-7,-2.8,3.8,6.2])for(const z of[-3.78,3.78]){const w=new THREE.Mesh(new THREE.CylinderGeometry(1.55,1.55,1.1,16),dark);w.rotation.x=Math.PI/2;w.position.set(x,1.65,z);w.castShadow=true;g.add(w);}
  for(const x of[5.8,7.7])for(const z of[-2.3,2.3])addBoxPart(g,new THREE.BoxGeometry(.35,1.1,.5),mat('#b8b7a7',.55),x,3,z,false);
  g.userData.wheels=g.children.filter(o=>o.isMesh&&o.geometry.type==='CylinderGeometry');return g;
}
function updateBuildingActivity(s){
  const now=performance.now()*.001;
  for(const b of s.buildings||[]){
    const g=meshes.get(b.id);if(!g)continue;
    const activeTrucks=(s.trucks||[]).filter(t=>!t.dead&&(t.source===b||t.to===b));
    const loading=activeTrucks.some(t=>(t.to===b&&t.stage==='delivery'&&t.t>.78)||(t.source===b&&t.stage==='warehouse'&&t.t<.22));
    const producing=b.kind==='factory'&&(Number(b.active)||0)>.15;
    const active=loading||producing||activeTrucks.length>0;
    const level=loading?1:producing?.65:.25;
    const beaconMat=g.userData.statusBeacon?.userData.statusMaterial;
    const dockMat=g.userData.dockLight?.userData.statusMaterial;
    const ringMat=g.userData.statusRing?.userData.statusMaterial;
    if(beaconMat){
      beaconMat.emissive.setHex(loading?0x8a5d25:producing?0x3f6d55:0x26302d);
      beaconMat.emissiveIntensity=active?(.45+.35*Math.sin(now*5)):0.12;
    }
    if(dockMat){
      dockMat.emissive.setHex(loading?0x8a5d25:producing?0x4b705f:0x222827);
      dockMat.emissiveIntensity=loading?.8:producing?.35:.08;
    }
    if(ringMat){
      ringMat.emissive.setHex(loading?0x8a5d25:producing?0x4b705f:0x222827);
      ringMat.emissiveIntensity=loading?.65:producing?.25:.06;
    }
    if(g.userData.statusRing)g.userData.statusRing.rotation.z=now*.5;
    const arriving=activeTrucks.filter(t=>t.to===b&&t.t>.68);
    const dockTarget=g.userData.buildingAccess?.dock?.approach;
    for(const[fi,fork]of(g.userData.siteForklifts||[]).entries()){
      const baseX=Number(fork.userData.baseX)||0,baseZ=Number(fork.userData.baseZ)||0;
      if(arriving.length&&dockTarget){
        const side=fi===0?-7:7;
        const tx=dockTarget.x-b.x;
        const tz=dockTarget.y-b.y+side;
        fork.position.x=baseX+(tx-baseX)*.12;
        fork.position.z=baseZ+(tz-baseZ)*.12;
        fork.rotation.y=Math.atan2(dockTarget.y-b.y,dockTarget.x-b.x);
      }else{
        fork.position.x=baseX+Math.sin(now*.7+fi)*1.5;
        fork.position.z=baseZ+Math.cos(now*.8+fi)*.7;
      }
    }
    for(const[palletIndex,pallet]of(g.userData.sitePallets||[]).entries()){
      pallet.visible=b.kind==='warehouse'?palletIndex<(Number(b.storage)||0):palletIndex<(Number(b.stock)||0);
      pallet.position.y=activeTrucks.length&&pallet.visible?Math.sin(now*2+palletIndex)*.12:0;
    }
    for(const[puffIndex,puff]of(g.userData.smokePuffs||[]).entries()){
      const t=(now*.18+puffIndex*.23)%1;
      puff.visible=producing;
      puff.position.y=47+puffIndex*4+t*8;
      puff.scale.setScalar(.7+t*.7);
      puff.material.opacity=producing?.14*(1-t):0;
    }
  }
}
function updateTrucks(s){
  const live=new Set();
  for(const truck of s.trucks||[]){
    if(!truck?.id)continue;live.add(truck.id);
    let mesh=truckMeshes.get(truck.id);
    if(!mesh){mesh=createTruckMesh();scene.add(mesh);truckMeshes.set(truck.id,mesh);}
    const route=Array.isArray(truck.route)?truck.route:truck.route?.points;if(!route?.length)continue;
    const progress=Math.max(0,Math.min(1,Number(truck.t)||0)),p=pointOnRoute(route,progress),q=pointOnRoute(route,Math.min(1,progress+.002));
    let visual={x:p.x,y:p.y};
    let nextVisual=q?{x:q.x,y:q.y}:visual;
    const source=truck.source;
    const destination=truck.to;
    const sourceAccess=source?meshes.get(source.id)?.userData.buildingAccess:null;
    const destinationAccess=destination?meshes.get(destination.id)?.userData.buildingAccess:null;
    if(sourceAccess&&progress<.14){
      const t=Math.max(0,Math.min(1,progress/.14));
      visual={x:sourceAccess.dock.approach.x+(p.x-sourceAccess.dock.approach.x)*t,y:sourceAccess.dock.approach.y+(p.y-sourceAccess.dock.approach.y)*t};
      nextVisual=pointOnRoute(route,Math.min(1,progress+.012));
    }
    if(destinationAccess&&progress>.84){
      const t=Math.max(0,Math.min(1,(progress-.84)/.16));
      visual={x:p.x+(destinationAccess.dock.approach.x-p.x)*t,y:p.y+(destinationAccess.dock.approach.y-p.y)*t};
      nextVisual=destinationAccess.dock.point;
    }
    mesh.position.set(visual.x,0,visual.y);
    if(nextVisual)mesh.rotation.y=-Math.atan2(nextVisual.y-visual.y,nextVisual.x-visual.x);
    if(Number(truck.wait)>0)mesh.position.y=.08;

    for(const wheel of mesh.userData.wheels||[])wheel.rotation.z-=(Number(truck.speed)||8)*.05;
  }
  for(const[id,mesh]of truckMeshes)if(!live.has(id)){scene.remove(mesh);disposeObject(mesh);truckMeshes.delete(id);}
}
function addEnvironment(s={buildings:[]}){
  const existing=scene.getObjectByName('environment');
  if(existing){scene.remove(existing);disposeObject(existing);}
  const g=new THREE.Group();g.name='environment';
  const buildings=s.buildings||[];
  const treeClearance=42;
  const waterClearance=72;
  const treeAllowed=(x,z)=>{
    if(Math.abs(z-riverY(x))<waterClearance)return false;
    for(const building of buildings){
      const hit=buildingHitbox(building,treeClearance);
      if(x>=hit.minX&&x<=hit.maxX&&z>=hit.minY&&z<=hit.maxY)return false;
    }
    return true;
  };
  const treeMat=mat('#586158',.94),trunkMat=mat('#57524a',.96),lampMat=mat('#343638',.95),roadsideMat=mat('#676c68',.95);
  const treeGeo=new THREE.ConeGeometry(5.5,18,8),trunkGeo=new THREE.CylinderGeometry(1.1,1.4,7,8),lampGeo=new THREE.CylinderGeometry(.45,.55,10,8),headGeo=new THREE.SphereGeometry(1.2,8,6);
  const bollardGeo=new THREE.CylinderGeometry(.55,.7,2.8,8);
  for(let x=-1200;x<=1200;x+=160)for(let z=-1200;z<=1200;z+=160){
    if(Math.abs(x)<300&&Math.abs(z)<300)continue;
    if(!treeAllowed(x,z))continue;
    const trunk=new THREE.Mesh(trunkGeo,trunkMat);trunk.position.set(x,3.5,z);trunk.castShadow=true;g.add(trunk);
    const tree=new THREE.Mesh(treeGeo,treeMat);tree.position.set(x,14,z);tree.castShadow=true;g.add(tree);
  }
  for(let x=-1000;x<=1000;x+=200)for(const z of[-WORLD_HALF_SIZE+60,WORLD_HALF_SIZE-60]){
    const pole=new THREE.Mesh(lampGeo,lampMat);pole.position.set(x,5,z);pole.castShadow=true;g.add(pole);
    const head=new THREE.Mesh(headGeo,mat('#c6c9c4',.4));head.position.set(x,10,z);g.add(head);
  }
  for(let x=-900;x<=900;x+=90)for(const z of[-WORLD_HALF_SIZE+42,WORLD_HALF_SIZE-42]){
    const b=new THREE.Mesh(bollardGeo,roadsideMat);b.position.set(x,1.4,z);b.castShadow=true;g.add(b);
  }
  scene.add(g);
}
function updateSelectionVisual(s){const selected=s.selected?.id||null;if(selected===lastBuildingSelection)return;for(const[id,g]of meshes){const scale=id===selected?1.035:1;g.scale.setScalar(scale);}lastBuildingSelection=selected;}
function updateRoadEditVisual(){if(roadEditGroup)roadEditGroup.visible=true;}
function updateRoadEndpointVisual(){if(roadEndpointGroup)roadEndpointGroup.visible=true;}
function render(s,W,H,canvas=document.querySelector('#game')){if(!canvas)return;if(!renderer)init(canvas);resize(W||innerWidth,H||innerHeight);if(!scene)return;ensureCamera();if(render.lastVersion!==s.renderVersion){updateWorld(s);render.lastVersion=s.renderVersion;}updateBuildingActivity(s);updateTrucks(s);updateSelectionVisual(s);updateRoadEditVisual(s);updateRoadEndpointVisual(s);syncCamera();renderer.render(scene,camera3d);}
function screenToWorld(x,y,w=viewport.width,h=viewport.height){ensureCamera();const ndc=new THREE.Vector2(x/w*2-1,-(y/h)*2+1),raycaster=new THREE.Raycaster();raycaster.setFromCamera(ndc,camera3d);const hit=new THREE.Vector3();return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit)?{x:hit.x,y:hit.z}:{x:0,y:0};}
function worldToScreen(x,y,w=viewport.width,h=viewport.height){ensureCamera();const p=new THREE.Vector3(x,0,y).project(camera3d);return{x:(p.x+1)*.5*w,y:(1-p.y)*.5*h};}
function panScreen(dx,dy,w=viewport.width,h=viewport.height){const a=screenToWorld(w*.5,h*.5,w,h),b=screenToWorld(w*.5-dx,h*.5-dy,w,h);desired.x+=b.x-a.x;desired.z+=b.y-a.y;updateCameraBounds();}
function zoomAtScreen(x,y,nextZoom,w=viewport.width,h=viewport.height){const before=screenToWorld(x,y,w,h);desired.distance=Math.max(180,Math.min(1250,620/Math.max(.55,Math.min(2.4,nextZoom))));ensureCamera();const after=screenToWorld(x,y,w,h);desired.x+=before.x-after.x;desired.z+=before.y-after.y;updateCameraBounds();}
function controlCamera(dx,dy,distanceDelta=0,yawDelta=0,pitchDelta=0){desired.x+=dx;desired.z+=dy;desired.distance=Math.max(180,Math.min(1250,desired.distance+distanceDelta));desired.yaw+=yawDelta;desired.pitch=Math.max(.35,Math.min(1.35,desired.pitch+pitchDelta));updateCameraBounds();}
function resetCamera(){desired={x:0,z:0,yaw:0,pitch:.82,distance:620};}
function focusCamera(x,y){desired.x=Number(x)||0;desired.z=Number(y)||0;updateCameraBounds();}
export{render,setPreview,setBuildingPreview,resize,controlCamera,screenToWorld,worldToScreen,panScreen,zoomAtScreen,resetCamera,focusCamera};