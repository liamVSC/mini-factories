import {dist,finitePoint,validRoadPoints,projectSegment} from './geometry.js';
import {buildingFootprint} from '../buildings/geometry.js';
import {snap} from './placement.js';
import {roadNetwork,nearestGraphNode} from './topology.js';
import {buildLaneGraph,findLaneRoute,laneRouteToNodePath,laneRouteGeometry} from '../../laneGraph.js';

export function roadAttachment(s,building){
  if(!building)return null;
  const footprint=buildingFootprint(building);
  const limit=Math.max(48,Math.hypot(footprint.halfWidth,footprint.halfDepth)+6,(building.r||25)+18);
  let best=null;
  for(const road of s.roads||[]){
    const points=validRoadPoints(road?.points,0);
    if(!points)continue;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],q=projectSegment(building,a,b);
      if(q.distance<=limit&&(!best||q.distance<best.distance))best={road,point:{x:q.point.x,y:q.point.y},distance:q.distance,segment:i-1};
    }
  }
  return best;
}

export function connectedRoadComponents(network){
  const nodes=network?.nodes||[];
  const adjacency=network?.adjacency||new Map();
  const seen=new Set();
  const components=[];
  for(const start of nodes){
    if(seen.has(start))continue;
    const component=[];
    const queue=[start];
    seen.add(start);
    while(queue.length){
      const node=queue.shift();
      component.push(node);
      for(const link of adjacency.get(node)||[]){
        if(!seen.has(link.node)){seen.add(link.node);queue.push(link.node);}
      }
    }
    components.push(component);
  }
  return components;
}

function componentIndex(network){
  const index=new Map();
  for(const [componentId,component] of connectedRoadComponents(network).entries()){
    for(const node of component)index.set(node,componentId);
  }
  return index;
}

export function isRouteStale(state,route){
  return !route||route.roadNetworkRevision!==Math.max(0,Math.floor(Number(state?.roadNetworkRevision)||0));
}

export function routeOnRoadNetwork(s,a,b){
  const aa=roadAttachment(s,a),bb=roadAttachment(s,b);
  if(!aa||!bb)return null;
  const network=roadNetwork(s,[aa.point,bb.point]);
  const start=nearestGraphNode(network,aa.point),end=nearestGraphNode(network,bb.point);
  if(!start||!end)return null;

  const components=componentIndex(network);
  const startComponent=components.get(start);
  const endComponent=components.get(end);
  if(startComponent===undefined||endComponent===undefined||startComponent!==endComponent)return null;

  const laneGraph=buildLaneGraph(network,{lanesPerDirection:1});
  const laneResult=findLaneRoute(laneGraph,start,end);
  if(!laneResult)return null;
  const laneNodes=laneRouteToNodePath(laneGraph,laneResult.laneIds);
  if(laneNodes.length<2)return null;
  const routePoints=laneNodes.map(p=>({x:p.x,y:p.y}));
  const laneGeometry=laneRouteGeometry(laneGraph,laneResult.laneIds);
  const lanePoints=laneGeometry.points.length>=2?laneGeometry.points:routePoints;
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
    distance:laneResult.distance,
    networkDistance:laneResult.distance,
    laneIds:laneResult.laneIds,
    graphNodeCount:network.nodes.length,
    laneCount:laneGraph.lanes.length,
    lanePoints,
    laneTransitions:laneGeometry.transitions,
    start:{x:aa.point.x,y:aa.point.y},
    end:{x:bb.point.x,y:bb.point.y},
    roadNetworkRevision:Math.max(0,Math.floor(Number(s.roadNetworkRevision)||0)),
    componentId:startComponent
  };
}

export function roadPath(s,a,b){
  if(!finitePoint(a)||!finitePoint(b))return null;
  const start=snap(s,a),end=snap(s,b);
  if(dist(start,end)<8)return[start,end];
  const existing=routeOnRoadNetwork(s,start,end);
  return existing?existing.points:null;
}
