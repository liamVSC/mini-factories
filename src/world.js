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
export function nearestBuilding(s,p){return buildingAtPoint(s,p,18)}
const ROAD_BUILDING_SNAP_TOLERANCE=46;
function projectOnPolyline(points,p){let best=null,run=0;for(let i=1;i<points.length;i++){const q=projectSegment(p,points[i-1],points[i]);if(!best||q.distance<best.distance)best={...q,segment:i-1,along:run+dist(points[i-1],q.point)};run+=dist(points[i-1],points[i])}return best}
function buildingFootprintRadius(building){
  const footprint=buildingFootprint(building);
  return Math.max(26,(building?.r||25)+9,Math.min(footprint.halfWidth,footprint.halfDepth));
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
function endpointSegmentBlocked(building,a,b,side){if(!building)return false;const ax=a.x-building.x,ay=a.y-building.y,bx=b.x-building.x,by=b.y-building.y,aRadius=Math.hypot(ax,ay),bRadius=Math.hypot(bx,by);const outward=side==='start'?ax*(b.x-a.x)+ay*(b.y-a.y):bx*(a.x-b.x)+by*(a.y-b.y);const connectionRadius=buildingFootprintRadius(building);const outside=side==='start'?aRadius>=connectionRadius-.001:bRadius>=connectionRadius-.001;return outside&&outward<0}
function segmentIntersection(a,b,c,d){const ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},cross=(u,v)=>u.x*v.y-u.y*v.x,den=cross(ab,cd),ac={x:c.x-a.x,y:c.y-a.y};if(Math.abs(den)<1e-9)return null;const t=cross(ac,cd)/den,u=cross(ac,ab)/den;if(t<-.000001||t>1.000001||u<-.000001||u>1.000001)return null;return{x:a.x+ab.x*t,y:a.y+ab.y*t,t,u}}
function addNode(nodes,p,tolerance=2.5){let n=nodes.find(x=>dist(x,p)<tolerance);if(!n){n={x:p.x,y:p.y};nodes.push(n)}return n}
function roadPointParameter(a,b,p){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)return 0;return Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l))}
export function roadNetwork(s,extraPoints=[]){
  const valid=(s.roads||[]).map(r=>({...r,points:validRoadPoints(r?.points,0)})).filter(r=>r.points?.length>=2&&roadWithinWorldBounds(r.points));
  const nodes=[],edges=[],marks=new Map(),virtualEdges=[];
  for(const road of valid){
    const segments=road.points.slice(1).map(()=>[]);
    marks.set(road,segments);
    for(let i=1;i<road.points.length;i++){
      segments[i-1].push(addNode(nodes,road.points[i-1]));
      segments[i-1].push(addNode(nodes,road.points[i]));
    }
  }
  for(let ri=0;ri<valid.length;ri++){
    const aRoad=valid[ri];
    for(let qi=ri;qi<valid.length;qi++){
      const bRoad=valid[qi];
      for(let i=1;i<aRoad.points.length;i++){
        const a=aRoad.points[i-1],b=aRoad.points[i],first=aRoad===bRoad?i:1;
        for(let j=first;j<bRoad.points.length;j++){
          if(aRoad===bRoad&&i===j)continue;
          const hit=segmentIntersection(a,b,bRoad.points[j-1],bRoad.points[j]);
          if(!hit)continue;
          const n=addNode(nodes,hit);
          marks.get(aRoad)[i-1].push(n);
          marks.get(bRoad)[j-1].push(n);
        }
      }
    }
  }
  // Treat near-touching endpoints as real graph connections without moving
  // persisted geometry. These are virtual graph edges: the visual road stays
  // exactly where the player placed it, while routing can still traverse the
  // small connection gap.
  const junctionTolerance=6;
  const connectEndpoint=(road,index,node)=>{
    const endpoint=addNode(nodes,road.points[index],.5);
    const d=dist(endpoint,node);
    if(d>.001)virtualEdges.push({a:endpoint,b:node,d,road});
  };
  for(let ri=0;ri<valid.length;ri++)for(let qi=ri;qi<valid.length;qi++){
    const aRoad=valid[ri],bRoad=valid[qi];
    const aEnds=[{index:0,point:aRoad.points[0]},{index:aRoad.points.length-1,point:aRoad.points.at(-1)}];
    const bEnds=[{index:0,point:bRoad.points[0]},{index:bRoad.points.length-1,point:bRoad.points.at(-1)}];
    if(aRoad===bRoad)continue;

    for(const aEnd of aEnds)for(const bEnd of bEnds){
      if(dist(aEnd.point,bEnd.point)>junctionTolerance)continue;
      const n=addNode(nodes,{x:(aEnd.point.x+bEnd.point.x)/2,y:(aEnd.point.y+bEnd.point.y)/2},.5);
      connectEndpoint(aRoad,aEnd.index,n);
      connectEndpoint(bRoad,bEnd.index,n);
    }

    const attachEndpointToRoad=(end,road)=>{
      for(let j=1;j<road.points.length;j++){
        const q=projectSegment(end.point,road.points[j-1],road.points[j]);
        if(q.distance>junctionTolerance)continue;
        const n=addNode(nodes,q.point,.5);
        connectEndpoint(end===null?road: aRoad,end?.index??0,n);
      }
    };

    for(const aEnd of aEnds){
      for(let j=1;j<bRoad.points.length;j++){
        const q=projectSegment(aEnd.point,bRoad.points[j-1],bRoad.points[j]);
        if(q.distance>junctionTolerance)continue;
        const n=addNode(nodes,q.point,.5);
        connectEndpoint(aRoad,aEnd.index,n);
        marks.get(bRoad)[j-1].push(n);
      }
    }
    for(const bEnd of bEnds){
      for(let i=1;i<aRoad.points.length;i++){
        const q=projectSegment(bEnd.point,aRoad.points[i-1],aRoad.points[i]);
        if(q.distance>junctionTolerance)continue;
        const n=addNode(nodes,q.point,.5);
        connectEndpoint(bRoad,bEnd.index,n);
        marks.get(aRoad)[i-1].push(n);
      }
    }
  }
  for(const p of extraPoints||[]){if(!finitePoint(p))continue;let best=null;for(const road of valid)for(let i=1;i<road.points.length;i++){const q=projectSegment(p,road.points[i-1],road.points[i]);if(!best||q.distance<best.distance)best={road,segment:i-1,point:q.point,distance:q.distance}}if(best){const n=addNode(nodes,best.point);marks.get(best.road)[best.segment].push(n)}}
  for(const road of valid)for(let i=0;i<road.points.length-1;i++){
    const a=road.points[i],b=road.points[i+1];
    const list=[...new Set(marks.get(road)[i])].sort((u,v)=>roadPointParameter(a,b,u)-roadPointParameter(a,b,v));
    for(let j=1;j<list.length;j++){const u=list[j-1],v=list[j],d=dist(u,v);if(d>0.5)edges.push({a:u,b:v,d,road});}
  }
  for(const edge of virtualEdges)if(edge.d>.001)edges.push(edge);
  const nodeIds=new Map(nodes.map((node,index)=>[node,index]));
  const uniqueEdges=[];
  const edgeKeys=new Set();
  for(const edge of edges){
    if(!edge?.a||!edge?.b||edge.d<=.001)continue;
    const ai=nodeIds.get(edge.a),bi=nodeIds.get(edge.b);
    if(ai===undefined||bi===undefined||ai===bi)continue;
    const lo=Math.min(ai,bi),hi=Math.max(ai,bi),roadId=edge.road?.id||'road';
    const key=lo+':'+hi+':'+roadId;
    if(edgeKeys.has(key))continue;
    edgeKeys.add(key);
    uniqueEdges.push(edge);
  }
  edges.length=0;
  edges.push(...uniqueEdges);
  const adjacency=new Map(nodes.map(n=>[n,[]]));
  for(const e of edges){
    adjacency.get(e.a).push({node:e.b,d:e.d,road:e.road});
    adjacency.get(e.b).push({node:e.a,d:e.d,road:e.road});
  }
  const junctions=nodes.filter(n=>(adjacency.get(n)?.length||0)>=3);
  return{nodes,edges,adjacency,junctions}
}
export function roadTopology(s){
  const network=roadNetwork(s);
  const boundaryMinX=WORLD_BOUNDS.minX+WORLD_MARGIN;
  const boundaryMaxX=WORLD_BOUNDS.maxX-WORLD_MARGIN;
  const boundaryMinY=WORLD_BOUNDS.minY+WORLD_MARGIN;
  const boundaryMaxY=WORLD_BOUNDS.maxY-WORLD_MARGIN;
  const boundaryTolerance=3;
  const topologyNodes=network.nodes.map((node,index)=>{
    const links=network.adjacency.get(node)||[];
    const roadIds=[...new Set(links.map(link=>link.road?.id).filter(Boolean))];
    const degree=links.length;
    const boundary=Math.abs(node.x-boundaryMinX)<=boundaryTolerance||Math.abs(node.x-boundaryMaxX)<=boundaryTolerance||Math.abs(node.y-boundaryMinY)<=boundaryTolerance||Math.abs(node.y-boundaryMaxY)<=boundaryTolerance;
    const junction=degree>=3;
    return{
      id:index,
      x:node.x,
      y:node.y,
      degree,
      roadIds,
      boundary,
      junction,
      type:junction?(boundary?'boundary-junction':'junction'):(boundary?'boundary':degree===1?'endpoint':'node')
    };
  });
  const junctions=topologyNodes.filter(node=>node.junction);
  return{
    ...network,
    topologyNodes,
    topologyJunctions:junctions,
    boundaryNodes:topologyNodes.filter(node=>node.boundary),
    threeWayJunctions:junctions.filter(node=>node.degree===3),
    fourWayJunctions:junctions.filter(node=>node.degree>=4)
  };
}
function shortestRoadPath(network,a,b){const queue=[{node:a,d:0}],best=new Map([[a,0]]),prev=new Map();while(queue.length){queue.sort((x,y)=>x.d-y.d);const cur=queue.shift();if(cur.d!==best.get(cur.node))continue;if(cur.node===b)break;for(const nx of network.adjacency.get(cur.node)||[]){const nd=cur.d+nx.d;if(nd<(best.get(nx.node)??Infinity)){best.set(nx.node,nd);prev.set(nx.node,cur.node);queue.push({node:nx.node,d:nd})}}}if(!best.has(b))return null;const path=[];let n=b;while(n){path.unshift(n);n=prev.get(n)}return{path,distance:best.get(b)}}
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
function roadDistance(a,b){const ap=a?.points||a,bp=b?.points||b;if(!Array.isArray(ap)||!Array.isArray(bp)||ap.length<2||bp.length<2)return Infinity;let best=Infinity;for(let i=1;i<ap.length;i++){const pa=ap[i-1],pb=ap[i];for(let j=1;j<bp.length;j++){const pc=bp[j-1],pd=bp[j];best=Math.min(best,projectSegment(pa,pc,pd).distance,projectSegment(pb,pc,pd).distance,projectSegment(pc,pa,pb).distance,projectSegment(pd,pa,pb).distance)}}return best}
function pointSegmentDistance(p,a,b){return projectSegment(p,a,b).distance}
function normalizeRoadEndpoint(s,p){const b=nearestBuilding(s,p);if(!b||dist(b,p)>88)return p;return buildingConnectionPoint(b,p)}
function cleanRoadPoints(points){return validRoadPoints(points,0)||[]}
function segmentNearRiver(a,b,threshold=45){const span=Math.max(1,dist(a,b)),samples=Math.max(3,Math.ceil(span/24));for(let i=0;i<=samples;i++){const t=i/samples,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(Math.abs(y-riverY(x))<threshold)return true}return false}
){
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
){
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

){const obstacles=(s.buildings||[]).filter(b=>b!==endpointBuildings.start&&b!==endpointBuildings.end);if(!obstacles.length)return null;const xs=[start.x,end.x],ys=[start.y,end.y];for(const b of obstacles){const clearance=(b.r||25)+18;xs.push(b.x-clearance,b.x+clearance);ys.push(b.y-clearance,b.y+clearance)}const uniq=a=>[...new Set(a.map(v=>Math.round(v*10)/10))].sort((a,b)=>a-b),xvals=uniq(xs),yvals=uniq(ys),nodes=[],byKey=new Map(),key=(x,y)=>x+','+y;for(const x of xvals)for(const y of yvals){const p={x,y};if(roadPathBlocked(s,[p,p],endpointBuildings))continue;const n={x,y,edges:[]};nodes.push(n);byKey.set(key(x,y),n)}const clearSegment=(a,b)=>!roadPathBlocked(s,[a,b],endpointBuildings);for(const y of yvals){const row=nodes.filter(n=>n.y===y).sort((a,b)=>a.x-b.x);for(let i=1;i<row.length;i++){const a=row[i-1],b=row[i];if(clearSegment(a,b)){const d=dist(a,b);a.edges.push({node:b,d});b.edges.push({node:a,d})}}}for(const x of xvals){const col=nodes.filter(n=>n.x===x).sort((a,b)=>a.y-b.y);for(let i=1;i<col.length;i++){const a=col[i-1],b=col[i];if(clearSegment(a,b)){const d=dist(a,b);a.edges.push({node:b,d});b.edges.push({node:a,d})}}}const startNode={x:start.x,y:start.y,edges:[]},endNode={x:end.x,y:end.y,edges:[]},attach=(p,node)=>{for(const n of nodes){if(n.x===p.x&&n.y===p.y)continue;const d=dist(p,n);if(p.x===n.x||p.y===n.y)if(clearSegment(p,n))node.edges.push({node:n,d})}};attach(start,startNode);attach(end,endNode);nodes.push(startNode,endNode);const queue=[{node:startNode,d:0}],best=new Map([[startNode,0]]),prev=new Map();while(queue.length){queue.sort((a,b)=>a.d-b.d);const cur=queue.shift();if(cur.d!==best.get(cur.node))continue;if(cur.node===endNode)break;for(const e of cur.node.edges){const nd=cur.d+e.d;if(nd<(best.get(e.node)??Infinity)){best.set(e.node,nd);prev.set(e.node,cur.node);queue.push({node:e.node,d:nd})}}}if(!best.has(endNode))return null;const path=[];let n=endNode;while(n){path.unshift({x:n.x,y:n.y});n=prev.get(n)}return simplifyRoad(path)}
){const obstacles=(s.buildings||[]).filter(b=>b!==endpointBuildings.start&&b!==endpointBuildings.end),candidates=candidateRoadPaths(start,end,obstacles).map(simplifyRoad),routed=orthogonalObstaclePath(s,start,end,endpointBuildings);if(routed)candidates.push(routed);const clear=candidates.filter(path=>!roadPathBlocked(s,path,endpointBuildings));if(clear.length)return clear.sort((a,b)=>length(a)+routeBendPenalty(a)-(length(b)+routeBendPenalty(b)))[0];return null}
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
function collinearOverlapLength(a,b,c,d){const ab={x:b.x-a.x,y:b.y-a.y},len=Math.hypot(ab.x,ab.y);if(len<1e-9)return 0;const cross=(p,q)=>p.x*q.y-p.y*q.x,ac={x:c.x-a.x,y:c.y-a.y},ad={x:d.x-a.x,y:d.y-a.y};if(Math.abs(cross(ab,ac))>1e-6*len||Math.abs(cross(ab,ad))>1e-6*len)return 0;const ux=ab.x/len,uy=ab.y/len,cproj=ac.x*ux+ac.y*uy,dproj=ad.x*ux+ad.y*uy;return Math.max(0,Math.min(len,Math.max(cproj,dproj))-Math.max(0,Math.min(cproj,dproj)))}
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
function segmentDistance(a,b,c,d){const cross=(u,v)=>u.x*v.y-u.y*v.x,ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},ac={x:c.x-a.x,y:c.y-a.y},den=cross(ab,cd);if(Math.abs(den)>1e-9){const t=cross(ac,cd)/den,u=cross(ac,ab)/den;if(t>=0&&t<=1&&u>=0&&u<=1)return 0}return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b))}
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
