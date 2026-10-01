import {dist,length,finitePoint,safePoint,validRoadPoints,projectSegment,projectOnPolyline} from './geometry.js';
import {isInsideWorldBounds,validateRoadGeometry} from './validation.js';
import {WORLD_BOUNDS,WORLD_MARGIN,WORLD_EDGE_SNAP_DISTANCE,riverY} from '../terrain.js';
import {buildingHitbox,buildingConnectionPoint,nearestBuilding} from '../buildings/buildings.js';

const ROAD_BUILDING_SNAP_TOLERANCE=46;

export function roadBuildingTarget(s,p){if(!finitePoint(p))return null;let best=null,bd=Infinity;for(const b of s.buildings||[]){const hit=buildingHitbox(b,ROAD_BUILDING_SNAP_TOLERANCE),dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX),dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY),d=Math.hypot(dx,dy);if(d<bd){bd=d;best=b}}return bd<=ROAD_BUILDING_SNAP_TOLERANCE?best:null}

export function nearestRoad(s,p){let best=null;for(const road of s.roads||[]){const points=validRoadPoints(road?.points,0);if(!points)continue;const q=projectOnPolyline(points,p);if(q&&(!best||q.distance<best.distance))best={x:q.point.x,y:q.point.y,road,distance:q.distance,segment:q.segment,along:q.along}}return best&&best.distance<=46?best:null}

function resolveRoadEndpoint(s,value){if(value?.building&&Number.isFinite(value.building.x))return buildingConnectionPoint(value.building,value);const building=nearestBuilding(s,value);if(building&&dist(building,value)<=88)return buildingConnectionPoint(building,value);const road=snapRoadPoint(s,value,42);return road||{x:value.x,y:value.y,distance:Infinity}}

export function snapRoadPoint(s,p,max=42){const q=nearestRoad(s,p);if(!q||q.distance>max)return null;return{x:q.x,y:q.y,road:q.road,distance:q.distance}}

export function snap(s,p){const b=nearestBuilding(s,p);if(b)return b;const r=nearestRoad(s,p);return r||p}

function roadPathBlocked(s,points,endpointBuildings={}

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

function roadPathIntersectsBuildingFootprint(s,points,endpointBuildings={}

function simplifyRoad(points){const p=cleanRoadPoints(points);if(p.length<=2)return p;const out=[p[0]];for(let i=1;i<p.length-1;i++){const a=out.at(-1),b=p[i],c=p[i+1],ab={x:b.x-a.x,y:b.y-a.y},bc={x:c.x-b.x,y:c.y-b.y};if(Math.abs(ab.x*bc.y-ab.y*bc.x)<1.5)continue;out.push(b)}out.push(p.at(-1));return out}

function candidateRoadPaths(start,end,obstacles=[]){const mx=(start.x+end.x)/2,my=(start.y+end.y)/2,candidates=[[start,end],[start,{x:end.x,y:start.y},end],[start,{x:start.x,y:end.y},end],[start,{x:mx,y:start.y},{x:mx,y:end.y},end],[start,{x:start.x,y:my},{x:end.x,y:my},end]];for(const b of obstacles){const clearance=(b.r||25)+18,left=b.x-clearance,right=b.x+clearance,top=b.y-clearance,bottom=b.y+clearance;candidates.push([start,{x:start.x,y:top},{x:end.x,y:top},end],[start,{x:start.x,y:bottom},{x:end.x,y:bottom},end],[start,{x:left,y:start.y},{x:left,y:end.y},end],[start,{x:right,y:start.y},{x:right,y:end.y},end],[start,{x:start.x,y:top},{x:right,y:top},{x:right,y:end.y},end],[start,{x:start.x,y:bottom},{x:right,y:bottom},{x:right,y:end.y},end],[start,{x:left,y:start.y},{x:left,y:top},{x:end.x,y:top},{x:end.x,y:end.y},end],[start,{x:left,y:start.y},{x:left,y:bottom},{x:end.x,y:bottom},{x:end.x,y:end.y},end])}return candidates}

function routeBendPenalty(path){return Math.max(0,path.length-2)*18}

function orthogonalObstaclePath(s,start,end,endpointBuildings={}

function chooseRoadPath(s,start,end,endpointBuildings={}

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

export {roadBuildingTarget,nearestRoad,snapRoadPoint,snap,roadTarget,roadPreview};
export {roadPathBlocked,roadPathIntersectsBuildingFootprint,chooseRoadPath,snapToWorldEdge};
