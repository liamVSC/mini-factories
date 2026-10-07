import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import {riverY} from '../world.js';
import {buildingRoadAttachment} from '../world/buildings/connections.js';
import {roadNetwork} from '../world/roads/topology.js';
import {roadPathBlocked} from '../world/roads/placement.js';
import {buildingPrimaryDock} from '../world/buildings/geometry.js';
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
export function ribbon(points:Array<{x:number;y:number}>,width:number,y:number|number[],mat:any,receiveShadow=true){
  if(points.length<2)return null;const clean=[points[0]];for(let i=1;i<points.length;i++)if(Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y)>=.5)clean.push(points[i]);if(clean.length<2)return null;
  const heights=Array.isArray(y)?y:y;const heightAt=(i:number)=>Array.isArray(heights)?(heights[i]??heights.at(-1)??0):heights;
  const left=offsetPolyline(clean,width/2),right=offsetPolyline(clean,-width/2),verts:number[]=[],idx:number[]=[];
  for(let i=0;i<clean.length;i++){const h=heightAt(i);verts.push(left[i].x,h,left[i].y,right[i].x,h,right[i].y);if(i){const q=(i-1)*2,r=i*2;idx.push(q,r,q+1,q+1,r,r+1);}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(idx);geo.computeVertexNormals();const m=new THREE.Mesh(geo,mat);m.receiveShadow=receiveShadow;m.renderOrder=2;return m;
}
function roundDisc(x:number,z:number,radius:number,y:number,mat:any,segments=20,receiveShadow=true){const g=new THREE.Mesh(new THREE.CircleGeometry(radius,segments),mat);g.rotation.x=-Math.PI/2;g.position.set(x,y,z);g.receiveShadow=receiveShadow;g.renderOrder=2.05;return g;}
function roadCaps(points:Array<{x:number;y:number}>,roadWidth:number,sidewalkEnvelopeWidth:number,y:number,sidewalkY:number,asphalt:any,sidewalk:any){
  if(points.length<2)return[];const out:any[]=[];for(const p of[points[0],points.at(-1)!]){out.push(roundDisc(p.x,p.y,sidewalkEnvelopeWidth/2,sidewalkY+.025,sidewalk,20,false),roundDisc(p.x,p.y,roadWidth/2,y+.035,asphalt,20,false));}return out;
}
function centerRoadMarkings(points:Array<{x:number;y:number}>,y:number|number[],mat:any){
  const out:any[]=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],len=Math.hypot(b.x-a.x,b.y-a.y),dash=14,gap=10,count=Math.max(1,Math.floor(len/(dash+gap)));
    for(let n=0;n<count;n++){const s=n*(dash+gap),e=Math.min(len,s+dash);if(e<=s)continue;const t0=s/len,t1=e/len,p0={x:a.x+(b.x-a.x)*t0,y:a.y+(b.y-a.y)*t0},p1={x:a.x+(b.x-a.x)*t1,y:a.y+(b.y-a.y)*t1},h0=Array.isArray(y)?((y[i]??y.at(-1)??0)*(1-t0)+(y[i+1]??y.at(-1)??0)*t0):y,h1=Array.isArray(y)?((y[i]??y.at(-1)??0)*(1-t1)+(y[i+1]??y.at(-1)??0)*t1):y,m=ribbon([p0,p1],.8,[h0,h1],mat,false);if(m)out.push(m);}
  }return out;
}
function sidewalkStrips(points:Array<{x:number;y:number}>,roadHalfWidth:number,curbWidth:number,sidewalkWidth:number,y:any,mat:any){
  const out:any[]=[];
  const inner=roadHalfWidth+curbWidth;
  const center=inner+sidewalkWidth/2;
  for(const side of[-1,1]){
    const strip=ribbon(offsetPolyline(points,side*center),sidewalkWidth,y,mat,false);
    if(strip)out.push(strip);
  }
  return out;
}
function riverCrossingPoint(a:{x:number;y:number},b:{x:number;y:number}){const fa=a.y-riverY(a.x),fb=b.y-riverY(b.x);if(fa===0)return a;if(fb===0)return b;if(fa*fb>0)return null;let lo=0,hi=1;for(let i=0;i<24;i++){const t=(lo+hi)/2,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,f=y-riverY(x);if(f===0){lo=hi=t;break;}if(f*fa>0)lo=t;else hi=t;}const t=(lo+hi)/2;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function routeLength(points:Array<{x:number;y:number}>){let total=0;for(let i=1;i<points.length;i++)total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);return total;}
function pointAtDistance(points:Array<{x:number;y:number}>,d:number){if(points.length<2)return points[0];let remain=Math.max(0,d);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(remain<=len){const t=len<.001?0:remain/len;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}remain-=len;}return points.at(-1)!;}
function sliceRoute(points:Array<{x:number;y:number}>,start:number,end:number){const total=routeLength(points),a=Math.max(0,Math.min(total,start)),b=Math.max(a,Math.min(total,end)),out=[pointAtDistance(points,a)];let run=0;for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i],len=Math.hypot(q.x-p.x,q.y-p.y);if(run+len>a&&run+len<b)out.push(q);run+=len;}out.push(pointAtDistance(points,b));return rounded(out);}
function bridgeRouteSegments(points:Array<{x:number;y:number}>):RoadMeshPart[]{
  const crossings:number[]=[];let run=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y),cross=riverCrossingPoint(a,b);if(cross)crossings.push(run+Math.hypot(cross.x-a.x,cross.y-a.y));run+=len;}
  if(!crossings.length)return[{kind:'road',points}];const center=crossings[0],total=routeLength(points),half=Math.min(38,total/4),transition=8,start=Math.max(0,center-half-transition),bridgeStart=Math.max(0,center-half),bridgeEnd=Math.min(total,center+half),end=Math.min(total,center+half+transition),parts:RoadMeshPart[]=[];
  if(start>0)parts.push({kind:'road',points:sliceRoute(points,0,start)});if(bridgeStart>start)parts.push({kind:'transition',points:sliceRoute(points,start,bridgeStart)});if(bridgeEnd>bridgeStart)parts.push({kind:'bridge',points:sliceRoute(points,bridgeStart,bridgeEnd)});if(end>bridgeEnd)parts.push({kind:'transition',points:sliceRoute(points,bridgeEnd,end)});if(total>end)parts.push({kind:'road',points:sliceRoute(points,end,total)});return parts.filter(part=>part.points.length>1);
}
function transitionHeights(count:number,start:number,end:number){return Array.from({length:count},(_,i)=>start+(end-start)*(count<=1?0:i/(count-1)));}
function roadSegmentMesh(points:Array<{x:number;y:number}>,kind:RoadMeshPart['kind'],materials:any,addCaps=false,rising=false){
  const {asphalt,sidewalk,line,curb}=materials,g=new THREE.Group(),isBridge=kind==='bridge',isTransition=kind==='transition',roadWidth=30,roadHalfWidth=15,curbWidth=2,sidewalkWidth=15;
  const sidewalkY=isBridge?.68:isTransition?transitionHeights(points.length,.34,rising?.68:.34):.34;
  const asphaltY=isBridge?.82:isTransition?transitionHeights(points.length,.16,rising?.82:.16):.16;
  const curbY=isBridge?.88:isTransition?transitionHeights(points.length,.46,rising?.88:.46):.46;
  const markY=isBridge?.98:isTransition?transitionHeights(points.length,.49,rising?.98:.49):.49;
  const sidewalkMeshes=sidewalkStrips(points,roadHalfWidth,curbWidth,sidewalkWidth,sidewalkY,sidewalk);
  for(const mesh of sidewalkMeshes){mesh.position.y+=.015;g.add(mesh);}
  const surf=ribbon(points,roadWidth,asphaltY,asphalt,false);if(surf){surf.position.y+=.035;g.add(surf);}
  if(addCaps){
    for(const cap of roadCaps(points,roadWidth,roadWidth+2*(curbWidth+sidewalkWidth),(Array.isArray(asphaltY)?asphaltY.at(-1)??.16:asphaltY)+.01,(Array.isArray(sidewalkY)?sidewalkY.at(-1)??.23:sidewalkY)+.01,asphalt,sidewalk))g.add(cap);
  }
  for(const side of[-1,1]){
    const c=ribbon(offsetPolyline(points,side*roadHalfWidth),curbWidth,curbY,curb,false);
    if(c){c.position.y+=.01;g.add(c);}
  }
  for(const m of centerRoadMarkings(points,markY,line))g.add(m);
  if(isBridge){
    const outer=roadHalfWidth+curbWidth+sidewalkWidth;
    for(const side of[-1,1])for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.y-a.y,l=Math.hypot(dx,dz)||1;
      box(g,l,.7,.8,materials.rail,(a.x+b.x)/2-(dz/l)*side*outer,2.3,(a.y+b.y)/2+(dx/l)*side*outer,-Math.atan2(dz,dx));
    }
  }
  return g;
}
export function roadEndpointBuildings(state:any,r:any){
  let start:any=null,end:any=null;
  for(const building of state?.buildings||[]){
    const attachment=buildingRoadAttachment(state,building);
    if(!attachment||attachment.road?.id!==r?.id)continue;
    const first=r.points?.[0],last=r.points?.at(-1),rp=attachment.roadPoint;
    if(first&&rp&&Math.hypot(rp.x-first.x,rp.y-first.y)<=46)start=building;
    if(last&&rp&&Math.hypot(rp.x-last.x,rp.y-last.y)<=46)end=building;
  }
  return {start,end};
}
export function roadMesh(r:any){return roadMeshWithState(r,null);}
function roadMeshWithState(r:any,state:any=null){
  let p=smoothRoadPath(r.points||[]);
  const endpointBuildings=state?roadEndpointBuildings(state,r):{};
  if(state&&p.length>=2&&roadPathBlocked(state,p,endpointBuildings))p=rounded(r.points||[]);
  const g=new THREE.Group();if(p.length<2)return g;
  const mats={asphalt:material('#353b3c',.92),sidewalk:material('#777d78',.98),line:material('#e9ebe5',.7),curb:material('#a0a6a1',.75),rail:material('#a9895c',.8,.1)};
  const parts=bridgeRouteSegments(p);for(const [index,part] of parts.entries()){const rising=part.kind==='transition'&&parts[index+1]?.kind==='bridge';const mesh=roadSegmentMesh(part.points,part.kind,mats,index===0&&index===parts.length-1,rising);g.add(mesh);}
  return g;
}
function roadJunctions(roads:any[],state:any=null){
  if(state){const network=roadNetwork(state);return network.junctions.map(point=>({x:point.x,y:point.y,degree:network.adjacency.get(point)?.length||3}));}
  return [];
}
function junctionMesh(p:any,roadsAtPoint:number){
  const sidewalk=material('#777d78',.98);
  const inner=16.4,outer=31.4,segments=24;
  const vertices:number[]=[],indices:number[]=[];
  for(let i=0;i<segments;i++){
    const a=(i/segments)*Math.PI*2,b=((i+1)/segments)*Math.PI*2;
    vertices.push(p.x+Math.cos(a)*inner,.345,p.y+Math.sin(a)*inner);
    vertices.push(p.x+Math.cos(a)*outer,.345,p.y+Math.sin(a)*outer);
    vertices.push(p.x+Math.cos(b)*inner,.345,p.y+Math.sin(b)*inner);
    vertices.push(p.x+Math.cos(b)*outer,.345,p.y+Math.sin(b)*outer);
    const q=i*4;indices.push(q,q+1,q+2,q+1,q+3,q+2);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,sidewalk);
  mesh.receiveShadow=false;
  mesh.renderOrder=2.04;
  return mesh;
}
function rebuildJunctionPatches(roads:any[],state:any){const out:any[]=[];for(const p of roadJunctions(roads,state))out.push(junctionMesh(p,p.degree));return out;}
export function roadYardTransitions(s:any){const out:any[]=[];const apron=material('#777d78',.98),loading=material('#858b86',.98),seen=new Set<string>();
  for(const building of s.buildings||[]){const attachment=buildingRoadAttachment(s,building),dock=buildingPrimaryDock(building);if(!attachment?.roadPoint||!attachment?.entrance||!dock)continue;const gate=attachment.roadPoint,e=attachment.entrance,key=building.id+':'+gate.x.toFixed(1)+','+gate.y.toFixed(1);if(seen.has(key))continue;seen.add(key);
    const turnX=dock.point.x+((dock.normal?.y||0)>0?48:-48),midY=(e.y+dock.approach.y)/2,turn={x:turnX,y:midY},path=[gate,turn,dock.approach],yardApron=ribbon(path,46,.34,apron,false),loadingApron=ribbon([dock.approach,dock.point],dock.width+12,.36,loading,false);if(yardApron)out.push(yardApron);if(loadingApron)out.push(loadingApron);
  }return out;
}
export function buildRoadGroup(roads:any[],state:any){
  const group=new THREE.Group();for(const [index,r] of (roads||[]).entries()){const g=roadMeshWithState(r,state);g.userData.road=r;g.position.y=index*.002;g.renderOrder=2+index*.001;group.add(g);}for(const patch of rebuildJunctionPatches(roads||[],state))group.add(patch);for(const transition of roadYardTransitions(state))group.add(transition);return group;
}
