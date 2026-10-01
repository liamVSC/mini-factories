import {TYPES} from './core/types.js';
import {newId} from './core/ids.js';

import {dist,length,pointOnRoute,routeOnRoadNetwork,roadAttachment,roadNetwork} from './world/roads/index.js';
import {buildLaneGraph} from './laneGraph.js';
import {buildJunctionControls,laneIndexForJunction,movementForLaneRoute,movementPermission,stopLinePoint} from './junctionControl.js';

export function spec(type){return TYPES.find(t=>t.name===type)||TYPES[0]}

function nearestPointOnRoad(road,p){let best=null,bd=Infinity;for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],q={x:a.x,y:a.y};const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)continue;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));q.x=a.x+dx*t;q.y=a.y+dy*t;const d=dist(p,q);if(d<bd){bd=d;best=q}}return best}
function pointSegmentDistance(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
  if(!len2)return dist(p,a);
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len2));
  return dist(p,{x:a.x+dx*t,y:a.y+dy*t});
}
function touches(r,b){
  for(let i=1;i<r.points.length;i++)if(pointSegmentDistance(b,r.points[i-1],r.points[i])<b.r+34)return true;
  return false;
}
function segmentDistance(a,b,c,d){
  const cross=(u,v)=>u.x*v.y-u.y*v.x;
  const ab={x:b.x-a.x,y:b.y-a.y};
  const cd={x:d.x-c.x,y:d.y-c.y};
  const ac={x:c.x-a.x,y:c.y-a.y};
  const den=cross(ab,cd);
  if(Math.abs(den)>1e-9){
    const t=cross(ac,cd)/den;
    const u=cross(ac,ab)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
  }
  return Math.min(
    pointSegmentDistance(a,c,d),
    pointSegmentDistance(b,c,d),
    pointSegmentDistance(c,a,b),
    pointSegmentDistance(d,a,b)
  );
}
function roadDistance(a,b){
  let best=Infinity;
  for(let i=1;i<a.points.length;i++){
    for(let j=1;j<b.points.length;j++){
      best=Math.min(best,segmentDistance(a.points[i-1],a.points[i],b.points[j-1],b.points[j]));
    }
  }
  return best;
}

function oriented(points,from,to){
  const a=dist(points[0],from),b=dist(points.at(-1),from);
  const out=a<=b?[...points]:[...points].reverse();
  if(dist(out.at(-1),to)>dist(out[0],to))out.reverse();
  return out;
}

function projectRouteProgress(points,p){
  if(!Array.isArray(points)||points.length<2)return null;
  let total=length(points),run=0,best=null;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
    if(!len2)continue;
    const u=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len2));
    const q={x:a.x+dx*u,y:a.y+dy*u};
    const d=dist(p,q);
    if(!best||d<best.distance)best={distance:d,progress:(run+Math.sqrt(len2)*u)/total,segmentIndex:i};
    run+=Math.sqrt(len2);
  }
  return best;
}

export function route(s,a,b){
  if(!roadAttachment(s,a)||!roadAttachment(s,b))return null;
  const r=routeOnRoadNetwork(s,a,b);
  if(!r||!Array.isArray(r.points)||r.points.length<2)return null;
  return r;
}

function segmentHit(a,b,c,d){
  const ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y};
  const cross=(u,v)=>u.x*v.y-u.y*v.x;
  const den=cross(ab,cd);
  if(Math.abs(den)<1e-8)return null;
  const ac={x:c.x-a.x,y:c.y-a.y};
  const ta=cross(ac,cd)/den,tc=cross(ac,ab)/den;
  if(ta<0||ta>1||tc<0||tc>1)return null;
  return{x:a.x+ab.x*ta,y:a.y+ab.y*ta,ta,tc};
}
function routeDistanceToPoint(route,t,p){
  const total=length(route),target=total*Math.max(0,Math.min(1,t));
  let run=0,best=Infinity;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],seg=dist(a,b);
    if(!seg)continue;
    const q=Math.max(0,Math.min(1,(target-run)/seg));
    best=Math.min(best,dist({x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q},p));
    run+=seg;
  }
  return best;
}
function routeProgressToPoint(route,p){
  const projected=projectRouteProgress(route,p);
  return projected?.progress??0;
}
function movementAtJunction(route,junctionIndex){
  if(junctionIndex<0||junctionIndex>=route.length)return null;
  const node=route[junctionIndex];
  const before=route[Math.max(0,junctionIndex-1)];
  const after=route[Math.min(route.length-1,junctionIndex+1)];
  const incoming={x:node.x-before.x,y:node.y-before.y};
  const outgoing={x:after.x-node.x,y:after.y-node.y};
  const il=Math.hypot(incoming.x,incoming.y),ol=Math.hypot(outgoing.x,outgoing.y);
  if(il<1e-6||ol<1e-6)return null;
  incoming.x/=il;incoming.y/=il;outgoing.x/=ol;outgoing.y/=ol;
  const dot=incoming.x*outgoing.x+incoming.y*outgoing.y;
  const cross=incoming.x*outgoing.y-incoming.y*outgoing.x;
  const straight=dot>.82;
  const turn=dot<=.82&&Math.abs(cross)>.18;
  const direction=turn?(cross>0?'left':'right'):'straight';
  return {node,straight,turn,incoming,outgoing,direction};
}
function junctionForTruck(network,t){
  const controlRoute=t.centerlineRoute||t.route;
  const p=pointOnRoute(controlRoute,t.t);
  if(!p)return null;
  let best=null,bestDistance=Infinity,bestIndex=-1;
  for(const j of network.junctions||[]){
    let index=-1,d=Infinity;
    for(let i=0;i<controlRoute.length;i++){
      const q=controlRoute[i],dd=dist(q,j);
      if(dd<d){d=dd;index=i}
    }
    if(index<0||d>1.5)continue;
    const progress=routeProgressToPoint(controlRoute,j);
    const remaining=Math.max(0,progress-t.t);
    const routeLength=Math.max(1,length(t.route));
    const metresAhead=remaining*routeLength;
    if(metresAhead< -6||metresAhead>72)continue;
    if(d<bestDistance){bestDistance=d;best={junction:j,index,progress,metresAhead,movement:movementAtJunction(controlRoute,index)}}
  }
  return best;
}
function movementConflict(a,b){
  if(!a?.movement||!b?.movement)return true;
  const ai=a.movement,bi=b.movement;
  const sameJunction=dist(a.junction,b.junction)<1.5;
  if(sameJunction&&a.index===b.index){
    if(ai.straight&&bi.straight){
      const opposing=ai.incoming.x*bi.incoming.x+ai.incoming.y*bi.incoming.y<-.7;
      if(opposing)return false;
    }
    const same=ai.incoming.x*bi.incoming.x+ai.incoming.y*bi.incoming.y>.7 &&
      ai.outgoing.x*bi.outgoing.x+ai.outgoing.y*bi.outgoing.y>.7;
    if(same)return false;
  }
  return true;
}
function laneOffsetForMovement(movement){
  if(movement==='left')return 7;
  if(movement==='right')return 1.8;
  return 4.5;
}
function preferredTrafficLane(route){
  if(!Array.isArray(route)||route.length<3)return 'straight';
  for(let i=1;i<route.length-1;i++){
    const a=route[i-1],b=route[i],c=route[i+1],ab={x:b.x-a.x,y:b.y-a.y},bc={x:c.x-b.x,y:c.y-b.y};
    const al=Math.hypot(ab.x,ab.y),bl=Math.hypot(bc.x,bc.y); if(al<8||bl<8)continue;
    const dot=Math.max(-1,Math.min(1,(ab.x*bc.x+ab.y*bc.y)/(al*bl))),cross=ab.x*bc.y-ab.y*bc.x;
    if(dot<.82&&Math.abs(cross)>.18)return cross>0?'left':'right';
  }
  return 'straight';
}
function routeCurveFactor(route,t){
  if(!Array.isArray(route)||route.length<3)return 1;
  const p=pointOnRoute(route,t),total=length(route);
  if(!p||!total)return 1;
  let best=null,run=0;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],seg=dist(a,b);
    if(!seg)continue;
    const q=Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/(seg*seg)));
    const d=run+seg*q;
    if(best===null||Math.abs(d-total*t)<Math.abs(best-total*t))best=i;
    run+=seg;
  }
  const index=Math.max(1,Math.min(route.length-2,best||1));
  let maxTurn=0;
  const start=Math.max(1,index-1),end=Math.min(route.length-2,index+3);
  for(let i=start;i<=end;i++){
    const a=route[i-1],b=route[i],c=route[i+1];
    const ab={x:b.x-a.x,y:b.y-a.y},bc={x:c.x-b.x,y:c.y-b.y};
    const al=Math.hypot(ab.x,ab.y),bl=Math.hypot(bc.x,bc.y);
    if(!al||!bl)continue;
    const dot=Math.max(-1,Math.min(1,(ab.x*bc.x+ab.y*bc.y)/(al*bl)));
    maxTurn=Math.max(maxTurn,Math.acos(dot));
  }
  if(maxTurn>.95)return .48;
  if(maxTurn>.58)return .64;
  if(maxTurn>.30)return .80;
  return 1;
}
function updateTruckSpeed(t,targetFactor,dt){
  const target=Math.max(0,t.speed*Math.max(0,Math.min(1,targetFactor)));
  const current=Number.isFinite(t.currentSpeed)?t.currentSpeed:t.speed;
  const acceleration=target<current?.34:.20;
  const step=Math.max(.001,acceleration*dt);
  t.currentSpeed=current+Math.max(-step,Math.min(step,target-current));
  if(t.currentSpeed<.001)t.currentSpeed=0;
  return t.currentSpeed;
}

function trafficConflict(s,t,network,laneGraph,controls){
  const p=pointOnRoute(t.route,t.t);
  if(!p)return false;

  for(const o of s.trucks||[]){
    if(o===t||o.dead||!Array.isArray(o.route)||o.route.length<2)continue;
    const q=pointOnRoute(o.route,o.t);
    if(o.routeKey===t.routeKey&&o.t>t.t&&dist(p,q)<34)return true;
  }

  controls=controls||buildJunctionControls(network,laneGraph);
  const controlRoute=t.centerlineRoute||t.route;
  const here=junctionForTruck(network,t);
  if(!here){
    // Physical crossing detection remains the fallback for saved routes that
    // do not map cleanly to an explicit junction node.
    for(const o of s.trucks||[]){
      if(o===t||o.dead||o.wait>0||!Array.isArray(o.route)||o.route.length<2)continue;
      const q=pointOnRoute(o.route,o.t);
      for(let i=1;i<t.route.length;i++){
        const a=i===1?p:t.route[i-1],b=t.route[i];
        for(let j=1;j<o.route.length;j++){
          const c=o.route[j-1],d=o.route[j],hit=segmentHit(a,b,c,d);
          if(!hit)continue;
          const td=dist(p,hit),od=dist(q,hit);
          if(td>72||od>72)continue;
          if(td<9&&od<9)return String(o.id).localeCompare(String(t.id))<0;
          if(String(o.id).localeCompare(String(t.id))<0)return true;
        }
      }
    }
    t.trafficControl=null;
    return false;
  }

  const junctionLaneIndex=Array.isArray(t.laneIds)&&t.laneIds.length?laneIndexForJunction(laneGraph,t.laneIds,here.junction):-1;
  const laneIndex=junctionLaneIndex>=0?junctionLaneIndex:(Array.isArray(t.laneIds)&&t.laneIds.length
    ?Math.min(t.laneIds.length-2,Math.max(0,Math.floor(t.t*t.laneIds.length)))
    :0);
  const movement=movementForLaneRoute(laneGraph,controls,t.laneIds,laneIndex);
  const contenders=[];
  for(const o of s.trucks||[]){
    if(o===t||o.dead||o.wait>0||!Array.isArray(o.route)||o.route.length<2)continue;
    const other=junctionForTruck(network,o);
    if(!other||dist(here.junction,other.junction)>1.5)continue;
    const otherLaneIndex=Array.isArray(o.laneIds)&&o.laneIds.length
      ?(laneIndexForJunction(laneGraph,o.laneIds,other.junction)>=0?laneIndexForJunction(laneGraph,o.laneIds,other.junction):Math.min(o.laneIds.length-2,Math.max(0,Math.floor(o.t*o.laneIds.length))))
      :0;
    const otherMovement=movementForLaneRoute(laneGraph,controls,o.laneIds,otherLaneIndex);
    if(!otherMovement||!movement)continue;
    const permissionConflict=movementPermission(s,controls,here.junction,movement,{occupiedIds:[otherMovement.id]});
    if(permissionConflict.allowed)continue;
    const q=pointOnRoute(o.route,o.t);
    const arrival=other.metresAhead;
    if(arrival<=78&&dist(p,q)<105)contenders.push({truck:o,info:other,movement:otherMovement,arrival});
  }

  const signal=movement?movementPermission(s,controls,here.junction,movement,{occupiedIds:[]}):{allowed:true,reason:'no-movement',signal:null};
  let winner=t;
  if(contenders.length){
    const contendersWithSelf=[...contenders,{truck:t,info:here,movement,arrival:here.metresAhead}];
    contendersWithSelf.sort((a,b)=>a.arrival-b.arrival||String(a.truck.id).localeCompare(String(b.truck.id)));
    winner=contendersWithSelf[0]?.truck||t;
  }
  const yielding=winner!==t;

  const laneTarget=here.movement?.direction==='left'?7:here.movement?.direction==='right'?1.8:4.5;
  const stopPoint=movement?stopLinePoint(laneGraph,movement):null;
  t.trafficControl={
    junction:{x:here.junction.x,y:here.junction.y},
    metresAhead:here.metresAhead,
    yielding,
    priorityState:signal.allowed?(yielding?'yield':'proceed'):'signal-stop',
    yieldReason:!signal.allowed?signal.state:(yielding?'conflicting-movement':null),
    movement:movement?.type||here.movement?.direction||t.lane||'straight',
    laneTarget,
    laneChangeAllowed:here.metresAhead>(movement?.conflictZoneDistance??18),
    stopLineDistance:movement?.stopLineDistance??30,
    conflictZoneDistance:movement?.conflictZoneDistance??18,
    stopLine:stopPoint,
    signal:signal.signal?.state||'priority',
    signalAxis:signal.signal?.axis||null,
    movementId:movement?.id||null
  };

  if(yielding||!signal.allowed)return true;

  s.trafficReservations=s.trafficReservations||{};
  const now=s.trafficClock||0;
  for(const [reservationKey,reservationValue] of Object.entries(s.trafficReservations)){
    if(!reservationValue||reservationValue.until<=now)delete s.trafficReservations[reservationKey];
  }
  const key=`${Math.round(here.junction.x*10)/10},${Math.round(here.junction.y*10)/10}`;
  const reservation=s.trafficReservations[key];
  if(reservation&&reservation.truckId!==t.id)return true;
  s.trafficReservations[key]={truckId:t.id,movementId:movement?.id||null,until:now+.9};
  return false;
}
function rerouteTruck(s,t){
  if(!t?.source||!t?.to)return false;
  const p=pointOnRoute(t.route,t.t);
  const next=route(s,t.source,t.to);
  if(!next)return false;
  const projected=projectRouteProgress(next.points,p);
  if(!projected||projected.distance>160)return false;

  // A deleted road can strand a truck between two remaining road segments.
  // Preserve its physical position and let it drive to the nearest point on
  // the replacement network instead of teleporting it onto that network.
  const physical=Array.isArray(next.lanePoints)&&next.lanePoints.length>=2?next.lanePoints:next.points;
  const physicalProjected=projectRouteProgress(physical,p);
  if(!physicalProjected)return false;
  const join=pointOnRoute(physical,physicalProjected.progress);
  if(!join)return false;
  const remaining=physical.slice(Math.max(0,physicalProjected.segmentIndex));
  const centerProjected=projectRouteProgress(next.points,p);
  if(!centerProjected||centerProjected.distance>160)return false;
  const centerRemaining=next.points.slice(Math.max(0,centerProjected.segmentIndex));
  const routePoints=[p,...centerRemaining];
  const compact=routePoints.filter((q,i)=>i===0||dist(q,routePoints[i-1])>.01);
  t.centerlineRoute=next.points;
  t.route=compact;
  t.laneRoute=physical;
  t.routeKey=next.points.map(q=>q.x.toFixed(1)+','+q.y.toFixed(1)).join('|');
  t.laneIds=Array.isArray(next.laneIds)?[...next.laneIds]:[];
  t.routeNetworkRevision=Number(s.roadNetworkRevision)||0;
  t.currentLaneIndex=0;
  t.currentLaneId=t.laneIds[0]||null;
  t.t=0;
  t.routeInvalidated=false;
  return true;
}

export function newContract(s,shop){
  if(shop.contract)return;
  const f=spec(shop.need);
  const qty=Math.max(2,Math.min(12,Math.round((3+Math.random()*3+(shop.level-1))*f.qty)));
  const reward=Math.round(f.price*qty*(1.7+shop.level*.2));
  shop.contract={id:s.contractId++,type:shop.need,qty,remaining:qty,reward,expires:65+shop.level*10,initial:qty,urgent:Math.random()>.72,inFlight:0};
}

export function researchCost(s,type){
  const level=s.research?.[type]||0;
  return Math.round(180*Math.pow(1.65,level));
}

export function research(s,type){
  if(!s.research||!(type in s.research))return false;
  const level=s.research[type];
  const cost=researchCost(s,type);
  if(s.cash<cost||level>=3)return false;
  s.cash-=cost;
  s.research[type]=level+1;
  return true;
}

export function upgrade(s,b,n){
  if(b.kind==='factory'){
    const price=n===1?120*b.level:n===2?180+(b.max-4)/2*70:n===3?220*(b.loading+1):300*(b.logistics+1);
    if(s.cash<price)return false;
    if(n===1&&b.level<3)b.level++;
    else if(n===2&&b.max<14)b.max+=2;
    else if(n===3&&b.loading<2)b.loading++;
    else if(n===4&&b.logistics<2)b.logistics++;
    else return false;
    s.cash-=price;return true;
  }
  if(b.kind==='warehouse'){
    const price=b.level===1?180:b.level===2?320:0;
    if(b.level>=3||s.cash<price)return false;
    s.cash-=price;
    b.level++;
    b.max+=b.level===2?10:14;
    b.logistics=Math.min(2,(b.logistics||0)+1);
    return true;
  }
  const price=220*b.level;
  if(b.kind==='shop'&&b.level<3&&s.cash>=price){
    s.cash-=price;b.level++;b.max=Math.min(14,b.max+2);b.demand=Math.min(14,b.demand+2);return true;
  }
  return false;
}

function warehouseFor(s,building){
  let best=null,bestScore=Infinity;
  for(const w of s.buildings.filter(b=>b.kind==='warehouse')){
    const r=route(s,building,w);
    if(!r)continue;
    if(r.distance<bestScore){bestScore=r.distance;best=w}
  }
  return best;
}
function supplyWarehouseFor(s,factory,shop){
  let best=null,bestScore=Infinity;
  for(const warehouse of s.buildings.filter(b=>b.kind==='warehouse')){
    const toWarehouse=route(s,factory,warehouse);
    if(!toWarehouse)continue;
    const toShop=route(s,warehouse,shop);
    if(!toShop)continue;
    const score=toWarehouse.distance+toShop.distance;
    if(score<bestScore){
      bestScore=score;
      best={warehouse,toWarehouse,toShop,distance:score};
    }
  }
  return best;
}
function warehouseCapacity(w,type){return Math.max(0,(w.max||24)-(w.storage||0));}
function takeFromWarehouse(warehouse,type,n){
  const have=Math.max(0,warehouse?.inventory?.[type]||0),take=Math.min(have,Math.max(0,n));
  if(!take)return 0;
  warehouse.inventory[type]-=take;
  warehouse.storage=Math.max(0,(warehouse.storage||0)-take);
  return take;
}
function addToWarehouse(warehouse,type,n){
  if(!warehouse||n<=0)return 0;
  const free=warehouseCapacity(warehouse,type),take=Math.min(free,n);
  if(!take)return 0;
  warehouse.inventory=warehouse.inventory||{};
  warehouse.inventory[type]=(warehouse.inventory[type]||0)+take;
  warehouse.storage=(warehouse.storage||0)+take;
  return take;
}
function dispatchTruck(s,{route,source,destination,cargo,cargoType=source?.type,contractId=0,longDistance=false,valuePerUnit=0,stage='delivery'}){
  if(!route||!cargo)return false;
  // Keep the simulation bounded under sustained demand. Finished trucks are
  // removed each tick, so this only limits genuinely in-flight congestion.
  if((s.trucks||[]).length>=80)return false;
  // Final hard gate: both buildings must still be physically attached
  // to the saved road network when the truck is spawned.
  if(!roadAttachment(s,source)||!roadAttachment(s,destination))return false;
  const movementLane=preferredTrafficLane(route.points),laneOffset=laneOffsetForMovement(movementLane);
  const physicalRoute=Array.isArray(route.lanePoints)&&route.lanePoints.length>=2?route.lanePoints:route.points;
  s.trucks.push({
    id:newId(),route:route.points,laneRoute:physicalRoute,centerlineRoute:route.points,
    routeKey:route.points.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join('|'),
    routeNetworkRevision:Number(s.roadNetworkRevision)||0,
    routeNetworkRevision:Number(s.roadNetworkRevision)||0,
    laneIds:Array.isArray(route.laneIds)?[...route.laneIds]:[],
    currentLaneIndex:0,currentLaneId:route.laneIds?.[0]||null,
    t:0,
    speed:.085*spec(source.type).speed*(1+(source.level-1)*.08+(source.loading||0)*.04),
    value:valuePerUnit*cargo,cargo,to:destination,source,contractId,longDistance,wait:0,stage,lane:movementLane,laneOffset
  });
  return true;
}

export function updateEconomy(s,dt,flash){
  const elapsed=Number.isFinite(dt)?Math.max(0,dt):0;
  s.trafficClock=(s.trafficClock||0)+elapsed;
  for(const b of s.buildings){
    if(b.kind==='factory'){
      const f=spec(b.type);
      b.production+=dt*.46*b.level*f.speed*(1+b.loading*.1)*(1+(s.research?.automation||0)*.08);
      b.active=Math.min(1,b.active+dt*2.5);
      if(b.production>=1&&b.stock<b.max){const n=Math.floor(b.production);b.production-=n;b.stock=Math.min(b.max,b.stock+n)}
    }else if(b.kind==='shop'){
      b.active=Math.max(0,b.active-dt*2.2);b.demand=Math.min(14,b.demand+dt*(.05+s.companyLevel*.003)*(1+b.level*.06));
      b.satisfaction=Math.max(0,Math.min(100,100-b.demand*4+(b.served||0)*1.5));
      if(!b.contract&&Math.random()<dt*.012)newContract(s,b);
      if(b.contract){b.contract.expires-=dt;if(b.contract.expires<=0){s.reputation=Math.max(0,s.reputation-4);b.contract=null;flash('Contract expired • reputation -4')}}
    }
  }
  for(const f of s.buildings.filter(b=>b.kind==='factory')){
    f.dispatchTimer=(f.dispatchTimer||0)+dt;
    if(f.dispatchTimer<Math.max(.65,1.15-f.level*.12))continue;
    // Warehouses are the default supply-chain path whenever a connected
    // warehouse exists. Factories feed the hub first; the hub then distributes
    // to shops. Direct factory-to-shop delivery is only used when no connected
    // warehouse exists, keeping the warehouse strategically meaningful without
    // adding manual dispatch controls.
    const connectedHubs=s.buildings
      .filter(b=>b.kind==='warehouse')
      .map(hub=>({hub,route:route(s,f,hub)}))
      .filter(x=>x.route)
      .sort((a,b)=>a.route.distance-b.route.distance);
    const supplyHub=connectedHubs[0]?.hub||null;
    if(supplyHub&&f.stock>0&&warehouseCapacity(supplyHub,f.type)>0){
      const toHub=connectedHubs[0].route;
      const cargo=Math.min(3,f.stock,warehouseCapacity(supplyHub,f.type));
      if(cargo>0){
        const dispatched=dispatchTruck(s,{route:toHub,source:f,destination:supplyHub,cargo,cargoType:f.type,stage:'warehouse'});
        if(dispatched){f.stock-=cargo;f.dispatchTimer=0;continue;}
      }
    }
    const shops=s.buildings.filter(b=>b.kind==='shop'&&b.need===f.type&&b.demand>0);
    let choice=null,best=Infinity,choiceRoute=null,choiceHub=null,choicePriority=-Infinity;
    for(const shop of shops){
      // A warehouse only becomes the supply-chain path when the factory
      // can actually reach it AND the warehouse can reach this shop. Otherwise
      // preserve the original direct factory-to-shop route.
      const supply=supplyWarehouseFor(s,f,shop);
      const direct=route(s,f,shop);
      const hub2=supply?.warehouse||null;
      const via=supply&&hub2.inventory?.[f.type]>0?supply.toShop:null;
      const candidate=via||(!supply?direct:null);
      if(!candidate)continue;

      // Prioritise real shortages/contracts over ordinary demand.
      // A factory should not send scarce goods to an arbitrary nearby shop
      // while another connected shop has an outstanding contract.
      const contract=shop.contract?.type===f.type?shop.contract:null;
      const contractNeed=contract?Math.max(0,contract.remaining-(contract.inFlight||0)):0;
      const shortage=Math.max(0,shop.demand||0);
      const priority=(contractNeed>0?100000:0)+(contract?.urgent?25000:0)+shortage*100;

      if(priority>choicePriority||(priority===choicePriority&&candidate.distance<best)){
        choicePriority=priority;best=candidate.distance;choice=shop;choiceRoute=candidate;choiceHub=hub2;
      }
    }
    const shop=choice;if(!shop){f.dispatchTimer=0;continue;}
    const contract=shop.contract?.type===f.type?shop.contract:null;
    const outstanding=contract?.inFlight||0;
    const capacity=3;
    const needed=Math.max(0,(contract?.remaining||capacity)-outstanding);
    let cargo=0,source=f,routeToUse=choiceRoute,stage='delivery',fromWarehouse=false;
    if(choiceHub&&choiceHub.inventory?.[f.type]>0&&routeToUse){
      cargo=Math.min(capacity,choiceHub.inventory[f.type],Math.max(1,needed||capacity));
      if(cargo>0){source=choiceHub;stage='delivery';fromWarehouse=true}
    }else{
      // A complete warehouse path with no stock is a real supply-chain
      // shortage, not permission to bypass the hub. If there is no complete
      // warehouse path, the original direct factory-to-shop route remains valid.
      if(choiceHub)continue;
      if(!f.stock)continue;
      const directRoute=route(s,f,shop);
      if(!directRoute)continue;
      cargo=Math.min(capacity,f.stock,Math.max(1,needed||capacity));
      if(cargo>0){routeToUse=directRoute;}
    }
    if(cargo<=0||!routeToUse)continue;
    const sp=spec(f.type);
    const valueBase=sp.price*sp.value*(1+Math.min(1.2,routeToUse.distance/650)*.45)*(1+(f.level-1)*.07+f.loading*.08)*(1+(f.logistics||0)*.04+(s.research?.logistics||0)*.04);
    if(!Number.isFinite(valueBase))continue;
    const valuePerUnit=Math.max(1,Math.round(valueBase));
    const dispatched=dispatchTruck(s,{route:routeToUse,source,cargoType:f.type,destination:shop,cargo,contractId:contract?.id||0,longDistance:routeToUse.distance>650,valuePerUnit,stage:'delivery'});
    if(!dispatched)continue;
    if(fromWarehouse){
      takeFromWarehouse(choiceHub,f.type,cargo);
    }else{
      f.stock=Math.max(0,f.stock-cargo);
    }
    if(contract)contract.inFlight+=cargo;
    f.dispatchTimer=0;
  }

  const trafficNetwork=roadNetwork(s);
  const laneGraph=trafficNetwork?.edges?.length?buildLaneGraph(trafficNetwork,{lanesPerDirection:2}):null;
  const junctionControls=trafficNetwork&&laneGraph?buildJunctionControls(trafficNetwork,laneGraph):null;
  for(const t of s.trucks){
    // Every road mutation rebuilds the derived lane graph. A revision mismatch
    // invalidates even routes whose old geometry happens to overlap the new
    // network, preventing stale lane transitions after edits/junction changes.
    if(Number.isFinite(Number(t.routeNetworkRevision))&&Number(t.routeNetworkRevision)!==(Number(s.roadNetworkRevision)||0))t.routeInvalidated=true;
    // Road deletion can invalidate a live truck route. Re-route from the
    // truck's current physical position when an alternate network path exists.
    // If the endpoints are now disconnected, safely return the cargo instead
    // of letting the truck travel on a deleted road.
    if(t.routeInvalidated){
      if(!rerouteTruck(s,t)){
        if(t.stage==='warehouse'){
          t.source.stock=Math.min(t.source.max||Infinity,(t.source.stock||0)+(t.cargo||0));
        }else{
          if(t.source?.kind==='warehouse'){
            addToWarehouse(t.source,t.cargoType,t.cargo||0);
          }else{
            t.source.stock=Math.min(t.source.max||Infinity,(t.source.stock||0)+(t.cargo||0));
          }
          if(t.contractId&&t.to.contract?.id===t.contractId){
            t.to.contract.inFlight=Math.max(0,(t.to.contract.inFlight||0)-(t.cargo||0));
          }
        }
        t.dead=true;
        continue;
      }
    }
    // Routes are validated when the truck is dispatched. Do not re-project
    // route graph nodes back onto road geometry every tick: routed paths can
    // legitimately contain graph/intersection points that are not exact road
    // polyline vertices. Only discard malformed persisted truck data.
    if(!Array.isArray(t.route)||t.route.length<2||!Number.isFinite(t.t)){
      t.dead=true;
      continue;
    }
    const p=pointOnRoute(t.route,t.t);let blocked=false;
    let nearestGap=Infinity,queueAhead=null;
    // Queue using physical distance along the shared route, not just raw t.
    // This keeps vehicles ordered correctly when their route points have
    // different spacing around a junction.
    for(const o of s.trucks){
      if(o===t||o.dead||o.routeKey!==t.routeKey)continue;
      const q=pointOnRoute(o.route,o.t);
      const ahead=o.t>t.t;
      if(!ahead)continue;
      const routeLen=length(t.route);
      const routeGap=o.routeKey===t.routeKey&&routeLen>0?Math.max(0,(o.t-t.t)*routeLen):dist(p,q);
      const gap=Math.max(0,routeGap);
      if(gap<nearestGap){nearestGap=gap;queueAhead=o;}
    }
    const trafficBlocked=trafficConflict(s,t,trafficNetwork,laneGraph,junctionControls);
    if(Array.isArray(t.laneIds)&&t.laneIds.length){
      t.currentLaneIndex=Math.min(t.laneIds.length-1,Math.max(0,Math.floor(t.t*t.laneIds.length)));
      t.currentLaneId=t.laneIds[t.currentLaneIndex];
    }
    const laneTarget=Number.isFinite(t.trafficControl?.laneTarget)?t.trafficControl.laneTarget:0;
    const laneChangeAllowed=t.trafficControl?.laneChangeAllowed!==false;
    const effectiveLaneTarget=laneChangeAllowed?laneTarget:(Number.isFinite(t.laneOffset)?t.laneOffset:0);
    const laneApproach=Math.max(0,Math.min(1,1-(t.trafficControl?.metresAhead??999)/42));
    t.laneOffset=(Number.isFinite(t.laneOffset)?t.laneOffset:0)+(effectiveLaneTarget-(Number.isFinite(t.laneOffset)?t.laneOffset:0))*Math.min(1,dt*3.8*laneApproach);
    let trafficSpeedFactor=1;
    t.queueAheadId=queueAhead?.id||null;
    t.queueGap=Number.isFinite(nearestGap)?nearestGap:null;
    // Use a slightly larger gap near junctions so a queue does not bunch into
    // the stop line. The following truck brakes progressively, then holds a
    // fixed physical gap instead of repeatedly overshooting and stopping.
    const junctionAhead=t.trafficControl?.metresAhead;
    const desiredGap=junctionAhead!=null&&junctionAhead<70
      ?24+Math.min(12,t.speed*70)
      :18+Math.min(18,t.speed*90);
    if(queueAhead&&nearestGap<desiredGap+26){
      const queueFactor=Math.max(0,Math.min(1,(nearestGap-desiredGap)/26));
      trafficSpeedFactor=Math.min(trafficSpeedFactor,queueFactor);
      if(nearestGap<=desiredGap){
        blocked=true;
        t.wait=Math.min(2,t.wait+dt*.35);
      }
    }
    if(trafficBlocked){
      const control=t.trafficControl;
      // Brake progressively before the stop/yield line. Once inside the final
      // approach zone, hold position until the junction is available.
      const metresAhead=control?.metresAhead??0;
      const approachFactor=Math.max(0,Math.min(1,(metresAhead-12)/28));
      trafficSpeedFactor=Math.min(trafficSpeedFactor,approachFactor);
      if(metresAhead<=12){
        blocked=true;
        t.wait=Math.min(2,t.wait+dt);
      }else{
        t.wait=Math.max(0,t.wait-dt*.4);
      }
    }else{
      t.trafficControl=null;
      t.wait=Math.max(0,t.wait-dt*.75);
    }
    const curveFactor=routeCurveFactor(t.route,t.t);
    trafficSpeedFactor=Math.min(trafficSpeedFactor,curveFactor);
    const congestionFactor=Math.max(.55,1-(s.congestion*.18));
    const movementSpeedFactor=t.trafficControl?.movement==='right'?.94:t.trafficControl?.movement==='left'?.97:1;
    const targetFactor=blocked?0:trafficSpeedFactor*congestionFactor*movementSpeedFactor;
    const actualSpeed=updateTruckSpeed(t,targetFactor,dt);
    if(actualSpeed<=0)continue;
    t.t+=dt*actualSpeed;
    if(t.t>=1){
      if(t.stage==='warehouse'){
        const accepted=addToWarehouse(t.to,t.source.type,t.cargo);
        if(accepted<t.cargo){t.source.stock=Math.min(t.source.max,t.source.stock+(t.cargo-accepted));}
        t.dead=true;continue;
      }
      const units=Math.max(1,t.cargo||1);
      s.cash+=t.value;s.deliveryIncome+=t.value;s.orders+=units;s.xp+=Math.max(2,Math.round(t.value*.08));t.to.served=(t.to.served||0)+units;t.to.satisfaction=Math.min(100,(t.to.satisfaction||50)+4*units);s.deliveredBy[t.cargoType||t.source?.type]=(s.deliveredBy[t.cargoType||t.source?.type]||0)+units;
      if(t.contractId&&t.to.contract?.id===t.contractId){const c=t.to.contract;c.remaining=Math.max(0,c.remaining-units);c.inFlight=Math.max(0,(c.inFlight||0)-units);if(c.remaining<=0){const bonus=c.urgent?Math.round(c.reward*.18):0;s.cash+=c.reward+bonus;s.reputation=Math.min(100,s.reputation+2);if(t.longDistance)s.longContracts++;t.to.contract=null;flash('Contract complete • £'+(c.reward+bonus))}}
      t.dead=true;
    }
  }
  s.trucks=s.trucks.filter(t=>!t.dead);
  while(s.xp>=s.xpToNext){s.xp-=s.xpToNext;s.companyLevel++;s.xpToNext=Math.round(100*Math.pow(1.22,s.companyLevel-1));flash('Company Level '+s.companyLevel)}
  s.congestion=Math.min(1,(s.trucks.length+s.trucks.filter(t=>t.wait>0).length*1.5)/Math.max(3,s.roads.length*2));
  const reduction=s.trucks.reduce((n,t)=>n+(t.source?.logistics||0),0)/Math.max(1,s.trucks.length);
  s.cash-=s.roads.length*dt*.055*(1+s.congestion*Math.max(.55,1-reduction*.12));
  const g=s.goals[s.objective];if(g&&g.done(s))s.objective=Math.min(5,s.objective+1);if(s.cash<=0){s.cash=0;s.gameOver=true}
}