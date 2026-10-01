import {dist,finitePoint,validRoadPoints,projectSegment,roadPointParameter,addNode} from './geometry.js';
import {roadWithinWorldBounds} from './validation.js';
import {WORLD_BOUNDS,WORLD_MARGIN} from '../terrain.js';
import {buildingFootprint} from '../buildings/buildings.js';
import {buildLaneGraph,findLaneRoute,laneRouteToNodePath,laneRouteGeometry} from '../../laneGraph.js';
import {snap} from './placement.js';

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

export {roadNetwork,roadTopology,roadAttachment,routeOnRoadNetwork,roadPath};
