/**
 * Deterministic lane graph derived from the canonical road graph.
 *
 * The road graph remains the authoritative geometric topology. This layer adds
 * directional lanes and lane-to-lane transitions for traffic/pathfinding while
 * keeping the persisted road geometry unchanged.
 */
const EPSILON = 1e-6;

function nodeKey(a,b){ return String(a.id)+':'+String(b.id); }

function vector(a,b){
  const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy)||1;
  return {x:dx/len,y:dy/len};
}

function addUnique(list,value){
  if(!list.includes(value))list.push(value);
}

/**
 * Build two directional lanes for every traversable road edge by default.
 * The lane geometry is intentionally not persisted: it is derived from the
 * road graph, so editing/deleting roads automatically invalidates old graphs.
 */
export function buildLaneGraph(network,{lanesPerDirection=1}={}){
  const nodes = network?.nodes||[];
  const edges = network?.edges||[];
  const lanes = [];
  const lanesById = new Map();
  const outgoing = new Map(nodes.map(n=>[n,[]]));
  const incoming = new Map(nodes.map(n=>[n,[]]));

  for(const edge of edges){
    if(!edge?.a||!edge?.b||!(edge.d>EPSILON))continue;
    const directionAB=vector(edge.a,edge.b);
    const directionBA={x:-directionAB.x,y:-directionAB.y};
    for(let laneIndex=0;laneIndex<Math.max(1,lanesPerDirection);laneIndex++){
      const width=8;
      const lateral=(laneIndex-(Math.max(1,lanesPerDirection)-1)/2)*width;
      const create=(from,to,direction,reverse)=>{
        const id='lane-'+lanes.length;
        const lane={
          id,
          roadId:edge.road?.id||null,
          from,
          to,
          edge,
          laneIndex,
          lateralOffset:lateral,
          direction,
          reverse
        };
        lanes.push(lane);
        lanesById.set(id,lane);
        outgoing.get(from)?.push(lane);
        incoming.get(to)?.push(lane);
      };
      create(edge.a,edge.b,directionAB,false);
      create(edge.b,edge.a,directionBA,true);
    }
  }

  const adjacency=new Map(lanes.map(lane=>[lane.id,[]]));
  const transitions=new Map(lanes.map(lane=>[lane.id,[]]));
  for(const lane of lanes){
    const candidates=outgoing.get(lane.to)||[];
    for(const next of candidates){
      // Do not create an immediate U-turn as a normal through movement.
      // Traffic can still reverse through a future explicit turn command.
      if(next.to===lane.from&&next.roadId===lane.roadId)continue;
      addUnique(adjacency.get(lane.id),next.id);
      transitions.get(lane.id)?.push({toLaneId:next.id,...turnInfo(lane,next)});
    }
  }

  return {nodes,edges,lanes,lanesById,outgoing,incoming,adjacency,transitions};
}

function shortestLanePath(graph,startNode,endNode){
  const starts=graph.outgoing.get(startNode)||[];
  if(startNode===endNode)return{laneIds:[],distance:0};
  if(!starts.length)return null;

  const queue=[];
  const best=new Map();
  const prev=new Map();

  for(const lane of starts){
    const d=lane.edge?.d||0;
    if(d<(best.get(lane.id)??Infinity)){
      best.set(lane.id,d);
      prev.set(lane.id,null);
      queue.push({lane,d});
    }
  }

  while(queue.length){
    queue.sort((a,b)=>a.d-b.d);
    const current=queue.shift();
    if(current.d!==(best.get(current.lane.id)??Infinity))continue;
    if(current.lane.to===endNode){
      const ids=[];
      let id=current.lane.id;
      while(id){ids.unshift(id);id=prev.get(id)}
      return{laneIds:ids,distance:current.d};
    }
    for(const nextId of graph.adjacency.get(current.lane.id)||[]){
      const next=graph.lanesById.get(nextId);
      if(!next)continue;
      const nd=current.d+(next.edge?.d||0);
      if(nd<(best.get(next.id)??Infinity)){
        best.set(next.id,nd);
        prev.set(next.id,current.lane.id);
        queue.push({lane:next,d:nd});
      }
    }
  }
  return null;
}

export function findLaneRoute(graph,startNode,endNode){
  return shortestLanePath(graph,startNode,endNode);
}

/**
 * Return the canonical road-node sequence represented by a lane route.
 * Geometry stays centred on the road; the renderer can apply the existing
 * visual lane offset without double-offsetting the route itself.
 */
export function laneRouteToNodePath(graph,laneIds){
  if(!laneIds?.length)return[];
  const result=[];
  for(const id of laneIds){
    const lane=graph.lanesById.get(id);
    if(!lane)continue;
    if(!result.length)result.push(lane.from);
    result.push(lane.to);
  }
  return result;
}


function turnInfo(fromLane,toLane){
  if(!fromLane||!toLane)return{type:'straight',angle:0};
  const incoming=fromLane.direction;
  const outgoing=toLane.direction;
  const dot=Math.max(-1,Math.min(1,incoming.x*outgoing.x+incoming.y*outgoing.y));
  const cross=incoming.x*outgoing.y-incoming.y*outgoing.x;
  const angle=Math.atan2(cross,dot);
  if(Math.abs(angle)<0.35)return{type:'straight',angle};
  if(Math.abs(angle)>2.45)return{type:'uturn',angle};
  return{type:angle>0?'left':'right',angle};
}

function laneOffsetForTurn(type){
  // Left-hand traffic: keep turning traffic on the appropriate side of the
  // carriageway while retaining the canonical road centreline as the source
  // of truth. One directional lane can therefore behave as a virtual
  // turn/through lane without changing persisted road geometry.
  if(type==='left')return 7;
  if(type==='right')return -7;
  return 0;
}

function addSample(list,p){
  const q={x:Number(p.x),y:Number(p.y)};
  const last=list.at(-1);
  if(!last||Math.hypot(last.x-q.x,last.y-q.y)>.25)list.push(q);
}

function quadratic(a,c,b,t){
  const u=1-t;
  return{
    x:u*u*a.x+2*u*t*c.x+t*t*b.x,
    y:u*u*a.y+2*u*t*c.y+t*t*b.y
  };
}

/**
 * Build physical lane-position geometry for a lane route. The returned
 * points are render/simulation geometry only; persisted roads stay canonical.
 *
 * Each junction transition gets:
 * - a short lane-change approach,
 * - a turn-specific lateral offset,
 * - a curved connector through the junction,
 * - a smooth return to the normal lane centre after the turn.
 */
export function laneRouteGeometry(graph,laneIds,{approachDistance=34,turnRadius=18,samples=5}={}){
  if(!Array.isArray(laneIds)||!laneIds.length)return{points:[],transitions:[]};
  const lanes=laneIds.map(id=>graph.lanesById.get(id)).filter(Boolean);
  if(!lanes.length)return{points:[],transitions:[]};

  const transitions=[];
  for(let i=0;i<lanes.length-1;i++){
    const turn=turnInfo(lanes[i],lanes[i+1]);
    transitions.push({
      fromLaneId:lanes[i].id,
      toLaneId:lanes[i+1].id,
      junction:lanes[i].to,
      ...turn,
      offset:laneOffsetForTurn(turn.type)
    });
  }

  const points=[];
  for(let i=0;i<lanes.length;i++){
    const lane=lanes[i];
    const edgeA=lane.from,edgeB=lane.to;
    const dx=edgeB.x-edgeA.x,dy=edgeB.y-edgeA.y,len=Math.hypot(dx,dy)||1;
    const nx=-dy/len,ny=dx/len;
    const transitionIn=transitions[i-1]||null;
    const transitionOut=transitions[i]||null;
    const offsetIn=transitionIn?.offset||0;
    const offsetOut=transitionOut?.offset||0;
    const startOffset=i===0?lane.lateralOffset:offsetIn;
    const endOffset=i===lanes.length-1?lane.lateralOffset:offsetOut;
    const usable=Math.min(approachDistance,len*.42);
    const steps=Math.max(2,Math.ceil(len/18));

    for(let s=0;s<=steps;s++){
      const t=s/steps;
      let offset=startOffset+(endOffset-startOffset)*t;
      // Do not force the turn offset over the whole edge. It is a lane-change
      // target near the junction, keeping long roads visually centred.
      if(i>0&&t<0.28){
        const u=t/.28;
        offset=lane.lateralOffset+(startOffset-lane.lateralOffset)*u;
      }
      if(i<lanes.length-1&&t>.72){
        const u=(t-.72)/.28;
        offset=lane.lateralOffset+(endOffset-lane.lateralOffset)*u;
      }
      addSample(points,{x:edgeA.x+dx*t+nx*offset,y:edgeA.y+dy*t+ny*offset});
    }

    if(i<lanes.length-1){
      const next=lanes[i+1];
      const nDx=next.to.x-next.from.x,nDy=next.to.y-next.from.y,nLen=Math.hypot(nDx,nDy)||1;
      const nNx=-nDy/nLen,nNy=nDx/nLen;
      const transition=transitions[i];
      const radius=Math.min(turnRadius,len*.22,nLen*.22);
      const incoming={x:lane.to.x-nx*transition.offset,y:lane.to.y-ny*transition.offset};
      const outgoing={x:next.from.x+nNx*transition.offset,y:next.from.y+nNy*transition.offset};
      const control={x:lane.to.x,y:lane.to.y};
      const curveSteps=Math.max(3,samples+Math.ceil(radius/5));
      for(let k=1;k<=curveSteps;k++)addSample(points,quadratic(incoming,control,outgoing,k/curveSteps));
    }
  }
  return{points,transitions};
}

export function laneAtProgress(graph,laneIds,index=0){
  const id=laneIds?.[Math.max(0,Math.min(laneIds.length-1,index))];
  return id?graph.lanesById.get(id)||null:null;
}
