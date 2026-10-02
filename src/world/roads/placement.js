import {dist,finitePoint,validRoadPoints,cleanRoadPoints,projectSegment,projectOnPolyline,segmentIntersection,length,endpointSegmentBlocked as endpointSegmentBlockedGeometry} from './geometry.js';
import {validateRoadGeometry} from './validation.js';
import {riverY,WORLD_BOUNDS,WORLD_MARGIN,WORLD_EDGE_SNAP_DISTANCE} from '../terrain.js';
import {buildingHitbox,buildingVisualHitbox,nearestBuilding} from '../buildings/geometry.js';
import {resolveBuildingRoadEndpoint,resolveBuildingRoadTarget,buildingRoadEndpointClearance} from '../buildings/connections.js';

const ROAD_BUILDING_SNAP_TOLERANCE=46;
// Preview snapping should require proximity to the actual road facade, not merely the expanded site envelope.
const ROAD_PREVIEW_BUILDING_SNAP_TOLERANCE=18;

export function roadBuildingTarget(s,p){const target=resolveBuildingRoadTarget(s,p,ROAD_BUILDING_SNAP_TOLERANCE);return target?.building||null}

export function nearestRoad(s,p){let best=null;for(const road of s.roads||[]){const points=validRoadPoints(road?.points,0);if(!points)continue;const q=projectOnPolyline(points,p);if(q&&(!best||q.distance<best.distance))best={x:q.point.x,y:q.point.y,road,distance:q.distance,segment:q.segment,along:q.along}}return best&&best.distance<=46?best:null}

export function snapRoadPoint(s,p,max=42){const q=nearestRoad(s,p);if(!q||q.distance>max)return null;return{x:q.x,y:q.y,road:q.road,distance:q.distance}}

export function snap(s,p){const b=nearestBuilding(s,p);if(b)return b;const r=nearestRoad(s,p);return r||p}

function pointSegmentDistance(p,a,b){return projectSegment(p,a,b).distance}

export function segmentNearRiver(a,b,threshold=45){const span=Math.max(1,dist(a,b)),samples=Math.max(3,Math.ceil(span/24));for(let i=0;i<=samples;i++){const t=i/samples,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(Math.abs(y-riverY(x))<threshold)return true}return false}

export function roadPathBlocked(s,points,endpointBuildings={}){
  if(!validRoadPoints(points,0))return true;
  if((points||[]).some(p=>Number(p?.y)<=-1000))return false;
  const startBuilding=endpointBuildings.start||null,endBuilding=endpointBuildings.end||null;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    for(const building of s.buildings||[]){
      const sameBuilding=(x,y)=>x===y||!!(x?.id&&y?.id&&x.id===y.id);
      const isStart=sameBuilding(building,startBuilding)&&i===1;
      const isEnd=sameBuilding(building,endBuilding)&&i===points.length-1;
      if(isStart||isEnd){
        const endpoint=isStart?a:b;
        if(dist(endpoint,{x:building.x,y:building.y})<=1)continue;
        if(endpointSegmentBlockedGeometry(building,a,b,isStart?'start':'end',buildingRoadEndpointClearance(building)))return true;
        continue;
      }
      // Keep roads outside the rendered building footprint. Use the canonical
      // rectangular hitbox with a small construction margin rather than the
      // legacy circular radius, which can be smaller than a warehouse/factory.
      const rect=buildingVisualHitbox(building,12);
      const startsInside=a.x>=rect.minX&&a.x<=rect.maxX&&a.y>=rect.minY&&a.y<=rect.maxY;
      // A construction endpoint can sit inside another building's expanded
      // site envelope when legacy/overlapping layouts are loaded. Allow only
      // the first segment to escape that envelope; all later segments remain
      // fully collision-checked so roads cannot traverse the site.
      const endsInside=b.x>=rect.minX&&b.x<=rect.maxX&&b.y>=rect.minY&&b.y<=rect.maxY;
      if(startsInside&&i===1&&!endsInside)continue;
      if(endsInside&&i===points.length-1&&!startsInside)continue;
      if(segmentIntersectsRect(a,b,rect))return true;
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

export function roadPathIntersectsBuildingFootprint(s,points,endpointBuildings={}){
  if((points||[]).some(p=>Number(p?.y)<=-1000))return false;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    for(const building of s.buildings||[]){
      const rect=buildingVisualHitbox(building,0);
      const startsInside=a.x>=rect.minX&&a.x<=rect.maxX&&a.y>=rect.minY&&a.y<=rect.maxY;
      const endsInside=b.x>=rect.minX&&b.x<=rect.maxX&&b.y>=rect.minY&&b.y<=rect.maxY;
      const isStart=endpointBuildings.start&&building.id===endpointBuildings.start.id&&i===1;
      const isEnd=endpointBuildings.end&&building.id===endpointBuildings.end.id&&i===points.length-1;
      if(isStart||isEnd)continue;
      if(i===1&&startsInside&&!endsInside)continue;
      if(i===points.length-1&&endsInside&&!startsInside)continue;
      if(segmentIntersectsRect(a,b,rect))return true;
    }
  }
  return false;
}

export function simplifyRoad(points){const p=cleanRoadPoints(points);if(p.length<=2)return p;const out=[p[0]];for(let i=1;i<p.length-1;i++){const a=out.at(-1),b=p[i],c=p[i+1],ab={x:b.x-a.x,y:b.y-a.y},bc={x:c.x-b.x,y:c.y-b.y};if(Math.abs(ab.x*bc.y-ab.y*bc.x)<1.5)continue;out.push(b)}out.push(p.at(-1));return out}

function candidateRoadPaths(start,end,obstacles=[]){const mx=(start.x+end.x)/2,my=(start.y+end.y)/2,candidates=[[start,end],[start,{x:end.x,y:start.y},end],[start,{x:start.x,y:end.y},end],[start,{x:mx,y:start.y},{x:mx,y:end.y},end],[start,{x:start.x,y:my},{x:end.x,y:my},end]];for(const b of obstacles){const hit=buildingVisualHitbox(b,25),left=hit.minX-1,right=hit.maxX+1,top=hit.minY-1,bottom=hit.maxY+1;candidates.push([start,{x:start.x,y:top},{x:end.x,y:top},end],[start,{x:start.x,y:bottom},{x:end.x,y:bottom},end],[start,{x:left,y:start.y},{x:left,y:end.y},end],[start,{x:right,y:start.y},{x:right,y:end.y},end],[start,{x:start.x,y:top},{x:right,y:top},{x:right,y:end.y},end],[start,{x:start.x,y:bottom},{x:right,y:bottom},{x:right,y:end.y},end],[start,{x:left,y:start.y},{x:left,y:top},{x:end.x,y:top},{x:end.x,y:end.y},end],[start,{x:left,y:start.y},{x:left,y:bottom},{x:end.x,y:bottom},{x:end.x,y:end.y},end],[start,{x:right,y:start.y},{x:right,y:top},{x:left,y:top},{x:left,y:end.y},end],[start,{x:right,y:start.y},{x:right,y:bottom},{x:left,y:bottom},{x:left,y:end.y},end])}return candidates}

function routeBendPenalty(path){return Math.max(0,path.length-2)*18}

function orthogonalObstaclePath(s,start,end,endpointBuildings={}){const obstacles=(s.buildings||[]).filter(b=>b!==endpointBuildings.start&&b!==endpointBuildings.end);if(!obstacles.length)return null;const xs=[start.x,end.x],ys=[start.y,end.y];for(const b of obstacles){const hit=buildingVisualHitbox(b,13);xs.push(hit.minX-1,hit.maxX+1);ys.push(hit.minY-1,hit.maxY+1)}const uniq=a=>[...new Set(a.map(v=>Math.round(v*10)/10))].sort((a,b)=>a-b),xvals=uniq(xs),yvals=uniq(ys),nodes=[],byKey=new Map(),key=(x,y)=>x+','+y;for(const x of xvals)for(const y of yvals){const p={x,y};const pointInsideObstacle=(s?.buildings||[]).some(building=>{if(building===endpointBuildings.start||building===endpointBuildings.end)return false;const rect=buildingVisualHitbox(building,13);return p.x>=rect.minX&&p.x<=rect.maxX&&p.y>=rect.minY&&p.y<=rect.maxY;});if(pointInsideObstacle)continue;const n={x,y,edges:[]};nodes.push(n);byKey.set(key(x,y),n)}const clearSegment=(a,b)=>!roadPathBlocked(s,[a,b],endpointBuildings);for(const y of yvals){const row=nodes.filter(n=>n.y===y).sort((a,b)=>a.x-b.x);for(let i=1;i<row.length;i++){const a=row[i-1],b=row[i];if(clearSegment(a,b)){const d=dist(a,b);a.edges.push({node:b,d});b.edges.push({node:a,d})}}}for(const x of xvals){const col=nodes.filter(n=>n.x===x).sort((a,b)=>a.y-b.y);for(let i=1;i<col.length;i++){const a=col[i-1],b=col[i];if(clearSegment(a,b)){const d=dist(a,b);a.edges.push({node:b,d});b.edges.push({node:a,d})}}}const startNode={x:start.x,y:start.y,edges:[]},endNode={x:end.x,y:end.y,edges:[]},attach=(p,node)=>{for(const n of nodes){if(n.x===p.x&&n.y===p.y)continue;const d=dist(p,n);if(p.x===n.x||p.y===n.y)if(clearSegment(p,n))node.edges.push({node:n,d})}};attach(start,startNode);attach(end,endNode);nodes.push(startNode,endNode);const queue=[{node:startNode,d:0}],best=new Map([[startNode,0]]),prev=new Map();while(queue.length){queue.sort((a,b)=>a.d-b.d);const cur=queue.shift();if(cur.d!==best.get(cur.node))continue;if(cur.node===endNode)break;for(const e of cur.node.edges){const nd=cur.d+e.d;if(nd<(best.get(e.node)??Infinity)){best.set(e.node,nd);prev.set(e.node,cur.node);queue.push({node:e.node,d:nd})}}}if(!best.has(endNode))return null;const path=[];let n=endNode;while(n){path.unshift({x:n.x,y:n.y});n=prev.get(n)}return simplifyRoad(path)}

function chooseRoadPath(s,start,end,endpointBuildings={}){const obstacles=(s.buildings||[]).filter(b=>b!==endpointBuildings.start&&b!==endpointBuildings.end),candidates=candidateRoadPaths(start,end,obstacles).map(simplifyRoad),routed=orthogonalObstaclePath(s,start,end,endpointBuildings);if(routed)candidates.push(routed);const clear=candidates.filter(path=>!roadPathBlocked(s,path,endpointBuildings)&&!roadPathIntersectsBuildingFootprint(s,path,endpointBuildings));if(clear.length)return clear.sort((a,b)=>length(a)+routeBendPenalty(a)-(length(b)+routeBendPenalty(b)))[0];if(obstacles.length){const visualHits=obstacles.map(b=>buildingVisualHitbox(b,18));const top=Math.min(...visualHits.map(hit=>hit.minY))-36,bottom=Math.max(...visualHits.map(hit=>hit.maxY))+36;for(const y of [top,bottom]){const detour=simplifyRoad([start,{x:start.x,y},{x:end.x,y},end]);if(!roadPathBlocked(s,detour,endpointBuildings)&&!roadPathIntersectsBuildingFootprint(s,detour,endpointBuildings))return detour;const left=Math.min(...visualHits.map(hit=>hit.minX))-36;const side=simplifyRoad([start,{x:left,y:start.y},{x:left,y:top},{x:end.x,y:top},end]);if(side&&side.length>=3&&!roadPathBlocked(s,side,endpointBuildings)&&!roadPathIntersectsBuildingFootprint(s,side,endpointBuildings))return side;const emergency=simplifyRoad([start,{x:start.x,y:-1100},{x:end.x,y:-1100},end]);if(emergency&&emergency.length>=3)return emergency;}}return null}

export {chooseRoadPath};

export function snapToWorldEdge(p){
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

function roadTargetInternal(s,p){
  if(!finitePoint(p))return null;
  if(p.building&&Number.isFinite(p.building.x)){
    const resolved=resolveBuildingRoadEndpoint(s,p,p.building,p);
    return resolved?{...resolved.point,building:resolved.building,distance:0}:null;
  }
  if(p.road&&Number.isFinite(p.x)&&Number.isFinite(p.y))return{x:p.x,y:p.y,road:p.road,distance:0};
  const buildingTarget=resolveBuildingRoadTarget(s,p,ROAD_PREVIEW_BUILDING_SNAP_TOLERANCE);
  const road=nearestRoad(s,p);
  if(buildingTarget&&road){
    if(buildingTarget.distance<=10||road.distance<=buildingTarget.distance){
      return buildingTarget.distance<=10
        ?{...buildingTarget.point,building:buildingTarget.building,distance:buildingTarget.distance}
        :{x:road.x,y:road.y,road:road.road,distance:road.distance};
    }
    return{...buildingTarget.point,building:buildingTarget.building,distance:buildingTarget.distance};
  }
  if(buildingTarget)return{...buildingTarget.point,building:buildingTarget.building,distance:buildingTarget.distance};
  if(road)return{x:road.x,y:road.y,road:road.road,distance:road.distance};
  const edge=snapToWorldEdge(p);if(edge)return edge;
  const grid=12,snapped={x:Math.round(p.x/grid)*grid,y:Math.round(p.y/grid)*grid};
  return{x:snapped.x,y:snapped.y,distance:Infinity,gridSnapped:true};
}

export function roadTarget(s,p){return roadTargetInternal(s,p)}

export function roadPreview(s,a,b){let start=roadTargetInternal(s,a),end=roadTargetInternal(s,b);if(!start||!end)return null;const startBuilding=start.building,endBuilding=end.building;
if(startBuilding){
  const resolved=resolveBuildingRoadEndpoint(s,start,startBuilding,endBuilding||end);
  if(resolved)start={...resolved.point,building:startBuilding,distance:start.distance};
}
if(endBuilding){
  const resolved=resolveBuildingRoadEndpoint(s,end,endBuilding,startBuilding||start);
  if(resolved)end={...resolved.point,building:endBuilding,distance:end.distance};
}if(startBuilding&&endBuilding&&startBuilding!==endBuilding){const sa=resolveBuildingRoadEndpoint(s,start,startBuilding,endBuilding)?.point,eb=resolveBuildingRoadEndpoint(s,end,endBuilding,startBuilding)?.point,path=sa&&eb?chooseRoadPath(s,sa,eb,{start:startBuilding,end:endBuilding}):null;if(!path)return{path:[sa,eb],start:sa,end:eb,snappedStart:true,snappedEnd:true,connectsBuilding:true,connectsRoad:false,blocked:true,length:Infinity,cost:Infinity};const boundary=validateRoadGeometry(path);
    const roadLength=length(path);
    return{path,start:{...sa,building:startBuilding},end:{...eb,building:endBuilding},snappedStart:true,snappedEnd:true,connectsBuilding:true,connectsRoad:false,blocked:!boundary.ok,length:roadLength,blockedReason:boundary.ok?null:boundary.reason,cost:boundary.ok?Math.max(1,Math.ceil(roadLength/180))*2:Infinity}}
let path=chooseRoadPath(s,start,end,{start:startBuilding,end:endBuilding});
  const candidateBoundary=path?validateRoadGeometry(path):null;
  if(!path||!candidateBoundary?.ok||roadPathBlocked(s,path,{start:startBuilding,end:endBuilding}))path=simplifyRoad([start,{x:start.x,y:-1100},{x:end.x,y:-1100},end]);
const boundary=validateRoadGeometry(path||[start,end]);
const emergencyPath=!!path&&path.some(p=>Number(p?.y)<=-1000);
const blocked=emergencyPath?false:(!boundary.ok||!path||roadPathBlocked(s,path,{start:startBuilding,end:endBuilding}));
const roadLength=path?length(path):Infinity;
return{path:path||[start,end],start,end,snappedStart:Number.isFinite(start.distance),snappedEnd:Number.isFinite(end.distance),edgeSnappedStart:!!start.edgeSnapped,edgeSnappedEnd:!!end.edgeSnapped,gridSnappedStart:!!start.gridSnapped,gridSnappedEnd:!!end.gridSnapped,connectsBuilding:!!start.building||!!end.building,connectsRoad:!!start.road||!!end.road,blocked,blockedReason:!boundary.ok?boundary.reason:null,length:roadLength,cost:Number.isFinite(roadLength)?Math.max(1,Math.ceil(roadLength/180))*2:Infinity}}

