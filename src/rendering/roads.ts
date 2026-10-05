import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import {riverY} from '../world.js';
import {buildingRoadAttachment} from '../world/buildings/connections.js';
import {box,material} from './three.js';

export type RoadMeshPart={kind:'road'|'transition'|'bridge';points:Array<{x:number;y:number}>};

export function rounded(points:any[]):Array<{x:number;y:number}>{
  const out:Array<{x:number;y:number}>=[];
  for(const p of points||[])if(Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&(!out.length||Math.hypot(p.x-out.at(-1)!.x,p.y-out.at(-1)!.y)>.6))out.push({x:p.x,y:p.y});
  return out;
}
export function smoothRoadPath(points:any[]){const src=rounded(points);if(src.length<3)return src;const out=[src[0]];
  for(let i=1;i<src.length-1;i++){const a=src[i-1],p=src[i],b=src[i+1],inDx=p.x-a.x,inDy=p.y-a.y,outDx=b.x-p.x,outDy=b.y-p.y,inLen=Math.hypot(inDx,inDy),outLen=Math.hypot(outDx,outDy);
    if(inLen<.01||outLen<.01){out.push(p);continue;}const dot=Math.max(-1,Math.min(1,(inDx*outDx+inDy*outDy)/(inLen*outLen))),angle=Math.acos(dot);
    if(angle<.12||Math.abs(Math.PI-angle)<.08){out.push(p);continue;}const radius=Math.min(30,inLen*.28,outLen*.28),entry={x:p.x-inDx/inLen*radius,y:p.y-inDy/inLen*radius},exit={x:p.x+outDx/outLen*radius,y:p.y+outDy/outLen*radius};
    if(Math.hypot(entry.x-out.at(-1)!.x,entry.y-out.at(-1)!.y)>.1)out.push(entry);
    for(let k=1;k<6;k++){const t=k/6,u=1-t;out.push({x:u*u*entry.x+2*u*t*p.x+t*t*exit.x,y:u*u*entry.y+2*u*t*p.y+t*t*exit.y});}out.push(exit);
  }
  const last=src.at(-1),tail=out.at(-1);if(last&&tail&&Math.hypot(last.x-tail.x,last.y-tail.y)>.1)out.push(last);return out;
}
export function offsetPolyline(points:Array<{x:number;y:number}>,halfWidth:number){
  const out:Array<{x:number;y:number}>=[],sign=halfWidth<0?-1:1,hw=Math.abs(halfWidth);if(hw<.001)return points.map(p=>({...p}));
  for(let i=0;i<points.length;i++){const p=points[i];let nx=0,nz=0,scale=1;
    if(i===0){const dx=points[1].x-p.x,dz=points[1].y-p.y,len=Math.hypot(dx,dz)||1;nx=-dz/len;nz=dx/len;}
    else if(i===points.length-1){const dx=p.x-points[i-1].x,dz=p.y-points[i-1].y,len=Math.hypot(dx,dz)||1;nx=-dz/len;nz=dx/len;}
    else{const a=points[i-1],b=points[i+1],adx=p.x-a.x,adz=p.y-a.y,bdx=b.x-p.x,bdz=b.y-p.y,alen=Math.hypot(adx,adz)||1,blen=Math.hypot(bdx,bdz)||1,inNx=-adz/alen,inNz=adx/alen,outNx=-bdz/blen,outNz=bdx/blen,mx=inNx+outNx,mz=inNz+outNz,mlen=Math.hypot(mx,mz);
      if(mlen<.001){nx=inNx;nz=inNz;}else{nx=mx/mlen;nz=mz/mlen;const denom=nx*inNx+nz*inNz,miterScale=1/Math.max(.55,Math.abs(denom));if(miterScale<=1.12)scale=miterScale;else{nx=inNx;nz=inNz;}}
    }
    out.push({x:p.x+nx*hw*scale*sign,y:p.y+nz*hw*scale*sign});
  }return out;
}
export function ribbon(points:Array<{x:number;y:number}>,width:number,y:number,mat:THREE.Material){
  if(points.length<2)return null;const clean=[points[0]];for(let i=1;i<points.length;i++)if(Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y)>=.5)clean.push(points[i]);if(clean.length<2)return null;
  const left=offsetPolyline(clean,width/2),right=offsetPolyline(clean,-width/2),verts:number[]=[],idx:number[]=[];
  for(let i=0;i<clean.length;i++){verts.push(left[i].x,y,left[i].y,right[i].x,y,right[i].y);if(i){const q=(i-1)*2,r=i*2;idx.push(q,q+1,r,r,r+1,q+1);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(idx);geo.computeVertexNormals();const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;m.renderOrder=2;return m;
}
function roundDisc(x:number,z:number,radius:number,y:number,mat:THREE.Material,segments=20){const g=new THREE.Mesh(new THREE.CircleGeometry(radius,segments),mat);g.rotation.x=-Math.PI/2;g.position.set(x,y,z);g.receiveShadow=true;g.renderOrder=2.05;return g;}
function roadCaps(points:Array<{x:number;y:number}>,roadWidth:number,shoulderWidth:number,y:number,shoulderY:number,asphalt:THREE.Material,shoulder:THREE.Material){
  if(points.length<2)return[];const out:THREE.Object3D[]=[];for(const p of[points[0],points.at(-1)!]){out.push(roundDisc(p.x,p.y,shoulderWidth/2,shoulderY,shoulder,20),roundDisc(p.x,p.y,roadWidth/2,y,asphalt,20));}return out;
}
function centerRoadMarkings(points:Array<{x:number;y:number}>,y:number,mat:THREE.Material){
  const out:THREE.Object3D[]=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],len=Math.hypot(b.x-a.x,b.y-a.y),dash=14,gap=10,count=Math.max(1,Math.floor(len/(dash+gap)));
    for(let n=0;n<count;n++){const s=n*(dash+gap),e=Math.min(len,s+dash);if(e<=s)continue;const t0=s/len,t1=e/len,p0={x:a.x+(b.x-a.x)*t0,y:a.y+(b.y-a.y)*t0},p1={x:a.x+(b.x-a.x)*t1,y:a.y+(b.y-a.y)*t1},m=ribbon([p0,p1],.8,y,mat);if(m)out.push(m);}
  }return out;
}
function edgeRoadMarkings(points:Array<{x:number;y:number}>,y:number,mat:THREE.Material){const out:THREE.Object3D[]=[];for(const lateral of[-14,14]){const m=ribbon(offsetPolyline(points,lateral),1.15,y,mat);if(m)out.push(m);}return out;}
function riverCrossingPoint(a:{x:number;y:number},b:{x:number;y:number}){const fa=a.y-riverY(a.x),fb=b.y-riverY(b.x);if(fa===0)return a;if(fb===0)return b;if(fa*fb>0)return null;let lo=0,hi=1;for(let i=0;i<24;i++){const t=(lo+hi)/2,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,f=y-riverY(x);if(f===0){lo=hi=t;break;}if(f*fa>0)lo=t;else hi=t;}const t=(lo+hi)/2;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function routeLength(points:Array<{x:number;y:number}>){let total=0;for(let i=1;i<points.length;i++)total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);return total;}
function pointAtDistance(points:Array<{x:number;y:number}>,d:number){if(points.length<2)return points[0];let remain=Math.max(0,d);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(remain<=len){const t=len<.001?0:remain/len;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}remain-=len;}return points.at(-1)!;}
function sliceRoute(points:Array<{x:number;y:number}>,start:number,end:number){const total=routeLength(points),a=Math.max(0,Math.min(total,start)),b=Math.max(a,Math.min(total,end)),out=[pointAtDistance(points,a)];let run=0;for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i],len=Math.hypot(q.x-p.x,q.y-p.y);if(run+len>a&&run+len<b)out.push(q);run+=len;}out.push(pointAtDistance(points,b));return rounded(out);}
function bridgeRouteSegments(points:Array<{x:number;y:number}>):RoadMeshPart[]{
  const crossings:number[]=[];let run=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y),cross=riverCrossingPoint(a,b);if(cross)crossings.push(run+Math.hypot(cross.x-a.x,cross.y-a.y));run+=len;}
  if(!crossings.length)return[{kind:'road',points}];const center=crossings[0],total=routeLength(points),half=Math.min(38,total/4),transition=8,start=Math.max(0,center-half-transition),bridgeStart=Math.max(0,center-half),bridgeEnd=Math.min(total,center+half),end=Math.min(total,center+half+transition),parts:RoadMeshPart[]=[];
  if(start>0)parts.push({kind:'road',points:sliceRoute(points,0,start)});if(bridgeStart>start)parts.push({kind:'transition',points:sliceRoute(points,start,bridgeStart)});if(bridgeEnd>bridgeStart)parts.push({kind:'bridge',points:sliceRoute(points,bridgeStart,bridgeEnd)});if(end>bridgeEnd)parts.push({kind:'transition',points:sliceRoute(points,bridgeEnd,end)});if(total>end)parts.push({kind:'road',points:sliceRoute(points,end,total)});return parts.filter(part=>part.points.length>1);
}
function roadSegmentMesh(points:Array<{x:number;y:number}>,kind:RoadMeshPart['kind'],materials:any,addCaps=false){
  const {asphalt,shoulder,line,curb}=materials,g=new THREE.Group(),isBridge=kind==='bridge',isTransition=kind==='transition',roadWidth=isBridge?27:28,shoulderWidth=isBridge?30:36,shoulderY=isBridge?.52:isTransition?.56:.58,asphaltY=isBridge?.72:isTransition?.74:.69,markY=isBridge?.9:isTransition?.88:.86;
  const sh=ribbon(points,shoulderWidth,shoulderY,shoulder),surf=ribbon(points,roadWidth,asphaltY,asphalt);if(sh)g.add(sh);if(surf)g.add(surf);
  if(addCaps)for(const cap of roadCaps(points,roadWidth,shoulderWidth,asphaltY,shoulderY,asphalt,shoulder))g.add(cap);
  if(!isBridge&&!isTransition){for(const side of[-1,1]){const c=ribbon(offsetPolyline(points,side*14),1.1,.82,curb);if(c)g.add(c);}for(const m of centerRoadMarkings(points,markY,line))g.add(m);for(const m of edgeRoadMarkings(points,.89,line))g.add(m);}
  else if(isBridge){for(const m of centerRoadMarkings(points,markY,line))g.add(m);for(const side of[-1,1])for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.y-a.y,l=Math.hypot(dx,dz)||1;box(g,l,.7,.8,materials.rail,(a.x+b.x)/2-(dz/l)*side*16,2.3,(a.y+b.y)/2+(dx/l)*side*16,-Math.atan2(dz,dx));}}
  return g;
}
export function roadMesh(r:any){
  const p=rounded(r.points||[]),g=new THREE.Group();if(p.length<2)return g;
  const mats={asphalt:material('#353b3c',.92),shoulder:material('#6b7370',.98),line:material('#e9ebe5',.7),curb:material('#a0a6a1',.75),rail:material('#a9895c',.8,.1)};
  const parts=bridgeRouteSegments(p);for(const [index,part] of parts.entries()){const mesh=roadSegmentMesh(part.points,part.kind,mats,index===0||index===parts.length-1);g.add(mesh);}
  return g;
}
function roadJunctions(roads:any[]){const clusters:any[]=[];
  for(let i=0;i<roads.length;i++)for(let j=i+1;j<roads.length;j++){const a=rounded(roads[i]?.points||[]),b=rounded(roads[j]?.points||[]);
    for(let ai=1;ai<a.length;ai++)for(let bi=1;bi<b.length;bi++){const p=a[ai-1],q=a[ai],u=b[bi-1],v=b[bi],den=(q.x-p.x)*(v.y-u.y)-(q.y-p.y)*(v.x-u.x);if(Math.abs(den)<1e-9)continue;
      const t=((u.x-p.x)*(v.y-u.y)-(u.y-p.y)*(v.x-u.x))/den,ss=((u.x-p.x)*(q.y-p.y)-(u.y-p.y)*(q.x-p.x))/den;if(t<-.000001||t>1.000001||ss<-.000001||ss>1.000001)continue;
      const point={x:p.x+t*(q.x-p.x),y:p.y+t*(q.y-p.y)};let cluster=clusters.find(v=>Math.hypot(v.x-point.x,v.y-point.y)<10);if(!cluster){cluster={x:point.x,y:point.y,roads:new Set([i,j])};clusters.push(cluster);}else{cluster.roads.add(i);cluster.roads.add(j);}
    }
  }return clusters.map(v=>({x:v.x,y:v.y,degree:v.roads.size}));
}
function junctionMesh(p:any,roadsAtPoint:number){const asphalt=material('#353b3c',.92),shoulder=material('#6b7370',.98),degree=Math.max(3,roadsAtPoint||3),radius=degree>=4?24:20;return{shoulder:roundDisc(p.x,p.y,radius+6,.56,shoulder,24),surface:roundDisc(p.x,p.y,radius,.76,asphalt,24)};}
function rebuildJunctionPatches(roads:any[]){const out:THREE.Object3D[]=[];for(const p of roadJunctions(roads)){const j=junctionMesh(p,p.degree);out.push(j.shoulder,j.surface);}return out;}
export function roadYardTransitions(s:any){const out:THREE.Object3D[]=[];const asphalt=material('#353b3c',.92),apron=material('#777d78',.98),seen=new Set<string>();
  for(const building of s.buildings||[]){const attachment=buildingRoadAttachment(s,building);if(!attachment?.roadPoint||!attachment?.entrance)continue;const a=attachment.roadPoint,e=attachment.entrance,key=building.id+':'+a.x.toFixed(1)+','+a.y.toFixed(1);if(seen.has(key))continue;seen.add(key);
    const mid={x:(a.x+e.x)/2,y:(a.y+e.y)/2},path=[a,mid,e],shoulder=ribbon(path,46,.60,apron),surface=ribbon(path,30,.74,asphalt);if(shoulder)out.push(shoulder);if(surface)out.push(surface);out.push(roundDisc(e.x,e.y,18,.78,asphalt,20));
  }return out;
}
export function buildRoadGroup(roads:any[],state:any){
  const group=new THREE.Group();for(const r of roads||[]){const g=roadMesh(r);g.userData.road=r;group.add(g);}for(const patch of rebuildJunctionPatches(roads||[]))group.add(patch);for(const transition of roadYardTransitions(state))group.add(transition);return group;
}
