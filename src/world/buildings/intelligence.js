import {dist} from '../roads/geometry.js';
import {buildingFootprint} from './geometry.js';

function safeNumber(value,fallback=0){
  return Number.isFinite(Number(value))?Number(value):fallback;
}

export function buildingRole(building){
  if(!building)return'unknown';
  if(building.kind==='factory')return'producer';
  if(building.kind==='warehouse')return'hub';
  if(building.kind==='shop')return'retail';
  return'building';
}

export function buildingCapacity(building){
  if(!building)return 0;
  if(building.kind==='warehouse')return Math.max(0,safeNumber(building.max,0));
  return Math.max(0,safeNumber(building.max,0));
}

export function buildingStoredAmount(building){
  if(!building)return 0;
  if(building.kind==='warehouse')return Math.max(0,safeNumber(building.storage,0));
  return Math.max(0,safeNumber(building.stock,0));
}

export function buildingUtilization(building){
  const capacity=buildingCapacity(building);
  return capacity>0?Math.max(0,Math.min(1,buildingStoredAmount(building)/capacity)):0;
}

export function buildingDemandPressure(building){
  if(!building)return 0;
  if(building.kind==='shop'){
    const demand=Math.max(0,safeNumber(building.demand,0));
    const served=Math.max(0,safeNumber(building.served,0));
    const contractNeed=Math.max(0,safeNumber(building.contract?.remaining,0)-safeNumber(building.contract?.inFlight,0));
    return Math.max(0,Math.min(1,(demand+contractNeed*1.5)/16));
  }
  if(building.kind==='factory'){
    const capacity=buildingCapacity(building);
    return capacity>0?buildingUtilization(building):0;
  }
  return 0;
}

export function buildingLocationScore(s,type,x,y,placementReason){
  if(!type||typeof placementReason!=='function')return-Infinity;
  if(placementReason(s,type,x,y))return-Infinity;
  const candidate={kind:type.kind,x,y,type:type.name};
  const footprint=buildingFootprint(candidate);
  let score=0;
  const roads=s.roads||[];
  let nearestRoad=Infinity;
  for(const road of roads){
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i];
      const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
      if(!len2)continue;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len2));
      nearestRoad=Math.min(nearestRoad,dist({x,y},{x:a.x+dx*t,y:a.y+dy*t}));
    }
  }
  if(Number.isFinite(nearestRoad)){
    score+=Math.max(0,180-nearestRoad)*1.2;
    score-=Math.max(0,nearestRoad-110)*.7;
  }else{
    score-=180;
  }

  const buildings=s.buildings||[];
  if(type.kind==='factory'){
    const matchingShops=buildings.filter(b=>b.kind==='shop'&&b.need===type.name);
    if(matchingShops.length){
      const nearest=Math.min(...matchingShops.map(b=>dist(candidate,b)));
      score+=Math.max(0,420-nearest)*.45;
    }
    const warehouses=buildings.filter(b=>b.kind==='warehouse');
    if(warehouses.length){
      const nearest=Math.min(...warehouses.map(b=>dist(candidate,b)));
      score+=Math.max(0,360-nearest)*.22;
    }
  }else if(type.kind==='shop'){
    const producers=buildings.filter(b=>b.kind==='factory'&&b.type===type.need);
    if(producers.length){
      const nearest=Math.min(...producers.map(b=>dist(candidate,b)));
      score+=Math.max(0,520-nearest)*.3;
    }
    const warehouses=buildings.filter(b=>b.kind==='warehouse');
    if(warehouses.length){
      const nearest=Math.min(...warehouses.map(b=>dist(candidate,b)));
      score+=Math.max(0,430-nearest)*.2;
    }
  }else if(type.kind==='warehouse'){
    const operational=buildings.filter(b=>b.kind==='factory'||b.kind==='shop');
    if(operational.length){
      const total=operational.reduce((n,b)=>n+dist(candidate,b),0);
      const average=total/operational.length;
      score+=Math.max(0,620-average)*.55;
    }
  }

  score+=Math.max(0,footprint.halfWidth+footprint.halfDepth)*.02;
  return score;
}

export function buildingOperationalState(s,building){
  if(!building)return{state:'unknown',role:'unknown',utilization:0,demandPressure:0,logisticsConnected:false,bottleneck:'missing'};
  const utilization=buildingUtilization(building);
  const demandPressure=buildingDemandPressure(building);
  const logisticsConnected=building.logisticsConnected!==false;
  let bottleneck='none';
  if(building.kind==='factory'){
    if(!logisticsConnected)bottleneck='road-access';
    else if(utilization>=.9)bottleneck='storage-full';
    else if(safeNumber(building.production,0)<.05&&safeNumber(building.stock,0)===0)bottleneck='idle';
  }else if(building.kind==='warehouse'){
    if(!logisticsConnected)bottleneck='road-access';
    else if(utilization>=.95)bottleneck='storage-full';
    else if(utilization<=.05)bottleneck='underused';
  }else if(building.kind==='shop'){
    if(!logisticsConnected)bottleneck='road-access';
    else if(demandPressure>=.75)bottleneck='undersupplied';
    else if(safeNumber(building.satisfaction,100)<45)bottleneck='low-satisfaction';
  }
  const state=bottleneck==='none'?'operational':bottleneck;
  return{state,role:buildingRole(building),utilization,demandPressure,logisticsConnected,bottleneck};
}
