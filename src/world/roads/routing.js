import {dist,finitePoint,projectSegment} from './geometry.js';
import {buildingRoadAttachment} from '../buildings/connections.js';
import {buildingPrimaryDock,buildingRoadEntrance} from '../buildings/geometry.js';
import {snap} from './placement.js';
import {roadNetwork,nearestGraphNode} from './topology.js';
import {buildLaneGraph,findLaneRoute,laneRouteToNodePath,laneRouteGeometry} from '../../laneGraph.js';

export {buildingRoadAttachment as roadAttachment};

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

/**
 * Validate both the route revision and the persisted road references behind
 * its derived lane IDs. A matching revision alone is not enough for routes
 * loaded from older/hand-built state where lane references may be incomplete.
 */
export function routeNetworkValid(state,route){
  if(isRouteStale(state,route))return false;
  if(!Array.isArray(route.laneIds)||!route.laneIds.length)return false;
  if(!Array.isArray(route.laneRoadIds)||route.laneRoadIds.length!==route.laneIds.length)return false;
  const roadIds=new Set((state?.roads||[]).map(road=>road?.id).filter(Boolean));
  return route.laneRoadIds.every(id=>roadIds.has(id));
}

export function routeOnRoadNetwork(s,a,b){
  const aa=buildingRoadAttachment(s,a),bb=buildingRoadAttachment(s,b);
  if(!aa||!bb)return null;
  // Include the canonical yard gates as explicit graph attachment points.
  // Roads therefore meet the site at the gate, while the truck route can continue
  // through the private yard to the actual loading dock.
  const network=roadNetwork(s,[aa.point,bb.point]);
  const start=nearestGraphNode(network,aa.point),end=nearestGraphNode(network,bb.point);
  if(!start||!end)return null;

  const components=componentIndex(network);
  const startComponent=components.get(start);
  const endComponent=components.get(end);
  if(startComponent===undefined||endComponent===undefined||startComponent!==endComponent)return null;

  const laneGraph=buildLaneGraph(network,{lanesPerDirection:2});
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
  const yardPath=(building,fromGateToDock=false)=>{
    const dock=buildingPrimaryDock(building);
    const entrance=buildingRoadEntrance(building);
    if(!dock||!entrance)return [];
    const turnX=dock.point.x+((dock.normal?.y||0)>0?48:-48);
    const midY=(entrance.y+dock.approach.y)/2;
    const turn={x:turnX,y:midY};
    return fromGateToDock
      ?[{x:entrance.x,y:entrance.y},turn,{x:dock.approach.x,y:dock.approach.y}]
      :[{x:dock.approach.x,y:dock.approach.y},turn,{x:entrance.x,y:entrance.y}];
  };
  const startYard=yardPath(a,true);
  const endYard=yardPath(b,false);
  const combined=[...startYard,...routePoints,...endYard];
  const combinedPoints=combined.filter((p,i)=>i===0||dist(p,combined[i-1])>.01);
  const yardDistance=length(combinedPoints)-length(routePoints);
  return{
    points:combinedPoints,
    distance:Math.max(0,laneResult.distance+yardDistance),
    networkDistance:laneResult.distance,
    yardDistance:Math.max(0,yardDistance),
    laneIds:laneResult.laneIds,
    laneRoadIds:laneResult.laneIds.map(id=>laneGraph.lanesById.get(id)?.roadId||null),
    graphNodeCount:network.nodes.length,
    laneCount:laneGraph.lanes.length,
    lanePoints,
    laneTransitions:laneGeometry.transitions,
    start:{x:aa.point.x,y:aa.point.y},
    end:{x:bb.point.x,y:bb.point.y},
    startYard:startYard.map(p=>({...p})),
    endYard:endYard.map(p=>({...p})),
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
