import {makeBuilding} from './state.js';
import {newId} from './core/ids.js';
import {dist,length,finitePoint,safePoint,validRoadPoints,projectSegment,projectOnPolyline,pointOnRoute} from './world/roads/geometry.js';
import {isInsideWorldBounds,validateRoadGeometry} from './world/roads/validation.js';
import {riverY,district,WORLD_SIZE,WORLD_HALF_SIZE,WORLD_BOUNDS,WORLD_CONSTRUCTION_MARGIN,WORLD_MARGIN,WORLD_EDGE_SNAP_DISTANCE} from './world/terrain.js';
import {spawnBuilding,seedBuildings} from './world/buildings/spawning.js';
import {buildingPhysicalPlacementReason,buildingHitbox,buildingAtPoint,nearestBuilding,buildingFootprint,buildingDockPoints,buildingConnectionPoint,buildingFootprintRadius} from './world/buildings/geometry.js';
import {roadBuildingTarget,nearestRoad,snapRoadPoint,snap,segmentNearRiver,roadPathBlocked,roadPathIntersectsBuildingFootprint,simplifyRoad,snapToWorldEdge,roadTarget,roadPreview} from './world/roads/placement.js';
import {roadsHaveMeaningfulOverlap,roadsExactlyDuplicate} from './world/roads/intersections.js';
import {cleanupRoadNetwork} from './world/roads/editing.js';
export {riverY,district,WORLD_SIZE,WORLD_HALF_SIZE,WORLD_BOUNDS,WORLD_CONSTRUCTION_MARGIN,WORLD_MARGIN,WORLD_EDGE_SNAP_DISTANCE} from './world/terrain.js';
export {isInsideWorldBounds} from './world/roads/validation.js';
export {dist,length,pointOnRoute};
export {buildingPhysicalPlacementReason,buildingHitbox,buildingAtPoint,nearestBuilding,buildingFootprint,buildingDockPoints,buildingConnectionPoint};
export {roadBuildingTarget,nearestRoad,snapRoadPoint,snap,segmentNearRiver,roadPathBlocked,roadPathIntersectsBuildingFootprint,simplifyRoad,snapToWorldEdge,roadTarget,roadPreview};
import {buildLaneGraph,findLaneRoute,laneRouteToNodePath,laneRouteGeometry} from './laneGraph.js';
import {roadNetwork,nearestGraphNode,bumpRoadNetworkRevision} from './world/roads/topology.js';


export function buildingCost(s,type){const base={Steel:260,Food:220,Parts:320,Market:180,Garage:240,Builder:220,Plastics:420,Glass:500,Electronics:520,Furniture:600,Warehouse:700};return Math.round((base[type.name]||300)*Math.pow(1.12,s.buildings.length))}
export function buildingUnlock(t,s){if(t.unlock&&(s.research?.[t.unlock]||0)<t.unlockLevel)return'Requires '+t.unlock+' research Lv '+t.unlockLevel;const min={Steel:1,Food:1,Parts:2,Market:1,Garage:2,Builder:1,Plastics:1,Glass:2,Electronics:1,Furniture:2,Warehouse:2}[t.name]||1;if(s.companyLevel<min)return'Requires Company Level '+min;return null}
export function canBuild(s,type){const reason=buildingUnlock(type,s);if(reason)return reason;const cap=10+(s.research?.industry||0)*2;if(s.buildings.length>=cap)return'Company building capacity reached ('+cap+')';if(s.cash<buildingCost(s,type))return'Costs £'+buildingCost(s,type);return null}

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





export function roadAttachment(s,building){if(!building)return null;const footprint=buildingFootprint(building);const limit=Math.max(48,Math.hypot(footprint.halfWidth,footprint.halfDepth)+6,(building.r||25)+18);let best=null;for(const road of s.roads||[]){const points=validRoadPoints(road?.points,0);if(!points)continue;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],q=projectSegment(building,a,b);if(q.distance<=limit&&(!best||q.distance<best.distance))best={road,point:{x:q.point.x,y:q.point.y},distance:q.distance,segment:i-1}}}return best}
export function routeOnRoadNetwork(s,a,b){
  const aa=roadAttachment(s,a),bb=roadAttachment(s,b);
  if(!aa||!bb)return null;
  const network=roadNetwork(s,[aa.point,bb.point]);
  const start=nearestGraphNode(network,aa.point),end=nearestGraphNode(network,bb.point);
  if(!start||!end)return null;
  const laneGraph=buildLaneGraph(network,{lanesPerDirection:1});
  const laneResult=findLaneRoute(laneGraph,start,end);
  if(!laneResult)return null;
  const laneNodes=laneRouteToNodePath(laneGraph,laneResult.laneIds);
  if(laneNodes.length<2)return null;
  const routePoints=laneNodes.map(p=>({x:p.x,y:p.y}));
  const laneGeometry=laneRouteGeometry(laneGraph,laneResult.laneIds);
  const lanePoints=laneGeometry.points.length>=2?laneGeometry.points:routePoints;
  const result={path:laneNodes,distance:laneResult.distance,laneIds:laneResult.laneIds};
  // Keep canonical junction coordinates in the returned route even when a
  // graph connection is represented by a virtual endpoint-to-road edge.
  const canonical=network.junctions||[];
  for(const junction of canonical){
    for(let i=1;i<routePoints.length;i++){
      const a=routePoints[i-1],b=routePoints[i],q=projectSegment(junction,a,b);
      if(q.distance>8||q.t<=1e-6||q.t>=1-1e-6)continue;
      routePoints.splice(i,0,{x:junction.x,y:junction.y});
      break;
    }
  }
  return{
    points:routePoints,
    distance:result.distance,
    networkDistance:result.distance,
    laneIds:result.laneIds,
    graphNodeCount:network.nodes.length,
    laneCount:laneGraph.lanes.length,
    lanePoints,
    laneTransitions:laneGeometry.transitions,
    start:{x:aa.point.x,y:aa.point.y},
    end:{x:bb.point.x,y:bb.point.y}
  }
}
function nearestGraphNode(network,p){let best=null,bd=Infinity;for(const n of network.nodes){const d=dist(n,p);if(d<bd){bd=d;best=n}}return best&&bd<=2.5?best:null}
export function roadPath(s,a,b){const start=snap(s,a),end=snap(s,b);if(dist(start,end)<8)return[start,end];const existing=routeOnRoadNetwork(s,start,end);return existing?existing.points:null}
function normalizeRoadEndpoint(s,p){const b=nearestBuilding(s,p);if(!b||dist(b,p)>88)return p;return buildingConnectionPoint(b,p)}














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

export {roadAtPoint,roadSegmentAtPoint,roadEndpointCandidate,roadEndpointAtPoint,endpointTarget,roadEndpointPreview,editRoadSegment,editRoadEndpoint,endpointSegmentBlocked,eraseRoad,cleanupRoadNetwork} from './world/roads/editing.js';
export {roadNetwork,roadTopology,nearestGraphNode,shortestRoadPath,bumpRoadNetworkRevision} from './world/roads/topology.js';
