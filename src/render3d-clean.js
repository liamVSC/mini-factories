import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import {riverY,WORLD_BOUNDS,WORLD_MARGIN} from './world.js';
import {buildingSitePlan} from './rendering/sitePlan.js';
import {offsetRoadPath,roadDashSegments,smoothRoadPath} from './rendering/roadGeometry.js';
import {truckRenderPose} from './rendering/truckMotion.js';
let renderer=null,scene=null,camera=null,root=null,previewGroup=null,buildingPreviewGroup=null;
let viewport={width:1,height:1};let target={x:0,z:0,yaw:0,pitch:.82,distance:620};let desired={...target};let worldKey='';
const buildingMeshes=new Map(),truckMeshes=new Map(),shared=new Set();
const boxGeometries=new Map(),cylinderGeometries=new Map(),sharedGeometries=new WeakSet();
function material(color,roughness=.82,metalness=0){const m=new THREE.MeshStandardMaterial({color,roughness,metalness});shared.add(m);return m;}
function glass(color='#284b52'){return material(color,.18,.12);}
function part(g,geometry,mat,x,y,z,ry=0,cast=true){const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.rotation.y=ry;m.castShadow=cast;m.receiveShadow=true;g.add(m);return m;}
function materialsIn(group){const found=new Set();group.traverse(o=>{for(const mat of(Array.isArray(o.material)?o.material:o.material?[o.material]:[]))found.add(mat);});return found;}
function disposeMaterials(materials){for(const mat of materials){mat.dispose();shared.delete(mat);}}
function cachedGeometry(cache,key,create){let geometry=cache.get(key);if(!geometry){geometry=create();sharedGeometries.add(geometry);cache.set(key,geometry);}return geometry;}
function boxGeometry(w,h,d){const dims=[w,h,d].map(value=>Math.max(.1,Math.round(value*2)/2));const key=dims.join(',');return cachedGeometry(boxGeometries,key,()=>new THREE.BoxGeometry(...dims));}
function box(g,w,h,d,mat,x,y,z,ry=0,cast=true){return part(g,boxGeometry(w,h,d),mat,x,y,z,ry,cast);}
function instancedBoxes(g,w,h,d,mat,positions,cast=false){if(!positions.length)return null;const mesh=new THREE.InstancedMesh(boxGeometry(w,h,d),mat,positions.length),matrix=new THREE.Matrix4();for(let i=0;i<positions.length;i++){const p=positions[i];matrix.compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,p.ry||0,0)),new THREE.Vector3(1,1,1));mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=cast;mesh.receiveShadow=true;g.add(mesh);return mesh;}
function cyl(g,r,h,mat,x,y,z,segments=16){const radius=Math.max(.1,Math.round(r*2)/2),height=Math.max(.1,Math.round(h*2)/2),key=`${radius},${height},${segments}`;return part(g,cachedGeometry(cylinderGeometries,key,()=>new THREE.CylinderGeometry(radius,radius,height,segments)),mat,x,y,z,0,true);}
function surface(g,w,d,mat,x,z,y=.12){box(g,w,.14,d,mat,x,y,z,0,false);}
function foundation(g,w,d,concrete,dark,x=0,z=0){box(g,w+8,.7,d+8,concrete,x,.45,z,false);box(g,w+3,1.1,d+3,dark,x,.95,z,false);}
function windowPanel(g,x,y,z,w,h,glassMat,frameMat,axis='front',direction=1,divisions=0){if(axis==='front'){box(g,w+1.6,h+1,.55,frameMat,x,y,z);box(g,w,h,.24,glassMat,x,y,z+direction*.32,0,false);for(const side of[-1,1])box(g,.55,h+.2,.7,frameMat,x+side*(w/2+.25),y,z);for(let i=1;i<divisions;i++)box(g,.32,h,.72,frameMat,x-w/2+w*i/divisions,y,z,0,false);}else{box(g,.55,h,w+1.6,frameMat,x,y,z);box(g,.24,h,w,glassMat,x+direction*.32,y,z,0,false);for(const side of[-1,1])box(g,.72,h,.55,frameMat,x,y,z+side*(w/2+.25));for(let i=1;i<divisions;i++)box(g,.72,h,.32,frameMat,x,y,z-w/2+w*i/divisions,0,false);}}
function frontWindows(g,width,y,z,dir,count,glassMat,frameMat,windowW=8,windowH=6,centerX=0){for(let i=0;i<count;i++){const x=centerX-width/2+(i+.5)*width/count;windowPanel(g,x,y,z+dir*.42,windowW,windowH,glassMat,frameMat,'front',dir,2);}}
function sideWindows(g,x,side,depth,y,glassMat,frameMat,count=5,centerZ=0){for(let i=0;i<count;i++){const z=centerZ-depth/2+(i+.5)*depth/count;windowPanel(g,x,y,z,7,5,glassMat,frameMat,'side',side,2);}}
function loadingDoor(g,x,z,w,h,dir,metal,dark){const cy=h/2+1.5;box(g,w+3,h+3,.85,metal,x,cy,z+dir*.34);box(g,w,h,.32,dark,x,cy,z+dir*.82,0,false);for(const side of[-1,1]){box(g,1.1,h+1,.9,metal,x+side*(w/2+1),cy,z+dir*.8);cyl(g,.45,1.2,metal,x+side*(w/2+2.3),2,z+dir*2,8);}for(let i=1;i<4;i++)box(g,w-.7,.28,.42,metal,x,1.5+i*(h-3)/4,z+dir*1.02,0,false);}
function dockStrip(g,x,z,w,dir,mat){box(g,w,1.25,8,mat,x,1.08,z+dir*4,0,false);const bump=material('#b5bbb6',.75);for(let i=0;i<Math.max(3,Math.floor(w/16));i++){const px=x-w/2+8+i*(w-16)/Math.max(1,Math.floor(w/16)-1);box(g,.7,1.5,1.4,bump,px,1.8,z+dir*1.2,0,false);}}
function gate(g,z,width,metal){const dark=material('#303635',.98);for(const x of[-width/2,width/2]){box(g,2.2,8,1.4,metal,x,4,z);box(g,1,5,.5,dark,x,4,z-1);}box(g,width+2,.65,1.1,metal,0,8,z);for(const x of[-width/2-3,width/2+3])cyl(g,.55,3.4,material('#d8b95e',.56),x,1.7,z,10);}
function fence(g,x1,z1,x2,z2,metal){const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz),a=Math.atan2(dz,dx);if(len<1)return;for(const y of[.55,2.15,3.8])box(g,len,.3,.7,metal,(x1+x2)/2,y,(z1+z2)/2,a,false);const count=Math.ceil(len/18)+1,geometry=cachedGeometry(cylinderGeometries,'fence-post',()=>new THREE.CylinderGeometry(.35,.35,4,8)),posts=new THREE.InstancedMesh(geometry,metal,count),matrix=new THREE.Matrix4();for(let i=0;i<count;i++){const d=len*i/(count-1),x=x1+Math.cos(a)*d,z=z1+Math.sin(a)*d;posts.setMatrixAt(i,matrix.compose(new THREE.Vector3(x,2.1,z),new THREE.Quaternion(),new THREE.Vector3(1,1,1)));}posts.instanceMatrix.needsUpdate=true;posts.castShadow=true;posts.receiveShadow=true;g.add(posts);}
function parkedMarkings(g,plan,paint){const count=Math.max(4,Math.floor(plan.parkingWidth/12)),stall=plan.parkingWidth/count;for(const row of[-1,1]){const z=plan.parkingZ+row*8,lines=[];for(let i=0;i<=count;i++)lines.push({x:-plan.parkingWidth/2+i*stall,y:.28,z});instancedBoxes(g,.42,.08,15,paint,lines);box(g,plan.parkingWidth,.08,.42,paint,0,.28,z-7.5,0,false);box(g,plan.parkingWidth,.08,.42,paint,0,.28,z+7.5,0,false);}}
function palletStack(g,x,z,wood){box(g,6,.5,5,wood,x,.4,z,0,false);for(const ox of[-2,0,2])box(g,.65,.8,5,wood,x+ox,.95,z,0,false);box(g,5,2.3,4,material('#a98255',.94),x,2.5,z);box(g,5,2.3,4,material('#b58a5b',.94),x,4.9,z);}
function container(g,x,z,metal,accent){box(g,28,9,11,metal,x,4.6,z);const ribs=[];for(let i=-5;i<=5;i++)ribs.push({x:x+i*2.4,y:4.6,z:z+5.7});instancedBoxes(g,.3,8.5,.3,accent,ribs);box(g,.4,8.5,.4,accent,x-13.8,4.6,z,0,false);box(g,.4,8.5,.4,accent,x+13.8,4.6,z,0,false);}
function dumpster(g,x,z,metal,dark){box(g,10,4,6,metal,x,2.4,z);box(g,10.5,.6,6.5,dark,x,4.7,z);for(const side of[-1,1])cyl(g,.8,.65,dark,x+side*3.2,1,z-3,8);}
function forklift(g,x,z,metal,dark,glassMat){box(g,8,4,5,dark,x,3,z);box(g,4,4,4,metal,x-1,7,z);box(g,3,2.5,4,glassMat,x-1,7,z+2.1,0,false);for(const side of[-1,1]){const wheel=cyl(g,1.35,1,material('#252a29',.98),x,1.5,z+side*2.7,12);wheel.rotation.x=Math.PI/2;}for(const side of[-1,1])box(g,.5,7,.6,metal,x+4.7,4.7,z+side*1.6);box(g,3,.5,.6,metal,x+5.8,1,z,0,false);}
function siteLights(g,plan,metal,lightMat){for(const side of[-1,1]){const x=side*(plan.site.halfWidth-15);const z=plan.courtZ;box(g,.8,17,.8,metal,x,8.5,z);box(g,3,.55,1.6,lightMat,x,17.2,z);}}
function yard(g,plan,metal,accent){
  const concrete=material('#818681',.96),asphalt=material('#4d5554',.98),darkPave=material('#3c4443',.99),gravel=material('#6d716c',1),paint=material('#dedfd8',.7),wood=material('#8a6847',.95),lightMat=material('#d8d0a8',.6,.08);
  const lotZ=plan.lotZ,backZ=plan.rearZ,gateZ=plan.gateZ,dir=plan.direction;
  surface(g,plan.lotWidth,plan.lotDepth,gravel,0,lotZ,.04);
  surface(g,plan.courtWidth,plan.courtDepth,asphalt,0,plan.courtZ,.14);
  for(const side of[-1,1])box(g,1,.3,plan.courtDepth,concrete,side*plan.courtWidth/2,.25,plan.courtZ,0,false);
  const parkingDepth=Math.max(28,plan.parkingDepth);
  surface(g,plan.parkingWidth,parkingDepth,darkPave,0,plan.parkingZ,.14);
  parkedMarkings(g,plan,paint);
  const serviceWidth=16,serviceDepth=Math.abs(gateZ-plan.parkingZ);
  surface(g,serviceWidth,serviceDepth,concrete,plan.serviceX,(gateZ+plan.parkingZ)/2,.15);
  const loadingWidth=plan.kind==='warehouse'?132:plan.kind==='factory'?88:74;
  surface(g,loadingWidth,18,concrete,0,plan.dockZ+dir*9,.18);
  const turnGeometry=cachedGeometry(cylinderGeometries,`${plan.turnRadius},0.2,32`,()=>new THREE.CylinderGeometry(plan.turnRadius,plan.turnRadius,.2,32));
  const turn=new THREE.Mesh(turnGeometry,darkPave);
  turn.position.set(plan.turnX,.27,plan.turnZ);turn.receiveShadow=true;g.add(turn);
  for(const side of[-1,1])fence(g,side*plan.fenceX,backZ,side*plan.fenceX,gateZ,metal);
  fence(g,-plan.fenceX,backZ,plan.fenceX,backZ,metal);
  fence(g,-plan.fenceX,gateZ,-plan.gateWidth/2,gateZ,metal);
  fence(g,plan.gateWidth/2,gateZ,plan.fenceX,gateZ,metal);
  gate(g,gateZ,plan.gateWidth,metal);
  box(g,plan.gateWidth-3,.08,1.2,paint,0,.27,gateZ-dir,0,false);
  siteLights(g,plan,metal,lightMat);
  for(const side of[-1,1]){const x=side*(plan.width/2+8),z=plan.dockZ+dir*12;box(g,10,.18,10,darkPave,x,.25,z,0,false);palletStack(g,x,z,wood);}
  const propZ=plan.parkingZ-dir*5;
  if(plan.kind==='factory'){
    const tankSide=-plan.serviceSide,x=tankSide*Math.min(plan.width/2+10,plan.site.halfWidth-19);
    surface(g,24,34,gravel,x,-dir*18,.16);
    for(const z of[-dir*10,-dir*26]){cyl(g,5.5,15,material('#828b85',.78,.16),x,8,z,20);cyl(g,5.7,.8,metal,x,15.6,z,20);for(const side of[-1,1])box(g,.8,5,.8,metal,x+side*4.1,2.5,z);}
    const pipe=cyl(g,.8,30,material('#88928c',.7,.25),x+plan.serviceSide*8,5,-dir*18,12);pipe.rotation.z=Math.PI/2;
    container(g,plan.serviceSide*(plan.site.halfWidth-20),propZ,metal,accent);
  }else if(plan.kind==='warehouse'){
    container(g,-plan.serviceSide*(plan.site.halfWidth-20),propZ,metal,accent);
    container(g,-plan.serviceSide*(plan.site.halfWidth-20),propZ-dir*14,material('#727b77',.83,.12),paint);
  }else{
    for(let i=-2;i<=2;i++){const x=i*11;box(g,8,.08,17,paint,x,.25,propZ,0,false);}
    box(g,5,8,2,material('#638071',.9),plan.serviceSide*(plan.width/2+9),4,propZ,0,false);
  }
  dumpster(g,-plan.serviceSide*(plan.site.halfWidth-19),plan.parkingZ+dir*14,metal,darkPave);
  forklift(g,plan.turnX+plan.serviceSide*21,plan.turnZ-dir*6,metal,darkPave,glass('#4d6e72'));
}
function facadeFrame(g,w,d,h,dir,metal,accent,centerX=0,centerZ=0){
  const front=centerZ+dir*d/2,bodyTop=1.5+h;
  for(const x of[centerX-w/2+2,centerX+w/2-2])box(g,1.5,h-2,1.2,metal,x,1.5+(h-2)/2,front+dir*.3);
  box(g,w,.8,1.4,accent,centerX,bodyTop-3,front+dir*.45);
  for(const side of[-1,1])for(const z of[-d/2+3,d/2-3])box(g,1.1,h-2,1.4,metal,centerX+side*(w/2-1.5),1.5+(h-2)/2,centerZ+z);
}
function roofRibs(g,w,d,y,metal,count=5){for(let i=0;i<count;i++){const x=-w/2+6+i*(w-12)/Math.max(1,count-1);box(g,1.6,.9,d-10,metal,x,y,0);}}
function factoryModel(b,plan){
  const g=new THREE.Group(),{width:w,depth:d,height:h,direction:dir,variant}=plan;
  const body=material('#747d79',.9),dark=material('#343b39',.97),metal=material('#59635f',.8,.18),accent=material(b.color||'#789a86',.55,.16),gl=glass(),roofMat=material('#414947',.96),foundationMat=material('#939891',.95);
  const front=dir*d/2,bodyTop=1.5+h,roofY=bodyTop+.55;
  yard(g,plan,metal,accent);foundation(g,w,d,foundationMat,dark);box(g,w,h,d,body,0,1.5+h/2,0);facadeFrame(g,w,d,h,dir,metal,accent);
  for(const x of[-w*.31,0,w*.31])box(g,2.5,h-5,.8,metal,x,1.5+(h-5)/2,front+dir*.55);
  box(g,w*.42,1.2,.9,accent,0,10,front+dir*.65);
  const officeX=w*.31,officeW=w*.31,officeH=24,officeD=32,officeZ=front-dir*officeD*.38;
  box(g,officeW,officeH,officeD,material('#626e69',.86),officeX,1.5+officeH/2+4,officeZ);
  frontWindows(g,officeW-5,15,front+dir*.8,dir,4,gl,dark,5,5,officeX);
  frontWindows(g,w*.48,25,front+dir*.55,dir,5,gl,dark,7,5);
  loadingDoor(g,plan.dockX,front,29,21,dir,metal,dark);
  loadingDoor(g,-w*.33,front,18,15,dir,metal,dark);
  loadingDoor(g,w*.33,-front,18,14,-dir,metal,dark);
  dockStrip(g,plan.dockX,front,74,dir,metal);
  box(g,80,2,11,roofMat,plan.dockX,bodyTop+5,front+dir*7);
  for(const x of[plan.dockX-34,plan.dockX+34])box(g,1.3,5,1.3,metal,x,bodyTop+2.5,front+dir*8);
  box(g,w+4,1.5,d+4,roofMat,0,roofY,0);roofRibs(g,w,d,roofY+1.1,metal,6);
  for(const x of[-w*.25,0,w*.25]){box(g,14,.65,d*.62,gl,x,roofY+1.7,0,0,false);box(g,16,.7,1.2,metal,x,roofY+1.55,-d*.32);box(g,16,.7,1.2,metal,x,roofY+1.55,d*.32);}
  const processX=w*[-.22,-.16,-.26,-.12][variant],processZ=d*[-.15,-.2,-.1,-.18][variant],processH=h+18;
  box(g,w*.28,processH,d*.42,dark,processX,1.5+processH/2,processZ);
  box(g,w*.28+2,1.2,d*.42+2,metal,processX,1.5+processH+.6,processZ);
  box(g,w*.22,8,d*.2,body,processX,bodyTop+processH*.42,processZ-d*.31);
  for(let i=0;i<3;i++){const z=-d*.18+i*11;box(g,1,7,.8,accent,processX+w*.14,bodyTop+9,z);}
  for(const x of[-w*.36,w*.36]){const z=-dir*d*.22;cyl(g,5.2,24,material('#87918a',.78,.18),x,13,z,20);cyl(g,5.8,1.4,metal,x,25.4,z,20);for(const side of[-1,1])box(g,.8,10,.8,metal,x+side*4.1,5,z);}
  for(let i=0;i<3;i++){const x=-w*.08+i*18;box(g,16,3,10,dark,x,bodyTop+4,-d*.02);box(g,12,1,7,metal,x,bodyTop+6,-d*.02);}
  const sidePipe=cyl(g,.75,d*.72,material('#9b9e8f',.62,.24),w/2+1,14,0,12);sidePipe.rotation.x=Math.PI/2;
  return g;
}
function warehouseModel(b,plan){
  const g=new THREE.Group(),{width:w,depth:d,height:h,direction:dir,variant}=plan;
  const body=material('#8a928e',.93),dark=material('#3b4240',.98),metal=material('#626a66',.82,.12),accent=material(b.color||'#b7a25f',.56,.14),gl=glass(),roofMat=material('#4c5350',.96),foundationMat=material('#9a9d96',.95);
  const front=dir*d/2,bodyTop=1.5+h,roofY=bodyTop+.6;
  yard(g,plan,metal,accent);foundation(g,w,d,foundationMat,dark);box(g,w,h,d,body,0,1.5+h/2,0);facadeFrame(g,w,d,h,dir,metal,accent);
  box(g,w*.28,21,d*.28,dark,-w*.28,14,front-dir*d*.18);
  frontWindows(g,w*.28-4,14,front+dir*.6,dir,4,gl,dark,5,5,-w*.28);
  frontWindows(g,w*.22,27,front+dir*.48,dir,4,gl,dark,6,4);
  const doorXs=[-w*.29,0,w*.29],doorWidths=[22,30,22];
  for(let i=0;i<doorXs.length;i++)loadingDoor(g,doorXs[i],front,doorWidths[i],i===1?21:17,dir,metal,dark);
  dockStrip(g,0,front,132,dir,metal);
  box(g,132,2,12,roofMat,0,bodyTop+5,front+dir*7);
  for(const x of[-61,-22,22,61])box(g,1.3,5,1.3,metal,x,bodyTop+2.5,front+dir*8);
  box(g,w+4,2,d+4,roofMat,0,roofY,0);roofRibs(g,w,d,roofY+1.4,metal,7);
  const roofWingX=(variant%2?1:-1)*w*.07;
  box(g,w*.52,9,d*.74,body,roofWingX,bodyTop+5.5,-dir*d*.03);
  box(g,w*.52+3,1.3,d*.74+3,metal,roofWingX,bodyTop+10.6,-dir*d*.03);
  box(g,w*.18,15,d*.42,dark,-roofWingX*4.8,bodyTop+8,0);
  for(const x of[-w*.3,-w*.05,w*.2]){box(g,15,3.2,9,dark,x,bodyTop+4,0);box(g,11,1.2,6,metal,x,bodyTop+6,0);}
  const officeZ=-dir*d*.3,officeSide=variant%2?1:-1,officeX=officeSide*(w/2+11);
  box(g,26,20,30,material('#6d7772',.86),officeX,12,officeZ);
  sideWindows(g,officeSide*(w/2+24),officeSide,30,13,gl,dark,4,officeZ);
  for(const side of[-1,1]){const vent=box(g,15,3,8,metal,side*w*.28,bodyTop+3,dir*d*.14);vent.rotation.z=-.16;}
  return g;
}
function shopModel(b,plan){
  const g=new THREE.Group(),{width:w,depth:d,height:h,direction:dir,variant}=plan;
  const body=material('#7c8581',.88),dark=material('#303735',.97),metal=material('#68716d',.78,.14),accent=material(b.color||'#c39a45',.5,.16),gl=glass('#315c63'),roofMat=material('#454c49',.94),foundationMat=material('#92958e',.95);
  const mainW=w*.85,mainD=d-4,mainX=-w*.04,mainZ=plan.dockZ-dir*mainD/2;
  const front=mainZ+dir*mainD/2,retailFront=mainZ-dir*mainD/2,bodyTop=1.5+h,roofY=bodyTop+1.4;
  yard(g,plan,metal,accent);foundation(g,mainW,mainD,foundationMat,dark,mainX,mainZ);
  box(g,mainW,h,mainD,body,mainX,1.5+h/2,mainZ);
  box(g,w*.29,h*.7,d*.48,dark,w*.34,1.5+h*.35,-dir*d*.07);
  facadeFrame(g,mainW,mainD,h,dir,metal,accent,mainX,mainZ);
  box(g,mainW,1.3,.9,accent,mainX,10,retailFront-dir*.55);
  frontWindows(g,mainW*.72,15,retailFront-dir*.58,-dir,7,gl,dark,9,7,mainX);
  const entranceX=mainX-mainW*.2;
  box(g,34,1.4,12,accent,entranceX,bodyTop-5,retailFront-dir*8);
  for(const x of[entranceX-15,entranceX+15])box(g,1,6,1,metal,x,bodyTop-8,retailFront-dir*12);
  box(g,5,10,.4,gl,entranceX,7,retailFront-dir*.78,0,false);
  loadingDoor(g,plan.dockX,front,20,15,dir,metal,dark);
  dockStrip(g,plan.dockX,plan.dockZ,68,dir,metal);
  box(g,70,1.8,10,roofMat,plan.dockX,bodyTop+4,front+dir*6);
  box(g,w*.23,15,d*.45,dark,w*.34,bodyTop+7,dir*d*.03);
  box(g,w*.51,3,d*.35,metal,mainX,roofY,mainZ);
  for(const side of[-1,1])sideWindows(g,mainX+side*mainW/2+side*.42,side,mainD,13,gl,dark,4,mainZ);
  for(const x of[-w*.28,w*.18])cyl(g,1.7,10,metal,x,bodyTop+6,0,14);
  return g;
}
function makeBuilding(b){const plan=buildingSitePlan(b);if(!plan)return new THREE.Group();if(plan.kind==='factory')return factoryModel(b,plan);if(plan.kind==='warehouse')return warehouseModel(b,plan);return shopModel(b,plan);}
function buildingKey(s){return JSON.stringify((s.buildings||[]).map(b=>[b.id,b.kind,b.type,b.x,b.y,b.color]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));}
function roadKey(s){return JSON.stringify((s.roads||[]).map(r=>[r.id,r.bridge,r.points]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));}
function rounded(points){const out=[];for(const p of points||[]){if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))continue;if(!out.length||Math.hypot(p.x-out.at(-1).x,p.y-out.at(-1).y)>.6)out.push({x:p.x,y:p.y});}return out;}
function ribbon(points,width,y,mat,thickness=.12){
 if(points.length<2)return null;
 const verts=[],idx=[],half=width/2;
 for(let i=0;i<points.length;i++){
  const p=points[i],previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
  const inX=p.x-previous.x,inZ=p.y-previous.y,outX=next.x-p.x,outZ=next.y-p.y;
  const inLength=Math.hypot(inX,inZ),outLength=Math.hypot(outX,outZ);
  let nx,nz,offset=half;
  if(i===0||inLength<.001){const l=outLength||1;nx=-outZ/l;nz=outX/l;}
  else if(i===points.length-1||outLength<.001){const l=inLength||1;nx=-inZ/l;nz=inX/l;}
  else{
   const inNX=-inZ/inLength,inNZ=inX/inLength,outNX=-outZ/outLength,outNZ=outX/outLength;
   const sumX=inNX+outNX,sumZ=inNZ+outNZ,sumLength=Math.hypot(sumX,sumZ);
   if(sumLength<.001){nx=outNX;nz=outNZ;}
   else{
    nx=sumX/sumLength;nz=sumZ/sumLength;
    const projection=nx*outNX+nz*outNZ;
    offset=Math.min(half/Math.max(.25,projection),half*2.5);
   }
  }
  verts.push(p.x+nx*offset,y,p.y+nz*offset,p.x-nx*offset,y,p.y-nz*offset);
  if(i){
   const q=(i-1)*2,r=i*2;
   idx.push(q,r,q+1,r,r+1,q+1);
  }
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
 geo.setIndex(idx);geo.computeVertexNormals();
 const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;m.renderOrder=2;return m;
}
function riverBridgeSections(points){
 const sections=[];let active=null;
 const point=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 const inside=p=>Math.abs(p.y-riverY(p.x))<=45;
 const crossing=(a,b,aInside)=>{
  let lo=0,hi=1;
  for(let i=0;i<16;i++){const mid=(lo+hi)/2;if(inside(point(a,b,mid))===aInside)lo=mid;else hi=mid;}
  return point(a,b,(lo+hi)/2);
 };
 const append=(path,p)=>{if(!path.length||Math.hypot(path.at(-1).x-p.x,path.at(-1).y-p.y)>.5)path.push(p);};
 for(let segment=1;segment<points.length;segment++){
  const a=points[segment-1],b=points[segment],length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(length/8));
  let previous=point(a,b,0),previousInside=inside(previous);
  if(previousInside&&!active){active=[previous];sections.push(active);}
  for(let step=1;step<=steps;step++){
   const current=point(a,b,step/steps),currentInside=inside(current);
   if(currentInside){
    if(!active){active=[crossing(previous,current,false)];sections.push(active);}
    append(active,current);
   }else if(active){
    append(active,crossing(previous,current,true));
    active=null;
   }
   previous=current;previousInside=currentInside;
  }
 }
 return sections.filter(section=>section.length>=2);
}
function roadMesh(r){
 const g=new THREE.Group(),source=rounded(r.points);if(source.length<2)return g;
 const p=rounded(smoothRoadPath(source,18));
 const asphalt=material('#353b3c',.92),shoulder=material('#6b7370',.98),line=material('#e9ebe5',.7),curb=material('#a0a6a1',.75);
 const sh=ribbon(p,38,.58,shoulder);if(sh)g.add(sh);
 const surf=ribbon(p,30,.69,asphalt,.14);if(surf)g.add(surf);
 for(const side of[-1,1]){const c=ribbon(offsetRoadPath(p,side*19.5),.9,.82,curb,.16);if(c)g.add(c);}
 for(const dash of roadDashSegments(p,20,18)){const m=ribbon(dash,1.05,.84,line,.08);if(m)g.add(m);}
 const bridgeSections=riverBridgeSections(p);
 if(bridgeSections.length){
  const deck=material('#5a6260',.9,.08),rail=material('#858c85',.75,.15),support=material('#414846',.92,.12);
  for(const section of bridgeSections){
   const bridgeDeck=ribbon(section,34,.91,deck,.2);if(bridgeDeck)g.add(bridgeDeck);
   for(const side of[-1,1]){
    const edge=offsetRoadPath(section,side*17);
    for(let i=1;i<edge.length;i++){
     const a=edge[i-1],b=edge[i],dx=b.x-a.x,dz=b.y-a.y,len=Math.hypot(dx,dz)||1;
     box(g,len,.7,.8,rail,(a.x+b.x)/2,2.55,(a.y+b.y)/2,-Math.atan2(dz,dx));
    }
    for(let i=0;i<edge.length;i++){
     const p=edge[i];
     box(g,.7,2.5,.7,support,p.x,1.85,p.y);
    }
   }
  }
 }
 return g;
}
function truckMesh(){const g=new THREE.Group(),cab=material('#5d6764',.82,.12),trailer=material('#aeb5b1',.9),dark=material('#242a2a',.98),glassMat=glass('#3b5c62'),metal=material('#6c7570',.75,.18);box(g,7,6.8,7,cab,4,4.3,0);box(g,3,3.2,6.5,glassMat,7.1,5.3,0);box(g,12,7.8,7.6,trailer,-4.5,4.7,0);box(g,12.2,.6,7.9,metal,-4.5,8.8,0);for(const x of[-7,-2.5,3.8,6.4])for(const z of[-3.85,3.85]){const w=cyl(g,1.55,1.15,dark,x,1.65,z,16);w.rotation.x=Math.PI/2;}box(g,.5,1.2,.6,material('#e6d7aa',.5),7.7,4,-3.1);box(g,.5,1.2,.6,material('#e6d7aa',.5),7.7,4,3.1);return g;}
function routePoint(points,t){if(!Array.isArray(points)||points.length<2)return null;let total=0;for(let i=1;i<points.length;i++)total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);if(total<.01)return points[0];let want=Math.max(0,Math.min(1,t))*total,run=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(run+len>=want){const q=(want-run)/len;return{x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q};}run+=len;}return points.at(-1);}
function rebuildWorld(s){for(const g of [...root.children]){root.remove(g);const materials=materialsIn(g);g.traverse(o=>{if(o.geometry&&!sharedGeometries.has(o.geometry))o.geometry.dispose();});disposeMaterials(materials);}buildingMeshes.clear();truckMeshes.clear();const roads=new THREE.Group();for(const r of s.roads||[]){const g=roadMesh(r);g.userData.road=r;roads.add(g);}root.add(roads);for(const b of s.buildings||[]){const model=makeBuilding(b),anchor=new THREE.Group();anchor.name='building-anchor-'+b.id;anchor.position.set(Number(b.x)||0,0,Number(b.y)||0);anchor.add(model);root.add(anchor);buildingMeshes.set(b.id,model);}for(const t of s.trucks||[]){const m=truckMesh();root.add(m);truckMeshes.set(t.id,m);}worldKey=buildingKey(s)+'|'+roadKey(s);}
function updateTrucks(s){for(const [id,m] of truckMeshes){const t=(s.trucks||[]).find(x=>x.id===id);if(!t||t.dead){m.visible=false;continue;}const pose=truckRenderPose(t);if(!pose){m.visible=false;continue;}m.visible=true;m.position.set(pose.x,1,pose.y);m.rotation.y=pose.yaw;}}
function updateSelection(s){for(const [id,m] of buildingMeshes){const selected=(s.buildings||[]).some(b=>b.id===id&&s.selected===b);m.traverse(o=>{if(!o.isMesh||!o.material?.emissive)return;o.material.emissive.setHex(selected?0x294634:0);o.material.emissiveIntensity=selected?.32:0;});}}
function init(canvas){if(renderer)return;renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',stencil:false,depth:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<700?1.5:2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;scene=new THREE.Scene();scene.background=new THREE.Color('#b9c6b0');scene.fog=new THREE.Fog('#b9c6b0',900,2600);root=new THREE.Group();scene.add(root);previewGroup=new THREE.Group();scene.add(previewGroup);buildingPreviewGroup=new THREE.Group();scene.add(buildingPreviewGroup);scene.add(new THREE.HemisphereLight('#f5f8f4','#536057',1.55));const sun=new THREE.DirectionalLight('#fff5dc',2);sun.position.set(-300,480,260);sun.castShadow=true;sun.shadow.mapSize.set(innerWidth<700?1024:2048,innerWidth<700?1024:2048);sun.shadow.camera.near=10;sun.shadow.camera.far=1600;sun.shadow.camera.left=-600;sun.shadow.camera.right=600;sun.shadow.camera.top=600;sun.shadow.camera.bottom=-600;scene.add(sun);const ground=material('#708762',1);box(scene,2600,2,2600,ground,0,-7,0,0,false);const terrain=material('#78996a',1);box(scene,2600,.12,2600,terrain,0,.02,0,0,false);const river=material('#65929d',.7,.05);for(let x=-1300;x<1300;x+=44){const x2=Math.min(1300,x+52),mid=(x+x2)/2,dy=riverY(x2)-riverY(x),ang=Math.atan2(dy,x2-x);box(scene,Math.hypot(x2-x,dy)+12,.65,82,river,mid,.05,(riverY(x)+riverY(x2))/2,-ang,false);}resize(viewport.width,viewport.height);}
function resize(w,h){viewport.width=Math.max(1,w||innerWidth);viewport.height=Math.max(1,h||innerHeight);renderer?.setSize(viewport.width,viewport.height,false);if(camera){camera.aspect=viewport.width/viewport.height;camera.updateProjectionMatrix();}}
function ensureCamera(){if(!camera)camera=new THREE.PerspectiveCamera(46,viewport.width/viewport.height,2,3400);const p=Math.max(.35,Math.min(1.35,target.pitch)),h=Math.cos(p)*target.distance;camera.position.set(target.x+Math.sin(target.yaw)*h,Math.sin(p)*target.distance,target.z+Math.cos(target.yaw)*h);camera.lookAt(target.x,0,target.z);}
function bounds(){const l=(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX)/2-WORLD_MARGIN;desired.x=Math.max(-l,Math.min(l,desired.x));desired.z=Math.max(-l,Math.min(l,desired.z));}
function controlCamera(dx,dy,dd=0,dyaw=0,dpitch=0){desired.x+=dx;desired.z+=dy;desired.distance=Math.max(180,Math.min(1250,desired.distance+dd));desired.yaw+=dyaw;desired.pitch=Math.max(.35,Math.min(1.35,desired.pitch+dpitch));bounds();}
function screenToWorld(x,y,w=viewport.width,h=viewport.height){ensureCamera();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/w*2-1,-y/h*2+1),camera);const hit=new THREE.Vector3();return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit)?{x:hit.x,y:hit.z}:{x:0,y:0};}
function worldToScreen(x,y,w=viewport.width,h=viewport.height){ensureCamera();const point=new THREE.Vector3(x,0,y).project(camera);return{x:(point.x+1)*.5*w,y:(1-point.y)*.5*h};}
function panScreen(dx,dy,w=viewport.width,h=viewport.height){const a=screenToWorld(w/2,h/2,w,h),b=screenToWorld(w/2-dx,h/2-dy,w,h);desired.x+=b.x-a.x;desired.z+=b.y-a.y;bounds();}
function zoomAtScreen(x,y,z,w=viewport.width,h=viewport.height){const before=screenToWorld(x,y,w,h);desired.distance=Math.max(180,Math.min(1250,620/Math.max(.55,Math.min(2.4,z))));ensureCamera();const after=screenToWorld(x,y,w,h);desired.x+=before.x-after.x;desired.z+=before.y-after.y;bounds();}
function resetCamera(){desired={x:0,z:0,yaw:0,pitch:.82,distance:620};}
function focusCamera(x,y){desired.x=Number(x)||0;desired.z=Number(y)||0;bounds();}
function clearPreview(g){while(g.children.length){const c=g.children.pop(),materials=materialsIn(c);c.traverse(o=>{if(o.geometry&&!sharedGeometries.has(o.geometry))o.geometry.dispose();});disposeMaterials(materials);}}
function setPreview(path,start,end,blocked=false){if(!previewGroup)return;clearPreview(previewGroup);if(!Array.isArray(path)||path.length<2)return;const m=material(blocked?'#c65a54':'#e1b84b',.7);const mesh=ribbon(rounded(path),18,.95,m,.12);if(mesh)previewGroup.add(mesh);}
function setBuildingPreview(type,point,blocked=false){if(!buildingPreviewGroup)return;clearPreview(buildingPreviewGroup);if(!point||!type)return;const plan=buildingSitePlan({...type,id:'building-preview',x:point.x,y:point.y});if(!plan)return;const m=material(blocked?'#c65a54':'#63a987',.65);m.transparent=true;m.opacity=.32;const mesh=new THREE.Mesh(new THREE.BoxGeometry(plan.width,10,plan.depth),m);mesh.position.set(point.x,5,point.y);buildingPreviewGroup.add(mesh);}
function render(s,W,H,canvas=document.querySelector('#game')){if(!canvas)return;if(!renderer)init(canvas);resize(W,H);const k=buildingKey(s)+'|'+roadKey(s);if(k!==worldKey)rebuildWorld(s);updateTrucks(s);updateSelection(s);target.x+=(desired.x-target.x)*.16;target.z+=(desired.z-target.z)*.16;target.yaw+=(desired.yaw-target.yaw)*.16;target.pitch+=(desired.pitch-target.pitch)*.16;target.distance+=(desired.distance-target.distance)*.16;ensureCamera();renderer.render(scene,camera);}
export{render,setPreview,setBuildingPreview,resize,controlCamera,screenToWorld,worldToScreen,panScreen,zoomAtScreen,resetCamera,focusCamera};
