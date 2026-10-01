import {makeBuilding} from './state.js';
import {newId} from './core/ids.js';
import {dist,length,finitePoint,safePoint,validRoadPoints,projectSegment,projectOnPolyline,pointOnRoute,roadPointParameter,segmentIntersection,addNode,collinearOverlapLength,segmentDistance} from './world/roads/geometry.js';
import {isInsideWorldBounds,roadWithinWorldBounds,validateRoadGeometry} from './world/roads/validation.js';
import {riverY,district,WORLD_SIZE,WORLD_HALF_SIZE,WORLD_BOUNDS,WORLD_CONSTRUCTION_MARGIN,WORLD_MARGIN,WORLD_EDGE_SNAP_DISTANCE} from './world/terrain.js';
import {spawnBuilding,seedBuildings} from './world/buildings/spawning.js';
export {riverY,district,WORLD_SIZE,WORLD_HALF_SIZE,WORLD_BOUNDS,WORLD_CONSTRUCTION_MARGIN,WORLD_MARGIN,WORLD_EDGE_SNAP_DISTANCE} from './world/terrain.js';
import {buildLaneGraph,findLaneRoute,laneRouteToNodePath,laneRouteGeometry} from './laneGraph.js';
);
;
function nearestPointOnRoad(road,p){let best=null,bd=Infinity;for(let i=1;i<road.points.length;i++){const q=projectSegment(p,road.points[i-1],road.points[i]);if(q.distance<bd){bd=q.distance;best=q.point}}return best}

export function district(x,y){if(Math.abs(y-riverY(x))<170)return'Riverside';if(x<0&&y<180)return'Industrial';if(x>0&&y>0)return'Market Quarter';return'West End'}
export function buildingCost(s,type){const base={Steel:260,Food:220,Parts:320,Market:180,Garage:240,Builder:220,Plastics:420,Glass:500,Electronics:520,Furniture:600,Warehouse:700};return Math.round((base[type.name]||300)*Math.pow(1.12,s.buildings.length))}
export function buildingUnlock(t,s){if(t.unlock&&(s.research?.[t.unlock]||0)<t.unlockLevel)return'Requires '+t.unlock+' research Lv '+t.unlockLevel;const min={Steel:1,Food:1,Parts:2,Market:1,Garage:2,Builder:1,Plastics:1,Glass:2,Electronics:1,Furniture:2,Warehouse:2}[t.name]||1;if(s.companyLevel<min)return'Requires Company Level '+min;return null}
export function canBuild(s,type){const reason=buildingUnlock(type,s);if(reason)return reason;const cap=10+(s.research?.industry||0)*2;if(s.buildings.length>=cap)return'Company building capacity reached ('+cap+')';if(s.cash<buildingCost(s,type))return'Costs £'+buildingCost(s,type);return null}
export function buildingPhysicalPlacementReason(s,type,x,y){if(!type)return'Unknown building';if(!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))return'Invalid placement';if(!isInsideWorldBounds({x,y},WORLD_MARGIN))return'Outside the playable area';const candidate={kind:type.kind,x:Number(x),y:Number(y)};const footprint=buildingFootprint(candidate);for(const b of s.buildings||[]){if(!finitePoint(b))continue;const other=buildingFootprint(b),clearance=candidate.kind==='factory'&&b.kind==='factory'?48:18;const overlapX=Math.abs(Number(b.x)-Number(x))<footprint.halfWidth+other.halfWidth+clearance;const overlapY=Math.abs(Number(b.y)-Number(y))<footprint.halfDepth+other.halfDepth+clearance;if(overlapX&&overlapY)return candidate.kind==='factory'&&b.kind==='factory'?'Too close to another factory':'Too close to another building'}if(Math.abs(Number(y)-riverY(Number(x)))<105+Math.max(footprint.halfDepth,footprint.halfWidth)*.18)return'Too close to the river';return null}
export function canPlaceBuildingAt(s,type,x,y){const reason=canBuild(s,type);if(reason)return reason;return buildingPhysicalPlacementReason(s,type,x,y)}
export function buildingPlacementTarget(s,type,p){
  if(!finitePoint(p)||!type)return null;
  const f=buildingFootprint({kind:type.kind}), raw={x:Number(p.x),y:Number(p.y)};
  const road=nearestRoad(s,raw), building=nearestBuilding(s,raw), candidates=[];
  if(road){
    const vx=raw.x-road.x,vy=raw.y-road.y,len=Math.hypot(vx,vy)||1,ux=vx/len,uy=vy/len;
    const support=Math.abs(ux)>Math.abs(uy)?f.halfWidth:f.halfDepth;
    candidates.push({point:{x:road.x+ux*(support+10),y:road.y+uy*(support+10)},snapType:'road',road:road.road,roadPoint:{x:road.x,y:road.y},distance:road.distance});
  }
  if(building){
    const vx=raw.x-building.x,vy=raw.y-building.y,len=Math.hypot(vx,vy)||1,ux=vx/len,uy=vy/len,of=buildingFootprint(building);
    const support=Math.abs(ux)>Math.abs(uy)?f.halfWidth:f.halfDepth,other=Math.abs(ux)>Math.abs(uy)?of.halfWidth:of.halfDepth;
    candidates.push({point:{x:building.x+ux*(other+support+12),y:building.y+uy*(other+support+12)},snapType:'building',building,distance:dist(raw,building)});
  }
  const snap=candidates.sort((a,b)=>a.distance-b.distance)[0], snapped=!!snap&&snap.distance<=58, point=snapped?snap.point:raw;
  const accessPoints=[
    {side:'north',x:point.x,y:point.y-f.halfDepth,active:false},{side:'east',x:point.x+f.halfWidth,y:point.y,active:false},
    {side:'south',x:point.x,y:point.y+f.halfDepth,active:false},{side:'west',x:point.x-f.halfWidth,y:point.y,active:false}
  ];
  let connection=null;
  if(snapped){
    let best=accessPoints[0],bd=Infinity,target=snap.roadPoint||{x:snap.building.x,y:snap.building.y};
    for(const a of accessPoints){const d=dist(a,target);if(d<bd){bd=d;best=a}}
    best.active=true; connection={from:snap.roadPoint||best,to:best};
    if(snap.snapType==='building')connection.to=buildingConnectionPoint(snap.building,point);
  }
  return{point,snapType:snapped?snap.snapType:null,road:snap?.road||null,building:snap?.building||null,roadPoint:snap?.roadPoint||null,accessPoints,connection};
}

export function placeBuilding(s,type,x,y){if(canPlaceBuildingAt(s,type,x,y))return false;const b=makeBuilding(type,x,y,newId());b.district=district(x,y);s.cash-=buildingCost(s,type);s.buildings.push(b);return b}
export function spawn(s,kind,forced){return spawnBuilding(s,kind,forced,buildingPhysicalPlacementReason)}
export function seed(s){return seedBuildings(s,buildingPhysicalPlacementReason)}
export function nearestRoad(s,p){let best=null;for(const road of s.roads||[]){const points=validRoadPoints(road?.points,0);if(!points)continue;const q=projectOnPolyline(points,p);if(q&&(!best||q.distance<best.distance))best={x:q.point.x,y:q.point.y,road,distance:q.distance,segment:q.segment,along:q.along}}return best&&best.distance<=46?best:null}
}
export function buildingDockPoints(building){
  const x=Number(building?.x)||0,y=Number(building?.y)||0;
  const specs=building?.kind==='factory'
    ?[{name:'north-loading',x:0,y:31.5,normal:{x:0,y:1},width:22},{name:'south-loading',x:-23.4,y:-31.5,normal:{x:0,y:-1},width:13}]
    :building?.kind==='warehouse'
      ?[{name:'north-main',x:0,y:33.5,normal:{x:0,y:1},width:24},{name:'north-secondary',x:-30.7,y:33.5,normal:{x:0,y:1},width:14},{name:'south-secondary',x:30.7,y:-33.5,normal:{x:0,y:-1},width:14}]
      :[{name:'front-entrance',x:0,y:-28.5,normal:{x:0,y:-1},width:12}];
  return specs.map(dock=>({...dock,point:{x:x+dock.x,y:y+dock.y},approach:{x:x+dock.x+dock.normal.x*10,y:y+dock.y+dock.normal.y*10}}));
}
export function buildingLogisticsAccess(s,building){
  if(!building)return null;
  const attachment=roadAttachment(s,building);
  if(!attachment)return null;
  const docks=buildingDockPoints(building);
  const dock=docks.reduce((best,current)=>{
    const score=dist(attachment.point,current.approach);
    return !best||score<best.score?{...current,score}:best;
  },null);
  if(!dock)return null;
  const driveway=[{x:attachment.point.x,y:attachment.point.y},{x:dock.approach.x,y:dock.approach.y}];
  return{road:attachment.road,roadPoint:{...attachment.point},dock,driveway,connected:!roadPathBlocked(s,driveway,{end:building})};
}
function resolveRoadEndpoint(s,value){if(value?.building&&Number.isFinite(value.building.x))return buildingConnectionPoint(value.building,value);const building=nearestBuilding(s,value);if(building&&dist(building,value)<=88)return buildingConnectionPoint(building,value);const road=snapRoadPoint(s,value,42);return road||{x:value.x,y:value.y,distance:Infinity}}
function segmentIntersection(a,b,c,d){const ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},cross=(u,v)=>u.x*v.y-u.y*v.x,den=cross(ab,cd),ac={x:c.x-a.x,y:c.y-a.y};if(Math.abs(den)<1e-9)return null;const t=cross(ac,cd)/den,u=cross(ac,ab)/den;if(t<-.000001||t>1.000001||u<-.000001||u>1.000001)return null;return{x:a.x+ab.x*t,y:a.y+ab.y*t,t,u}}
function addNode(nodes,p,tolerance=2.5){let n=nodes.find(x=>dist(x,p)<tolerance);if(!n){n={x:p.x,y:p.y};nodes.push(n)}return n}
function roadPointParameter(a,b,p){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)return 0;return Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l))}
function roadDistance(a,b){const ap=a?.points||a,bp=b?.points||b;if(!Array.isArray(ap)||!Array.isArray(bp)||ap.length<2||bp.length<2)return Infinity;let best=Infinity;for(let i=1;i<ap.length;i++){const pa=ap[i-1],pb=ap[i];for(let j=1;j<bp.length;j++){const pc=bp[j-1],pd=bp[j];best=Math.min(best,projectSegment(pa,pc,pd).distance,projectSegment(pb,pc,pd).distance,projectSegment(pc,pa,pb).distance,projectSegment(pd,pa,pb).distance)}}return best}
function pointSegmentDistance(p,a,b){return projectSegment(p,a,b).distance}
function normalizeRoadEndpoint(s,p){const b=nearestBuilding(s,p);if(!b||dist(b,p)>88)return p;return buildingConnectionPoint(b,p)}
function segmentNearRiver(a,b,threshold=45){const span=Math.max(1,dist(a,b)),samples=Math.max(3,Math.ceil(span/24));for(let i=0;i<=samples;i++){const t=i/samples,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(Math.abs(y-riverY(x))<threshold)return true}return false}
function roadPathBlocked(s,points,endpointBuildings={}){
  if(!validRoadPoints(points,0))return true;
  const startBuilding=endpointBuildings.start||null,endBuilding=endpointBuildings.end||null;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    for(const building of s.buildings||[]){
      const clearance=(building.r||25)+12;
      const sameBuilding=(x,y)=>x===y||!!(x?.id&&y?.id&&x.id===y.id);
      const isStart=sameBuilding(building,startBuilding)&&i===1;
      const isEnd=sameBuilding(building,endBuilding)&&i===points.length-1;
      if(isStart||isEnd){
        const endpoint=isStart?a:b;
        if(dist(endpoint,{x:building.x,y:building.y})<=1)continue;
        if(endpointSegmentBlocked(building,a,b,isStart?'start':'end'))return true;
        continue;
      }
      // Existing roads may start/end just outside a building footprint while
      // still being a legitimate facade connection. Treat that endpoint as
      // the building connection instead of rejecting the whole edited road.
      if(i===1&&dist(a,{x:building.x,y:building.y})<=ROAD_BUILDING_SNAP_TOLERANCE)continue;
      if(i===points.length-1&&dist(b,{x:building.x,y:building.y})<=ROAD_BUILDING_SNAP_TOLERANCE)continue;
      if(pointSegmentDistance(building,a,b)<clearance)return true;
    }
  }
  return false;
}
function segmentIntersectsRect(a,b,rect){
  const inside=p=>p.x>=rect.minX&&p.x<=rect.maxX&&p.y>=rect.minY&&p.y<=rect.maxY;
  if(inside(a)||inside(b))return true;
  const edges=[
    [{x:rect.minX,y:rect.minY},{x:rect.maxX,y:rect.minY}],
    [{x:rect.maxX,y:rect.minY},{x:rect.maxX,y:rect.maxY}],
    [{x:rect.maxX,y:rect.maxY},{x:rect.minX,y:rect.maxY}],
    [{x:rect.minX,y:rect.maxY},{x:rect.minX,y:rect.minY}]
  ];
  return edges.some(([u,v])=>!!segmentIntersection(a,b,u,v));
}
function roadPathIntersectsBuildingFootprint(s,points,endpointBuildings={}){
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    for(const building of s.buildings||[]){
      const rect=buildingHitbox(building,0);
      const startsInside=a.x>=rect.minX&&a.x<=rect.maxX&&a.y>=rect.minY&&a.y<=rect.maxY;
      const endsInside=b.x>=rect.minX&&b.x<=rect.maxX&&b.y>=rect.minY&&b.y<=rect.maxY;
      const isStart=endpointBuildings.start&&building.id===endpointBuildings.start.id&&i===1;
      const isEnd=endpointBuildings.end&&building.id===endpointBuildings.end.id&&i===points.length-1;
      if(isStart||isEnd||(i===1&&startsInside)||(i===points.length-1&&endsInside))continue;
      if(segmentIntersectsRect(a,b,rect))return true;
    }
  }
  return false;
}

function simplifyRoad(points){const p=cleanRoadPoints(points);if(p.length<=2)return p;const out=[p[0]];for(let i=1;i<p.length-1;i++){const a=out.at(-1),b=p[i],c=p[i+1],ab={x:b.x-a.x,y:b.y-a.y},bc={x:c.x-b.x,y:c.y-b.y};if(Math.abs(ab.x*bc.y-ab.y*bc.x)<1.5)continue;out.push(b)}out.push(p.at(-1));return out}
function candidateRoadPaths(start,end,obstacles=[]){const mx=(start.x+end.x)/2,my=(start.y+end.y)/2,candidates=[[start,end],[start,{x:end.x,y:start.y},end],[start,{x:start.x,y:end.y},end],[start,{x:mx,y:start.y},{x:mx,y:end.y},end],[start,{x:start.x,y:my},{x:end.x,y:my},end]];for(const b of obstacles){const clearance=(b.r||25)+18,left=b.x-clearance,right=b.x+clearance,top=b.y-clearance,bottom=b.y+clearance;candidates.push([start,{x:start.x,y:top},{x:end.x,y:top},end],[start,{x:start.x,y:bottom},{x:end.x,y:bottom},end],[start,{x:left,y:start.y},{x:left,y:end.y},end],[start,{x:right,y:start.y},{x:right,y:end.y},end],[start,{x:start.x,y:top},{x:right,y:top},{x:right,y:end.y},end],[start,{x:start.x,y:bottom},{x:right,y:bottom},{x:right,y:end.y},end],[start,{x:left,y:start.y},{x:left,y:top},{x:end.x,y:top},{x:end.x,y:end.y},end],[start,{x:left,y:start.y},{x:left,y:bottom},{x:end.x,y:bottom},{x:end.x,y:end.y},end])}return candidates}
function routeBendPenalty(path){return Math.max(0,path.length-2)*18}
function orthogonalObstaclePath(s,start,end,endpointBuildings={}){const obstacles=(s.buildings||[]).filter(b=>b!==endpointBuildings.start&&b!==endpointBuildings.end);if(!obstacles.length)return null;const xs=[start.x,end.x],ys=[start.y,end.y];for(const b of obstacles){const clearance=(b.r||25)+18;xs.push(b.x-clearance,b.x+clearance);ys.push(b.y-clearance,b.y+clearance)}const uniq=a=>[...new Set(a.map(v=>Math.round(v*10)/10))].sort((a,b)=>a-b),xvals=uniq(xs),yvals=uniq(ys),nodes=[],byKey=new Map(),key=(x,y)=>x+','+y;for(const x of xvals)for(const y of yvals){const p={x,y};if(roadPathBlocked(s,[p,p],endpointBuildings))continue;const n={x,y,edges:[]};nodes.push(n);byKey.set(key(x,y),n)}const clearSegment=(a,b)=>!roadPathBlocked(s,[a,b],endpointBuildings);for(const y of yvals){const row=nodes.filter(n=>n.y===y).sort((a,b)=>a.x-b.x);for(let i=1;i<row.length;i++){const a=row[i-1],b=row[i];if(clearSegment(a,b)){const d=dist(a,b);a.edges.push({node:b,d});b.edges.push({node:a,d})}}}for(const x of xvals){const col=nodes.filter(n=>n.x===x).sort((a,b)=>a.y-b.y);for(let i=1;i<col.length;i++){const a=col[i-1],b=col[i];if(clearSegment(a,b)){const d=dist(a,b);a.edges.push({node:b,d});b.edges.push({node:a,d})}}}const startNode={x:start.x,y:start.y,edges:[]},endNode={x:end.x,y:end.y,edges:[]},attach=(p,node)=>{for(const n of nodes){if(n.x===p.x&&n.y===p.y)continue;const d=dist(p,n);if(p.x===n.x||p.y===n.y)if(clearSegment(p,n))node.edges.push({node:n,d})}};attach(start,startNode);attach(end,endNode);nodes.push(startNode,endNode);const queue=[{node:startNode,d:0}],best=new Map([[startNode,0]]),prev=new Map();while(queue.length){queue.sort((a,b)=>a.d-b.d);const cur=queue.shift();if(cur.d!==best.get(cur.node))continue;if(cur.node===endNode)break;for(const e of cur.node.edges){const nd=cur.d+e.d;if(nd<(best.get(e.node)??Infinity)){best.set(e.node,nd);prev.set(e.node,cur.node);queue.push({node:e.node,d:nd})}}}if(!best.has(endNode))return null;const path=[];let n=endNode;while(n){path.unshift({x:n.x,y:n.y});n=prev.get(n)}return simplifyRoad(path)}
function chooseRoadPath(s,start,end,endpointBuildings={}){const obstacles=(s.buildings||[]).filter(b=>b!==endpointBuildings.start&&b!==endpointBuildings.end),candidates=candidateRoadPaths(start,end,obstacles).map(simplifyRoad),routed=orthogonalObstaclePath(s,start,end,endpointBuildings);if(routed)candidates.push(routed);const clear=candidates.filter(path=>!roadPathBlocked(s,path,endpointBuildings));if(clear.length)return clear.sort((a,b)=>length(a)+routeBendPenalty(a)-(length(b)+routeBendPenalty(b)))[0];return null}
function snapToWorldEdge(p){
  if(!finitePoint(p))return null;
  const minX=WORLD_BOUNDS.minX+WORLD_MARGIN,maxX=WORLD_BOUNDS.maxX-WORLD_MARGIN;
  const minY=WORLD_BOUNDS.minY+WORLD_MARGIN,maxY=WORLD_BOUNDS.maxY-WORLD_MARGIN;
  const xEdge=p.x<=minX+WORLD_EDGE_SNAP_DISTANCE?minX:p.x>=maxX-WORLD_EDGE_SNAP_DISTANCE?maxX:null;
  const yEdge=p.y<=minY+WORLD_EDGE_SNAP_DISTANCE?minY:p.y>=maxY-WORLD_EDGE_SNAP_DISTANCE?maxY:null;
  if(xEdge===null&&yEdge===null)return null;
  return{
    x:xEdge===null?p.x:xEdge,
    y:yEdge===null?p.y:yEdge,
    distance:Math.min(xEdge===null?Infinity:Math.abs(p.x-xEdge),yEdge===null?Infinity:Math.abs(p.y-yEdge)),
    edgeSnapped:true,
    edgeX:xEdge!==null,
    edgeY:yEdge!==null
  };
}
export function roadTarget(s,p){return roadTargetInternal(s,p)}
function roadTargetInternal(s,p){
  if(!finitePoint(p))return null;
  if(p.building&&Number.isFinite(p.building.x))return buildingConnectionPoint(p.building,p);
  if(p.road&&Number.isFinite(p.x)&&Number.isFinite(p.y))return{x:p.x,y:p.y,road:p.road,distance:0};
  const building=roadBuildingTarget(s,p);
  const road=nearestRoad(s,p);
  if(building&&road){
    const hit=buildingHitbox(building,0);
    const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX),dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY);
    const buildingDistance=Math.hypot(dx,dy);
    if(buildingDistance<=10||road.distance<=buildingDistance)return buildingDistance<=10
      ? {...buildingConnectionPoint(building,p),building,distance:buildingDistance}
      : {x:road.x,y:road.y,road:road.road,distance:road.distance};
    const q=buildingConnectionPoint(building,p);
    return{...q,building,distance:buildingDistance};
  }
  if(building){
    const hit=buildingHitbox(building,0);
    const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX),dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY);
    const buildingDistance=Math.hypot(dx,dy);
    const q=buildingConnectionPoint(building,p);
    return{...q,building,distance:buildingDistance};
  }
  if(road)return{x:road.x,y:road.y,road:road.road,distance:road.distance};
  const edge=snapToWorldEdge(p);if(edge)return edge;
  const grid=12,snapped={x:Math.round(p.x/grid)*grid,y:Math.round(p.y/grid)*grid};
  return{x:snapped.x,y:snapped.y,distance:Infinity,gridSnapped:true};
}
export function roadPreview(s,a,b){let start=roadTargetInternal(s,a),end=roadTargetInternal(s,b);if(!start||!end)return null;const startBuilding=start.building,endBuilding=end.building;
if(startBuilding)start=buildingConnectionPoint(startBuilding,endBuilding||end);
if(endBuilding)end=buildingConnectionPoint(endBuilding,startBuilding||start);if(startBuilding&&endBuilding&&startBuilding!==endBuilding){const sa=buildingConnectionPoint(startBuilding,endBuilding),eb=buildingConnectionPoint(endBuilding,startBuilding),path=chooseRoadPath(s,sa,eb,{start:startBuilding,end:endBuilding});if(!path)return{path:[sa,eb],start:sa,end:eb,snappedStart:true,snappedEnd:true,connectsBuilding:true,connectsRoad:false,blocked:true,length:Infinity,cost:Infinity};const boundary=validateRoadGeometry(path);
    const roadLength=length(path);
    return{path,start:{...sa,building:startBuilding},end:{...eb,building:endBuilding},snappedStart:true,snappedEnd:true,connectsBuilding:true,connectsRoad:false,blocked:!boundary.ok,length:roadLength,blockedReason:boundary.ok?null:boundary.reason,cost:boundary.ok?Math.max(1,Math.ceil(roadLength/180))*2:Infinity}}
const path=chooseRoadPath(s,start,end,{start:startBuilding,end:endBuilding});
const boundary=validateRoadGeometry(path||[start,end]);
const blocked=!boundary.ok||!path||roadPathBlocked(s,path,{start:startBuilding,end:endBuilding});
const roadLength=path?length(path):Infinity;
return{path:path||[start,end],start,end,snappedStart:Number.isFinite(start.distance),snappedEnd:Number.isFinite(end.distance),edgeSnappedStart:!!start.edgeSnapped,edgeSnappedEnd:!!end.edgeSnapped,gridSnappedStart:!!start.gridSnapped,gridSnappedEnd:!!end.gridSnapped,connectsBuilding:!!start.building||!!end.building,connectsRoad:!!start.road||!!end.road,blocked,blockedReason:!boundary.ok?boundary.reason:null,length:roadLength,cost:Number.isFinite(roadLength)?Math.max(1,Math.ceil(roadLength/180))*2:Infinity}}
function reconcileRoadJunctions(s,points,meta={}){
  const endpoints=[{index:0,building:meta.startBuilding},{index:points.length-1,building:meta.endBuilding}];
  for(const endpoint of endpoints){
    if(endpoint.building)continue;
    const target=points[endpoint.index];
    let best=null;
    for(const road of s.roads||[]){
      if(road.points===points)continue;
      for(let i=1;i<road.points.length;i++){
        const q=projectSegment(target,road.points[i-1],road.points[i]);
        if(!best||q.distance<best.distance)best={road,point:q.point,distance:q.distance};
      }
    }
    if(best&&best.distance<=6){
      points[endpoint.index]={x:best.point.x,y:best.point.y};
    }
  }
}
function roadsHaveMeaningfulOverlap(a,b){const ap=a?.points||[],bp=b?.points||[];if(ap.length<2||bp.length<2)return false;let overlap=0;for(let i=1;i<ap.length;i++)for(let j=1;j<bp.length;j++)overlap=Math.max(overlap,collinearOverlapLength(ap[i-1],ap[i],bp[j-1],bp[j]));const aLen=length(ap),bLen=length(bp);return overlap>=24||overlap>=Math.min(aLen,bLen)*.65}
function roadGeometrySignature(road){return(road?.points||[]).map(p=>`${Math.round(p.x*10)/10},${Math.round(p.y*10)/10}`).join('|')}
function normalizeRoadGeometry(road){if(!road?.points)return null;const points=simplifyRoad(road.points);const validation=validateRoadGeometry(points);if(!validation.ok)return null;const bridge=points.some((p,i)=>i?segmentNearRiver(points[i-1],p):false);return{...road,points,bridge,age:Number.isFinite(road.age)?road.age:0,condition:Number.isFinite(road.condition)?Math.max(0,Math.min(1,road.condition)):1}}
function roadsExactlyDuplicate(a,b){if(!a?.points||!b?.points)return false;if(roadGeometrySignature(a)===roadGeometrySignature(b))return true;return roadGeometrySignature({...a,points:[...a.points].reverse()})===roadGeometrySignature(b)}
function invalidateTrucksForRoads(s,roads){const removed=new Set(roads);for(const truck of s.trucks||[])if((truck.routeSegments||[]).some(r=>removed.has(r))||roads.some(r=>routeTouchesRoad(truck.route,r)))truck.routeInvalidated=true}
function cloneRoadState(roads){return (roads||[]).map(road=>({...road,points:(road.points||[]).map(safePoint)}));}
function validateRoadNetworkState(s){
  const seen=new Set();
  for(const road of s.roads||[]){
    if(!road?.id||seen.has(road.id))return false;
    seen.add(road.id);
    const normalized=normalizeRoadGeometry(road);
    if(!normalized||normalized.points.length<2)return false;
  }
  return true;
}
function bumpRoadNetworkRevision(s){s.roadNetworkRevision=Math.max(0,Math.floor(Number(s.roadNetworkRevision)||0))+1}

function commitRoadMutation(s,mutator){
  const before=cloneRoadState(s.roads);
  try{mutator();cleanupRoadNetwork(s);if(!validateRoadNetworkState(s))throw new Error('invalid-road-network');}
  catch{ s.roads=before; return false; }
  bumpRoadNetworkRevision(s);
  const affected=[...before,...(s.roads||[])];
  invalidateTrucksForRoads(s,affected.filter((road,index)=>index===affected.findIndex(r=>r.id===road.id)));
  return true;
}
export function cleanupRoadNetwork(s){const original=[...(s.roads||[])],kept=[],removed=[];for(const road of original){const normalized=normalizeRoadGeometry(road);if(!normalized){removed.push(road);continue}if(kept.some(existing=>roadsExactlyDuplicate(existing,normalized)||roadsHaveMeaningfulOverlap(existing,normalized))){removed.push(road);continue}kept.push(normalized)}s.roads=kept;if(removed.length)invalidateTrucksForRoads(s,removed);return{removed,roads:s.roads}}
export function addRoad(s,points,meta={}){
  if(!Array.isArray(points)||points.length<2)return'invalid';
  const normalized=points.map(q=>safePoint(q));
  const inferredStart=buildingAtPoint(s,normalized[0],0);
  const inferredEnd=buildingAtPoint(s,normalized.at(-1),0);
  const startBuilding=meta.startBuilding||inferredStart;
  const endBuilding=meta.endBuilding||inferredEnd;
  if(startBuilding&&endBuilding&&startBuilding===endBuilding)return'blocked';
  // Explicit building connections use facade endpoints. Legacy direct addRoad
  // calls may still provide a building centre as an endpoint; keep those
  // coordinates intact and let the endpoint collision rules validate them.
  if(meta.startBuilding)normalized[0]=buildingConnectionPoint(meta.startBuilding,normalized.at(-1));
  if(meta.endBuilding)normalized[normalized.length-1]=buildingConnectionPoint(meta.endBuilding,normalized[0]);
  points=normalized;
  const validation=validateRoadGeometry(points);
  if(!validation.ok){
    const raw=validRoadPoints(points,0);
    if(raw&&length(raw)<12)return'too-short';
    return'boundary';
  }
  const clean=validation.points,roadLength=length(clean);
  if(!Number.isFinite(roadLength))return'invalid';
  if(roadLength<12){
    const a=meta.startBuilding||roadBuildingTarget(s,clean[0]),b=meta.endBuilding||roadBuildingTarget(s,clean.at(-1));
    if(!a||!b||a===b)return'too-short';
  }
  if(roadPathBlocked(s,clean,{start:startBuilding,end:endBuilding}))return'blocked';
  const cost=Math.max(1,Math.ceil(roadLength/180))*2;
  if(!Number.isFinite(cost)||!Number.isFinite(s.cash)||s.cash<cost)return'cash';
  if((s.roads||[]).some(r=>roadsExactlyDuplicate(r,{points:clean})||roadsHaveMeaningfulOverlap(r,{points:clean})))return'duplicate';
  const road={id:newId(),points:clean.map(safePoint),age:0,bridge:clean.some((p,i)=>i?segmentNearRiver(clean[i-1],p):false),condition:1};
  const previousCash=s.cash;
  s.roads.push(road);
  cleanupRoadNetwork(s);
  const committed=s.roads.find(r=>r?.id===road.id);
  if(!committed){
    s.cash=previousCash;
    return'duplicate';
  }
  s.cash-=cost;
  reconcileRoadJunctions(s,committed.points,meta);
  cleanupRoadNetwork(s);
  bumpRoadNetworkRevision(s);
  return true;
}
function routeTouchesRoad(route,road,tolerance=3){if(!Array.isArray(route)||route.length<2||!road?.points||road.points.length<2)return false;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i];for(let j=1;j<road.points.length;j++){const c=road.points[j-1],d=road.points[j],ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},cross=Math.abs(ab.x*cd.y-ab.y*cd.x),aligned=cross<=1e-6*Math.max(1,Math.hypot(ab.x,ab.y)*Math.hypot(cd.x,cd.y));if(aligned){if(collinearOverlapLength(a,b,c,d)>tolerance)return true}else if(segmentDistance(a,b,c,d)<=tolerance&&segmentDistance(a,b,c,d)>tolerance*.25)return true}}return false}
function roadAtPoint(s,p,tolerance=24){if(!finitePoint(p))return null;let hit=null,bd=tolerance;for(const r of s.roads||[]){const points=validRoadPoints(r?.points,0);if(!points)continue;const q=projectOnPolyline(points,p);if(q&&q.distance<bd){bd=q.distance;hit={road:r,projection:q}}}return hit}
export function roadSegmentAtPoint(s,p,tolerance=24){const hit=roadAtPoint(s,p,tolerance);if(!hit)return null;const segment=hit.projection.segment;if(!Number.isInteger(segment)||segment<0||segment>=hit.road.points.length-1)return null;return{road:hit.road,roadId:hit.road.id,segment,point:hit.projection.point,distance:hit.projection.distance}}
export function editRoadSegment(s,p,action='delete'){
  const hit=roadAtPoint(s,p);if(!hit)return false;
  const{road,projection}=hit,i=projection.segment;
  if(!Number.isInteger(i)||i<0||i>=road.points.length-1)return false;
  if(action!=='delete')return false;
  const idx=s.roads.indexOf(road);if(idx<0)return false;
  const removed=cloneRoadState([road])[0];
  if(!commitRoadMutation(s,()=>s.roads.splice(idx,1)))return false;
  for(const truck of s.trucks||[])if(routeTouchesRoad(truck.route,removed,4))truck.routeInvalidated=true;
  return{road:removed,segments:[],point:projection.point,action:'delete'};
}
function roadEndpointCandidate(s,p,maxDistance=24){if(!finitePoint(p))return null;let best=null;for(const road of s.roads||[]){if(!validRoadPoints(road?.points,0))continue;for(const index of [0,road.points.length-1]){const q=road.points[index],d=dist(q,p);if(d<=maxDistance&&(!best||d<best.distance))best={road,index,point:{x:q.x,y:q.y},distance:d}}}return best}
export function roadEndpointAtPoint(s,p,tolerance=28){const hit=roadEndpointCandidate(s,p,tolerance);if(!hit)return null;return{road:hit.road,roadId:hit.road.id,index:hit.index,point:hit.point,distance:hit.distance}}
function endpointTarget(s,p,road,index){
  const building=roadBuildingTarget(s,p);
  const roadHit=snapRoadPoint(s,p,24);
  const candidateRoad=roadHit&&roadHit.road!==road?roadHit:null;
  if(building){
    const hit=buildingHitbox(building,0);
    const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX),dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY);
    const buildingDistance=Math.hypot(dx,dy);
    if(buildingDistance<=24&&(buildingDistance<=10||!candidateRoad||buildingDistance<candidateRoad.distance)){
      const q=buildingConnectionPoint(building,p);
      return{x:q.x,y:q.y,building};
    }
  }
  if(candidateRoad)return{x:candidateRoad.x,y:candidateRoad.y,road:candidateRoad.road};
  const endpoint=roadEndpointCandidate(s,p,24);
  if(endpoint&&endpoint.road!==road)return{x:endpoint.point.x,y:endpoint.point.y,road:endpoint.road};
  const edge=snapToWorldEdge(p);if(edge)return edge;
  const grid=12;const snapped={x:Math.round(p.x/grid)*grid,y:Math.round(p.y/grid)*grid};
  return isInsideWorldBounds(snapped)?snapped:{x:Math.max(WORLD_BOUNDS.minX+WORLD_MARGIN,Math.min(WORLD_BOUNDS.maxX-WORLD_MARGIN,snapped.x)),y:Math.max(WORLD_BOUNDS.minY+WORLD_MARGIN,Math.min(WORLD_BOUNDS.maxY-WORLD_MARGIN,snapped.y))};
}
export function roadEndpointPreview(s,road,index,p){if(!road?.points||!Number.isInteger(index)||!road.points[index]||!finitePoint(p))return null;const target=endpointTarget(s,p,road,index),points=road.points.map(q=>safePoint(q));points[index]={x:target.x,y:target.y};
const clean=simplifyRoad(points),boundary=validateRoadGeometry(clean),lengthValue=length(clean);
const meta={startBuilding:index===0?target.building:roadBuildingTarget(s,clean[0]),endBuilding:index===clean.length-1?target.building:roadBuildingTarget(s,clean.at(-1))};
const targetRoad=target.road||null;const targetPoint=targetRoad&&target.x!=null?{x:target.x,y:target.y}:null;const targetEndpoints=targetRoad?.points?.length?[targetRoad.points[0],targetRoad.points.at(-1)]:[];const targetIsInterior=!!targetPoint&&targetEndpoints.every(q=>dist(q,targetPoint)>6);const blocked=clean.length<2||lengthValue<12||(target.road?false:(target.gridSnapped?roadPathIntersectsBuildingFootprint(s,clean,meta):roadPathBlocked(s,clean,meta))),otherRoads=(s.roads||[]).filter(r=>r!==road&&(!targetIsInterior||r!==targetRoad)),duplicate=otherRoads.some(r=>roadsHaveMeaningfulOverlap(r,{points:clean}));
return{road,roadId:road.id,index,target,point:target,edgeSnapped:!!target.edgeSnapped,path:clean,blocked:blocked||!boundary.ok,blockedReason:boundary.ok?null:boundary.reason,duplicate,length:lengthValue}}
export function editRoadEndpoint(s,roadId,index,p){
  const road=(s.roads||[]).find(r=>r?.id===roadId);
  if(!road?.points||!Number.isInteger(index)||index<0||index>=road.points.length)return false;
  const preview=roadEndpointPreview(s,road,index,p);
  if(!preview||preview.blocked||preview.duplicate)return false;
  const oldPoints=road.points.map(safePoint),oldEndpoint=oldPoints[index],clean=preview.path;
  if(dist(oldEndpoint,clean[index])<2)return false;
  const bridge=clean.some((point,i)=>i?segmentNearRiver(clean[i-1],point):false);
  const next={...road,points:clean,bridge,condition:Number.isFinite(road.condition)?road.condition:1};
  const idx=s.roads.indexOf(road);if(idx<0)return false;
  const targetRoad=preview.target?.road||null,targetBefore=targetRoad?targetRoad.points.map(safePoint):null;
  const junctionPoint={x:preview.target.x,y:preview.target.y};
  const beforeRoads=cloneRoadState(s.roads);
  try{
    s.roads.splice(idx,1,next);
    const liveTarget=targetRoad&&s.roads.includes(targetRoad)?targetRoad:null;
    if(liveTarget||preview.target?.road)next.points[index]=junctionPoint;
    if(!validateRoadNetworkState(s))throw new Error('invalid-road-network');
  }catch{
    s.roads=beforeRoads;
    return false;
  }
  bumpRoadNetworkRevision(s);
  for(const truck of s.trucks||[]){
    if(routeTouchesRoad(truck.route,{points:oldPoints},4))truck.routeInvalidated=true;
    if(targetBefore&&routeTouchesRoad(truck.route,{points:targetBefore},4))truck.routeInvalidated=true;
  }
  return{road:next,oldPoints,point:{x:next.points[index].x,y:next.points[index].y},target:preview.target,affected:[road,targetRoad].filter(Boolean)};
}
export function eraseRoad(s,p){const hit=roadAtPoint(s,p);if(!hit)return false;const{road}=hit;s.roads=s.roads.filter(r=>r!==road);cleanupRoadNetwork(s);bumpRoadNetworkRevision(s);invalidateTrucksForRoads(s,[road]);return true}
