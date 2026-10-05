import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';

const sharedMaterials = new Set<THREE.Material>();
const boxGeometries = new Map<string, THREE.BoxGeometry>();
const cylinderGeometries = new Map<string, THREE.CylinderGeometry>();
const sharedGeometries = new WeakSet<THREE.BufferGeometry>();

export function material(color:string,roughness=.82,metalness=0):THREE.MeshStandardMaterial{
  const m=new THREE.MeshStandardMaterial({color,roughness,metalness});
  sharedMaterials.add(m);
  return m;
}
export function glass(color='#284b52'){return material(color,.18,.12);}
export function part(g:THREE.Object3D,geometry:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,ry=0,cast=true){
  const m=new THREE.Mesh(geometry,mat);
  m.position.set(x,y,z);m.rotation.y=ry;m.castShadow=cast;m.receiveShadow=true;g.add(m);return m;
}
export function cachedGeometry<T extends THREE.BufferGeometry>(cache:Map<string,T>,key:string,create:()=>T):T{
  let geometry=cache.get(key);
  if(!geometry){geometry=create();sharedGeometries.add(geometry);cache.set(key,geometry);}
  return geometry;
}
export function boxGeometry(w:number,h:number,d:number){
  const dims=[w,h,d].map(value=>Math.max(.1,Math.round(value*2)/2));
  return cachedGeometry(boxGeometries,dims.join(','),()=>new THREE.BoxGeometry(...dims as [number,number,number]));
}
export function box(g:THREE.Object3D,w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number,ry=0,cast=true){
  return part(g,boxGeometry(w,h,d),mat,x,y,z,ry,cast);
}
export function instancedBoxes(g:THREE.Object3D,w:number,h:number,d:number,mat:THREE.Material,positions:Array<{x:number;y:number;z:number;ry?:number}>,cast=false){
  if(!positions.length)return null;
  const mesh=new THREE.InstancedMesh(boxGeometry(w,h,d),mat,positions.length),matrix=new THREE.Matrix4();
  for(let i=0;i<positions.length;i++){
    const p=positions[i];
    matrix.compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,p.ry||0,0)),new THREE.Vector3(1,1,1));
    mesh.setMatrixAt(i,matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=cast;mesh.receiveShadow=true;g.add(mesh);return mesh;
}
export function cyl(g:THREE.Object3D,r:number,h:number,mat:THREE.Material,x:number,y:number,z:number,segments=16){
  const radius=Math.max(.1,Math.round(r*2)/2),height=Math.max(.1,Math.round(h*2)/2),key=`${radius},${height},${segments}`;
  return part(g,cachedGeometry(cylinderGeometries,key,()=>new THREE.CylinderGeometry(radius,radius,height,segments)),mat,x,y,z);
}
export function surface(g:THREE.Object3D,w:number,d:number,mat:THREE.Material,x:number,z:number,y=.12){box(g,w,.14,d,mat,x,y,z,0,false);}
export function foundation(g:THREE.Object3D,w:number,d:number,concrete:THREE.Material,dark:THREE.Material,x=0,z=0){
  box(g,w+8,.7,d+8,concrete,x,.45,z,false);box(g,w+3,1.1,d+3,dark,x,.95,z,false);
}
export function windowPanel(g:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,glassMat:THREE.Material,frameMat:THREE.Material,axis='front',direction=1,divisions=0){
  if(axis==='front'){
    box(g,w+1.6,h+1,.55,frameMat,x,y,z);box(g,w,h,.24,glassMat,x,y,z+direction*.32,0,false);
    for(const side of[-1,1])box(g,.55,h+.2,.7,frameMat,x+side*(w/2+.25),y,z);
    for(let i=1;i<divisions;i++)box(g,.32,h,.72,frameMat,x-w/2+w*i/divisions,y,z,0,false);
  }else{
    box(g,.55,h,w+1.6,frameMat,x,y,z);box(g,.24,h,w,glassMat,x+direction*.32,y,z,0,false);
    for(const side of[-1,1])box(g,.72,h,.55,frameMat,x,y,z+side*(w/2+.25));
    for(let i=1;i<divisions;i++)box(g,.72,h,.32,frameMat,x,y,z-w/2+w*i/divisions,0,false);
  }
}
export function frontWindows(g:THREE.Object3D,width:number,y:number,z:number,dir:number,count:number,glassMat:THREE.Material,frameMat:THREE.Material,windowW=8,windowH=6,centerX=0){
  for(let i=0;i<count;i++){const x=centerX-width/2+(i+.5)*width/count;windowPanel(g,x,y,z+dir*.42,windowW,windowH,glassMat,frameMat,'front',dir,2);}
}
export function sideWindows(g:THREE.Object3D,x:number,side:number,depth:number,y:number,glassMat:THREE.Material,frameMat:THREE.Material,count=5,centerZ=0){
  for(let i=0;i<count;i++){const z=centerZ-depth/2+(i+.5)*depth/count;windowPanel(g,x,y,z,7,5,glassMat,frameMat,'side',side,2);}
}
export function loadingDoor(g:THREE.Object3D,x:number,z:number,w:number,h:number,dir:number,metal:THREE.Material,dark:THREE.Material){
  const cy=h/2+1.5;
  box(g,w+3,h+3,.85,metal,x,cy,z+dir*.34);box(g,w,h,.32,dark,x,cy,z+dir*.82,0,false);
  for(const side of[-1,1]){box(g,1.1,h+1,.9,metal,x+side*(w/2+1),cy,z+dir*.8);cyl(g,.45,1.2,metal,x+side*(w/2+2.3),2,z+dir*2,8);}
  for(let i=1;i<4;i++)box(g,w-.7,.28,.42,metal,x,1.5+i*(h-3)/4,z+dir*1.02,0,false);
}
export function dockStrip(g:THREE.Object3D,x:number,z:number,w:number,dir:number,mat:THREE.Material){
  box(g,w,1.25,8,mat,x,1.08,z+dir*4,0,false);
  const bump=material('#b5bbb6',.75);
  for(let i=0;i<Math.max(3,Math.floor(w/16));i++){const px=x-w/2+8+i*(w-16)/Math.max(1,Math.floor(w/16)-1);box(g,.7,1.5,1.4,bump,px,1.8,z+dir*1.2,0,false);}
}
export function gate(g:THREE.Object3D,z:number,width:number,metal:THREE.Material){
  const dark=material('#303635',.98);
  for(const x of[-width/2,width/2]){box(g,2.2,8,1.4,metal,x,4,z);box(g,1,5,.5,dark,x,4,z-1);}
  box(g,width+2,.65,1.1,metal,0,8,z);
  for(const x of[-width/2-3,width/2+3])cyl(g,.55,3.4,material('#d8b95e',.56),x,1.7,z,10);
}
export function fence(g:THREE.Object3D,x1:number,z1:number,x2:number,z2:number,metal:THREE.Material){
  const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz),a=Math.atan2(dz,dx);if(len<1)return;
  for(const y of[.55,2.15,3.8])box(g,len,.3,.7,metal,(x1+x2)/2,y,(z1+z2)/2,a,false);
  const count=Math.ceil(len/18)+1,geometry=cachedGeometry(cylinderGeometries,'fence-post',()=>new THREE.CylinderGeometry(.35,.35,4,8)),posts=new THREE.InstancedMesh(geometry,metal,count),matrix=new THREE.Matrix4();
  for(let i=0;i<count;i++){const d=len*i/(count-1),x=x1+Math.cos(a)*d,z=z1+Math.sin(a)*d;posts.setMatrixAt(i,matrix.compose(new THREE.Vector3(x,2.1,z),new THREE.Quaternion(),new THREE.Vector3(1,1,1)));}
  posts.instanceMatrix.needsUpdate=true;posts.castShadow=true;posts.receiveShadow=true;g.add(posts);
}
export function parkedMarkings(g:THREE.Object3D,plan:{parkingWidth:number;parkingZ:number},paint:THREE.Material){
  const count=Math.max(4,Math.floor(plan.parkingWidth/12)),stall=plan.parkingWidth/count;
  for(const row of[-1,1]){
    const z=plan.parkingZ+row*8,lines:Array<{x:number;y:number;z:number}>=[];
    for(let i=0;i<=count;i++)lines.push({x:-plan.parkingWidth/2+i*stall,y:.28,z});
    instancedBoxes(g,.42,.08,15,paint,lines);
    box(g,plan.parkingWidth,.08,.42,paint,0,.28,z-7.5,0,false);box(g,plan.parkingWidth,.08,.42,paint,0,.28,z+7.5,0,false);
  }
}
export function palletStack(g:THREE.Object3D,x:number,z:number,wood:THREE.Material){
  box(g,6,.5,5,wood,x,.4,z,0,false);for(const ox of[-2,0,2])box(g,.65,.8,5,wood,x+ox,.95,z,0,false);
  box(g,5,2.3,4,material('#a98255',.94),x,2.5,z);box(g,5,2.3,4,material('#b58a5b',.94),x,4.9,z);
}
export function container(g:THREE.Object3D,x:number,z:number,metal:THREE.Material,accent:THREE.Material){
  box(g,28,9,11,metal,x,4.6,z);const ribs:Array<{x:number;y:number;z:number}>=[];
  for(let i=-5;i<=5;i++)ribs.push({x:x+i*2.4,y:4.6,z:z+5.7});instancedBoxes(g,.3,8.5,.3,accent,ribs);
  box(g,.4,8.5,.4,accent,x-13.8,4.6,z,0,false);box(g,.4,8.5,.4,accent,x+13.8,4.6,z,0,false);
}
export function dumpster(g:THREE.Object3D,x:number,z:number,metal:THREE.Material,dark:THREE.Material){
  box(g,10,4,6,metal,x,2.4,z);box(g,10.5,.6,6.5,dark,x,4.7,z);for(const side of[-1,1])cyl(g,.8,.65,dark,x+side*3.2,1,z-3,8);
}
export function forklift(g:THREE.Object3D,x:number,z:number,metal:THREE.Material,dark:THREE.Material,glassMat:THREE.Material){
  box(g,8,4,5,dark,x,3,z);box(g,4,4,4,metal,x-1,7,z);box(g,3,2.5,4,glassMat,x-1,7,z+2.1,0,false);
  for(const side of[-1,1]){const wheel=cyl(g,1.35,1,material('#252a29',.98),x,1.5,z+side*2.7,12);wheel.rotation.x=Math.PI/2;}
  for(const side of[-1,1])box(g,.5,7,.6,metal,x+4.7,4.7,z+side*1.6);box(g,3,.5,.6,metal,x+5.8,1,z,0,false);
}
export function siteLights(g:THREE.Object3D,plan:{site:{halfWidth:number};courtZ:number},metal:THREE.Material,lightMat:THREE.Material){
  for(const side of[-1,1]){const x=side*(plan.site.halfWidth-15),z=plan.courtZ;box(g,.8,17,.8,metal,x,8.5,z);box(g,3,.55,1.6,lightMat,x,17.2,z);}
}
export function materialsIn(group:THREE.Object3D):Set<THREE.Material>{
  const found=new Set<THREE.Material>();
  group.traverse((o:any)=>{for(const mat of(Array.isArray(o.material)?o.material:o.material?[o.material]:[]))found.add(mat);});
  return found;
}
export function disposeObjectGroup(group:THREE.Object3D){
  const materials=materialsIn(group);
  group.traverse((o:any)=>{if(o.geometry&&!sharedGeometries.has(o.geometry))o.geometry.dispose();});
  for(const mat of materials){mat.dispose();sharedMaterials.delete(mat);}
}
