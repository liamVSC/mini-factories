import {TYPES} from './state.js';
import {dist,length,pointOnRoute} from './world.js';

export function spec(type){return TYPES.find(t=>t.name===type)||TYPES[0]}

function touches(r,b){return r.points.some(p=>dist(p,b)<b.r+34)}

function roadDistance(a,b){
  let best=Infinity;
  const aEnds=[a.points[0],a.points.at(-1)];
  const bEnds=[b.points[0],b.points.at(-1)];
  for(const p of aEnds)for(const q of bEnds)best=Math.min(best,dist(p,q));
  return best;
}

function oriented(points,from,to){
  const a=dist(points[0],from),b=dist(points.at(-1),from);
  const out=a<=b?[...points]:[...points].reverse();
  if(dist(out.at(-1),to)>dist(out[0],to))out.reverse();
  return out;
}

export function route(s,a,b){
  const roads=s.roads;
  if(!roads.length)return null;
  const start=roads.filter(r=>touches(r,a));
  const end=roads.filter(r=>touches(r,b));
  if(!start.length||!end.length)return null;

  const endSet=new Set(end);
  const queue=start.map(r=>({road:r,d:dist(a,r.points[0])}));
  const best=new Map(start.map(r=>[r,dist(a,r.points[0])]));
  const prev=new Map();

  while(queue.length){
    queue.sort((x,y)=>x.d-y.d);
    const cur=queue.shift();
    if(cur.d!==best.get(cur.road))continue;
    if(endSet.has(cur.road)){
      const chain=[];let r=cur.road;
      while(r){chain.unshift(r);r=prev.get(r)}
      let points=[{x:a.x,y:a.y}],from=a;
      for(const road of chain){
        const next=oriented(road.points,from,b);
        if(dist(points.at(-1),next[0])>2)points.push(next[0]);
        for(let i=1;i<next.length;i++)points.push(next[i]);
        from=next.at(-1);
      }
      if(dist(points.at(-1),b)>2)points.push({x:b.x,y:b.y});
      return {points,distance:length(points)};
    }
    for(const next of roads){
      if(next===cur.road)continue;
      const join=roadDistance(cur.road,next);
      if(join>38)continue;
      const nd=cur.d+join+length(next.points);
      if(nd<(best.get(next)??Infinity)){
        best.set(next,nd);prev.set(next,cur.road);queue.push({road:next,d:nd});
      }
    }
  }
  return null;
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
  const price=220*b.level;
  if(b.kind==='shop'&&b.level<3&&s.cash>=price){
    s.cash-=price;b.level++;b.max=Math.min(14,b.max+2);b.demand=Math.min(14,b.demand+2);return true;
  }
  return false;
}

function warehouseFor(s,building){
  let best=null,bestD=Infinity;
  for(const w of s.buildings.filter(b=>b.kind==='warehouse')){
    const d=dist(w,building);
    if(d<bestD){bestD=d;best=w}
  }
  return best;
}
function transferToWarehouse(s,f,warehouse){
  if(!warehouse||f.stock<=0)return false;
  const free=Math.max(0,warehouse.max-(warehouse.storage||0));
  if(free<=0)return false;
  const n=Math.min(free,f.stock);
  f.stock-=n;warehouse.storage=(warehouse.storage||0)+n;
  warehouse.inventory=warehouse.inventory||{};
  warehouse.inventory[f.type]=(warehouse.inventory[f.type]||0)+n;
  return n>0;
}
function takeFromWarehouse(warehouse,type){
  if(!warehouse?.inventory?.[type])return false;
  if(warehouse.inventory[type]<=0)return false;
  warehouse.inventory[type]--;warehouse.storage=Math.max(0,(warehouse.storage||0)-1);
  return true;
}

export function updateEconomy(s,dt,flash){
  for(const b of s.buildings){
    if(b.kind==='factory'){
      const f=spec(b.type);
      b.production+=dt*.46*b.level*f.speed*(1+b.loading*.1)*(1+(s.research?.automation||0)*.08);
      b.active=Math.min(1,b.active+dt*2.5);
      if(b.production>=1&&b.stock<b.max){
        const n=Math.floor(b.production);b.production-=n;b.stock=Math.min(b.max,b.stock+n);
      }
    }else{
      b.active=Math.max(0,b.active-dt*2.2);
      b.demand=Math.min(14,b.demand+dt*(.05+s.companyLevel*.003)*(1+b.level*.06));
      b.satisfaction=Math.max(0,Math.min(100,100-b.demand*4+(b.served||0)*1.5));
      b.sales=(b.sales||0)+dt*(b.served||0)*.2;
      if(!b.contract&&Math.random()<dt*.012)newContract(s,b);
      if(b.contract){
        b.contract.expires-=dt;
        if(b.contract.expires<=0){
          s.reputation=Math.max(0,s.reputation-4);b.contract=null;flash('Contract expired • reputation -4');
        }
      }
    }
  }

  for(const f of s.buildings.filter(b=>b.kind==='factory')){
    const hub=warehouseFor(s,f);
    if(hub&&f.stock>0&&Math.random()<dt*.8)transferToWarehouse(s,f,hub);
    const shops=s.buildings.filter(b=>b.kind==='shop'&&b.need===f.type&&b.demand>0);
    let choice=null,best=Infinity;
    for(const shop of shops){
      const r=route(s,f,shop);
      if(r&&r.distance<best){best=r.distance;choice=shop;}
    }
    const shop=choice;
    const hub=warehouseFor(s,shop);if(!shop||(!f.stock&&!(hub?.inventory?.[f.type]>0)))continue;

    if(Math.random()<dt*(1.4+f.level*.35)){
      const r=route(s,f,shop);
      if(!r)continue;
        const contract=shop.contract?.type===f.type?shop.contract:null;
      if(contract){
        const outstanding=(contract.inFlight||0);
        if(outstanding>=contract.remaining)continue;
      }

      const fromWarehouse=hub&&hub.inventory?.[f.type]>0&&!f.stock;if(fromWarehouse)takeFromWarehouse(hub,f.type);else f.stock--;shop.demand=Math.max(0,shop.demand-1);
      if(contract)contract.inFlight++;
      const sp=spec(f.type);
      const value=Math.max(1,Math.round(
        sp.price*sp.value*
        (1+Math.min(1.2,r.distance/650)*.45)*
        (1+(f.level-1)*.07+f.loading*.08)*
        (1+f.logistics*.04+(s.research?.logistics||0)*.04)
      ));
      s.trucks.push({
        route:r.points,t:0,speed:.085*sp.speed*(1+(f.level-1)*.08+f.loading*.04),
        value,to:shop,source:f,contractId:contract?.id||0,longDistance:r.distance>650,wait:0
      });
    }
  }

  for(const t of s.trucks){
    const p=pointOnRoute(t.route,t.t);
    let blocked=false;
    let nearestAhead=Infinity;
    for(const o of s.trucks){
      if(o===t||o.dead)continue;
      const q=pointOnRoute(o.route,o.t);
      const separation=dist(p,q);
      if(separation<30&&o.route===t.route&&o.t>t.t){
        nearestAhead=Math.min(nearestAhead,o.t-t.t);
      }
    }
    if(nearestAhead<.045){
      blocked=true;
      t.wait=Math.min(2,t.wait+dt);
    }else{
      t.wait=Math.max(0,t.wait-dt*.75);
    }
    if(blocked)continue;

    const congestionFactor=Math.max(.65,1-(s.congestion*.18));
    t.t+=dt*t.speed*congestionFactor;
    if(t.t>=1){
      s.cash+=t.value;s.deliveryIncome+=t.value;s.orders++;s.xp+=Math.max(2,Math.round(t.value*.08));t.to.served=(t.to.served||0)+1;t.to.satisfaction=Math.min(100,(t.to.satisfaction||50)+4);
      s.deliveredBy[t.source.type]=(s.deliveredBy[t.source.type]||0)+1;

      if(t.contractId&&t.to.contract?.id===t.contractId){
        const c=t.to.contract;
        c.remaining=Math.max(0,c.remaining-1);
        c.inFlight=Math.max(0,(c.inFlight||0)-1);
        if(c.remaining<=0){
          const bonus=c.urgent?Math.round(c.reward*.18):0;
          s.cash+=c.reward+bonus;
          s.reputation=Math.min(100,s.reputation+2);
          if(t.longDistance)s.longContracts++;
          t.to.contract=null;
          flash(`Contract complete • £${c.reward+bonus}`);
        }
      }
      t.dead=true;
    }
  }

  s.trucks=s.trucks.filter(t=>!t.dead);
  while(s.xp>=s.xpToNext){s.xp-=s.xpToNext;s.companyLevel++;s.xpToNext=Math.round(100*Math.pow(1.22,s.companyLevel-1));s.roadBudget+=3;flash(`Company Level ${s.companyLevel} • +3 roads`)}

  s.congestion=Math.min(1,(s.trucks.length+s.trucks.filter(t=>t.wait>0).length*1.5)/Math.max(3,s.roads.length*2));
  const reduction=s.trucks.reduce((n,t)=>n+(t.source?.logistics||0),0)/Math.max(1,s.trucks.length);
  s.cash-=s.roads.length*dt*.055*(1+s.congestion*Math.max(.55,1-reduction*.12));

  const g=s.goals[s.objective];
  if(g&&g.done(s))s.objective=Math.min(5,s.objective+1);
  if(s.cash<=0){s.cash=0;s.gameOver=true;}
}
