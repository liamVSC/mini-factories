/**
 * Derived per-junction traffic-control model.
 *
 * Road geometry and lane graph remain authoritative. Junction controls are
 * derived from them and are never persisted as topology.
 */
function keyForNode(node){
  return `${Math.round(node.x*10)/10},${Math.round(node.y*10)/10}`;
}

function dot(a,b){return a.x*b.x+a.y*b.y}
function cross(a,b){return a.x*b.y-a.y*b.x}
function classifyMovement(fromLane,toLane){
  const angle=Math.atan2(cross(fromLane.direction,toLane.direction),dot(fromLane.direction,toLane.direction));
  if(Math.abs(angle)<0.35)return'straight';
  if(Math.abs(angle)>2.45)return'uturn';
  return angle>0?'left':'right';
}

function approachKey(lane){
  return lane?.id||'unknown';
}

function movementId(fromLane,toLane){
  return `${fromLane.id}->${toLane.id}`;
}

function buildMovement(fromLane,toLane){
  const type=classifyMovement(fromLane,toLane);
  const junction=fromLane.to;
  const approachDirection={x:-fromLane.direction.x,y:-fromLane.direction.y};
  return{
    id:movementId(fromLane,toLane),
    junctionId:keyForNode(junction),
    junction:{x:junction.x,y:junction.y},
    incomingLaneId:fromLane.id,
    outgoingLaneId:toLane.id,
    roadId:fromLane.roadId,
    outgoingRoadId:toLane.roadId,
    type,
    approachDirection,
    stopLineDistance:type==='uturn'?24:30,
    conflictZoneDistance:type==='uturn'?20:18
  };
}

function conflicts(a,b){
  if(!a||!b||a.id===b.id)return false;
  if(a.junctionId!==b.junctionId)return false;
  if(a.incomingLaneId===b.incomingLaneId)return false;
  // Same outgoing lane cannot be occupied by two incompatible movements.
  if(a.outgoingLaneId===b.outgoingLaneId)return true;
  // Opposing straight movements can proceed simultaneously.
  if(a.type==='straight'&&b.type==='straight'){
    const opposing=dot(a.approachDirection,b.approachDirection)<-.7;
    if(opposing)return false;
  }
  // Same-direction movements from the same approach are compatible.
  if(dot(a.approachDirection,b.approachDirection)>.7)return false;
  // A right turn in left-hand traffic is the crossing movement and therefore
  // conflicts with the through/turning movements it cuts across.
  return true;
}

function phaseAxis(movement){
  const x=Math.abs(movement?.approachDirection?.x||0);
  const y=Math.abs(movement?.approachDirection?.y||0);
  return x>=y?'horizontal':'vertical';
}

export function buildJunctionControls(network,laneGraph){
  const controls=new Map();
  for(const node of network?.nodes||[]){
    const incoming=laneGraph?.incoming?.get(node)||[];
    const outgoing=laneGraph?.outgoing?.get(node)||[];
    const movements=[];
    const byId=new Map();
    for(const fromLane of incoming){
      for(const toLane of outgoing){
        if(fromLane.to!==node||toLane.from!==node)continue;
        const transition=laneGraph.transitions?.get(fromLane.id)?.find(t=>t.toLaneId===toLane.id);
        if(!transition)continue;
        const movement=buildMovement(fromLane,toLane);
        movement.turn=transition.type;
        movements.push(movement);
        byId.set(movement.id,movement);
      }
    }
    if(!movements.length)continue;
    const conflictMap=new Map();
    for(const movement of movements){
      conflictMap.set(movement.id,movements.filter(other=>conflicts(movement,other)).map(other=>other.id));
    }
    controls.set(keyForNode(node),{
      id:keyForNode(node),
      node:{x:node.x,y:node.y},
      approaches:[...new Set(incoming.map(approachKey))],
      movements,
      byId,
      conflicts:conflictMap
    });
  }
  return controls;
}

export function getJunctionControl(controls,node){
  return controls?.get(keyForNode(node))||null;
}

export function getMovementControl(controls,node,incomingLaneId,outgoingLaneId){
  const control=getJunctionControl(controls,node);
  return control?.byId?.get(`${incomingLaneId}->${outgoingLaneId}`)||null;
}

export function signalForMovement(state,control,movement){
  if(!state?.trafficSignals?.enabled||!control||!movement)return{state:'priority',blocked:false,axis:null};
  const cycle=Math.max(8,Number(state.trafficSignals.cycle)||12);
  let hash=0;
  for(const char of control.id)hash=(hash*31+char.charCodeAt(0))>>>0;
  const elapsed=((state.trafficClock||0)+(hash%1000)/1000*cycle)%cycle;
  const half=cycle/2;
  const yellow=Math.min(1.5,cycle*.1);
  const inYellow=(elapsed%half)>half-yellow;
  const activeAxis=elapsed<half?'horizontal':'vertical';
  const axis=phaseAxis(movement);
  const allowed=axis===activeAxis;
  return{
    state:allowed?(inYellow?'yellow':'green'):'red',
    blocked:!allowed||inYellow,
    axis
  };
}

export function movementPermission(state,controls,node,movement,{occupiedIds=[],priority='arrival'}={}){
  const control=getJunctionControl(controls,node);
  if(!control||!movement)return{allowed:true,reason:'no-control'};
  const signal=signalForMovement(state,control,movement);
  if(signal.blocked)return{allowed:false,reason:signal.state,signal};
  if(priority==='signal-only')return{allowed:true,reason:'green',signal};

  const occupied=new Set(occupiedIds);
  for(const id of control.conflicts.get(movement.id)||[]){
    if(occupied.has(id))return{allowed:false,reason:'conflict',signal};
  }
  return{allowed:true,reason:'priority',signal};
}

export function laneIndexForJunction(laneGraph,laneIds,node){
  if(!Array.isArray(laneIds)||!node)return -1;
  for(let i=0;i<laneIds.length-1;i++){
    const lane=laneGraph?.lanesById?.get(laneIds[i]);
    if(lane?.to===node)return i;
  }
  return -1;
}

export function movementForLaneRoute(laneGraph,controls,laneIds,index=0){
  if(!Array.isArray(laneIds)||index<0||index>=laneIds.length-1)return null;
  const from=laneGraph.lanesById.get(laneIds[index]);
  const to=laneGraph.lanesById.get(laneIds[index+1]);
  if(!from||!to)return null;
  return getMovementControl(controls,from.to,from.id,to.id);
}

export function stopLinePoint(laneGraph,movement){
  const lane=laneGraph?.lanesById?.get(movement?.incomingLaneId);
  if(!lane)return null;
  const p=lane.from,q=lane.to;
  const dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1;
  const distance=Math.min(movement.stopLineDistance,len*.45);
  return{x:q.x-dx/len*distance,y:q.y-dy/len*distance};
}

export function movementConflictIds(controls,node,movementId){
  const control=getJunctionControl(controls,node);
  return control?.conflicts?.get(movementId)||[];
}

export function serializeJunctionControlSummary(controls){
  return [...(controls?.values()||[])].map(control=>({
    id:control.id,
    node:{...control.node},
    approaches:[...control.approaches],
    movements:control.movements.map(m=>({
      id:m.id,type:m.type,incomingLaneId:m.incomingLaneId,outgoingLaneId:m.outgoingLaneId,
      stopLineDistance:m.stopLineDistance,conflictZoneDistance:m.conflictZoneDistance
    }))
  }));
}
