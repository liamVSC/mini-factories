import {TYPES} from './state.js';
import {dist,length,pointOnRoute,routeOnRoadNetwork} from './world.js';

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

export function route(s,a,b){return routeOnRoadNetwork(s,a,b)}

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
function dispatchTruck(s,{route,source,destination,cargo,contractId=0,longDistance=false,valuePerUnit=0,stage='delivery'}){
  if(!route||!cargo)return false;
  s.trucks.push({route:route.points,routeKey:route.points.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join('|'),t:0,speed:.085*spec(source.type).speed*(1+(source.level-1)*.08+(source.loading||0)*.04),value:valuePerUnit*cargo,cargo,to:destination,source,contractId,longDistance,wait:0,stage});
  return true;
}

export function updateEconomy(s,dt,flash){
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
    const hub=warehouseFor(s,f);
    if(hub&&f.stock>0&&Math.random()<dt*.8){
      const r=route(s,f,hub);
      if(r){const cargo=Math.min(3,f.stock,warehouseCapacity(hub,f.type));if(cargo>0){f.stock-=cargo;dispatchTruck(s,{route:r,source:f,destination:hub,cargo,valuePerUnit:0,stage:'warehouse'})}}
    }
    const shops=s.buildings.filter(b=>b.kind==='shop'&&b.need===f.type&&b.demand>0);
    let choice=null,best=Infinity,choiceRoute=null,choiceHub=null;
    for(const shop of shops){
      const hub2=warehouseFor(s,shop);
      const direct=route(s,f,shop);
      const via=hub2&&hub2!==f?route(s,hub2,shop):null;
      const candidate=hub2&&hub2.inventory?.[f.type]>0&&via?via:direct;
      if(candidate&&candidate.distance<best){best=candidate.distance;choice=shop;choiceRoute=candidate;choiceHub=hub2}
    }
    const shop=choice;if(!shop)continue;
    if(Math.random()>=dt*(1.4+f.level*.35))continue;
    const contract=shop.contract?.type===f.type?shop.contract:null;
    const outstanding=contract?.inFlight||0;
    const capacity=3;
    const needed=Math.max(0,(contract?.remaining||capacity)-outstanding);
    let cargo=0,source=f,routeToUse=choiceRoute,stage='delivery';
    if(choiceHub&&choiceHub.inventory?.[f.type]>0&&routeToUse){
      cargo=Math.min(capacity,choiceHub.inventory[f.type],Math.max(1,needed||capacity));
      if(cargo>0){takeFromWarehouse(choiceHub,f.type,cargo);source=f;stage='delivery'}
    }else{
      if(!f.stock)continue;
      const hubForShop=choiceHub&&choiceHub!==warehouseFor(s,f)?choiceHub:null;
      if(hubForShop){
        const toHub=route(s,f,hubForShop);
        const toShop=route(s,hubForShop,shop);
        if(toHub&&toShop){
          const free=warehouseCapacity(hubForShop,f.type);
          cargo=Math.min(capacity,f.stock,Math.max(1,needed||capacity),free);
          if(cargo>0){f.stock-=cargo;dispatchTruck(s,{route:toHub,source:f,destination:hubForShop,cargo,stage:'warehouse'});}
        }
      }
      if(cargo===0){
        if(!route(s,f,shop))continue;
        cargo=Math.min(capacity,f.stock,Math.max(1,needed||capacity));
        if(cargo>0){f.stock-=cargo;routeToUse=route(s,f,shop);}
      }
    }
    if(cargo<=0||!routeToUse)continue;
    if(contract)contract.inFlight+=cargo;
    const sp=spec(f.type);
    const valuePerUnit=Math.max(1,Math.round(sp.price*sp.value*(1+Math.min(1.2,routeToUse.distance/650)*.45)*(1+(f.level-1)*.07+f.loading*.08)*(1+(f.logistics||0)*.04+(s.research?.logistics||0)*.04)));
    dispatchTruck(s,{route:routeToUse,source:f,destination:shop,cargo,contractId:contract?.id||0,longDistance:routeToUse.distance>650,valuePerUnit,stage:'delivery'});
  }

  for(const t of s.trucks){
    const p=pointOnRoute(t.route,t.t);let blocked=false,nearestAhead=Infinity;
    for(const o of s.trucks){if(o===t||o.dead)continue;const q=pointOnRoute(o.route,o.t);if(dist(p,q)<30&&o.routeKey===t.routeKey&&o.t>t.t)nearestAhead=Math.min(nearestAhead,o.t-t.t)}
    if(nearestAhead<.045){blocked=true;t.wait=Math.min(2,t.wait+dt)}else t.wait=Math.max(0,t.wait-dt*.75);
    if(blocked)continue;
    t.t+=dt*t.speed*Math.max(.65,1-(s.congestion*.18));
    if(t.t>=1){
      if(t.stage==='warehouse'){
        const accepted=addToWarehouse(t.to,t.source.type,t.cargo);
        if(accepted<t.cargo){t.source.stock=Math.min(t.source.max,t.source.stock+(t.cargo-accepted));}
        t.dead=true;continue;
      }
      const units=Math.max(1,t.cargo||1);
      s.cash+=t.value;s.deliveryIncome+=t.value;s.orders+=units;s.xp+=Math.max(2,Math.round(t.value*.08));t.to.served=(t.to.served||0)+units;t.to.satisfaction=Math.min(100,(t.to.satisfaction||50)+4*units);s.deliveredBy[t.source.type]=(s.deliveredBy[t.source.type]||0)+units;
      if(t.contractId&&t.to.contract?.id===t.contractId){const c=t.to.contract;c.remaining=Math.max(0,c.remaining-units);c.inFlight=Math.max(0,(c.inFlight||0)-units);if(c.remaining<=0){const bonus=c.urgent?Math.round(c.reward*.18):0;s.cash+=c.reward+bonus;s.reputation=Math.min(100,s.reputation+2);if(t.longDistance)s.longContracts++;t.to.contract=null;flash('Contract complete • £'+(c.reward+bonus))}}
      t.dead=true;
    }
  }
  s.trucks=s.trucks.filter(t=>!t.dead);
  while(s.xp>=s.xpToNext){s.xp-=s.xpToNext;s.companyLevel++;s.xpToNext=Math.round(100*Math.pow(1.22,s.companyLevel-1));s.roadBudget+=3;flash('Company Level '+s.companyLevel+' • +3 roads')}
  s.congestion=Math.min(1,(s.trucks.length+s.trucks.filter(t=>t.wait>0).length*1.5)/Math.max(3,s.roads.length*2));
  const reduction=s.trucks.reduce((n,t)=>n+(t.source?.logistics||0),0)/Math.max(1,s.trucks.length);
  s.cash-=s.roads.length*dt*.055*(1+s.congestion*Math.max(.55,1-reduction*.12));
  const g=s.goals[s.objective];if(g&&g.done(s))s.objective=Math.min(5,s.objective+1);if(s.cash<=0){s.cash=0;s.gameOver=true}
}
