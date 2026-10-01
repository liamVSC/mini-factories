import {freshState,goalList} from '../state.js';
import {buildingFootprint} from '../world/buildings/geometry.js';
import {isInsideWorldBounds} from '../world/roads/validation.js';
import {riverY} from '../world/terrain.js';
import {buildingFootprint} from '../world/buildings/geometry.js';
import {isInsideWorldBounds} from '../world/roads/validation.js';
import {riverY} from '../world/terrain.js';

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clampNumber=(value,min,max,fallback=min)=>Math.max(min,Math.min(max,finite(value,fallback)));

function buildingOverlaps(a,b){
  const af=buildingFootprint(a),bf=buildingFootprint(b);
  const clearance=a.kind==='factory'&&b.kind==='factory'?72:(a.kind==='factory'||b.kind==='factory'?36:18);
  return Math.abs(Number(a.x)-Number(b.x))<af.halfWidth+bf.halfWidth+clearance&&Math.abs(Number(a.y)-Number(b.y))<af.halfDepth+bf.halfDepth+clearance;
}

function repairBuildingLayout(buildings){
  const accepted=[];
  for(const b of buildings){
    let candidate=b;
    const conflict=accepted.some(other=>buildingOverlaps(candidate,other));
    if(conflict){
      let found=null;
      for(let ring=1;ring<=14&&!found;ring++){
        const radius=ring*70;
        for(let i=0;i<24;i++){
          const angle=(i/24)*Math.PI*2;
          const raw={x:Number(b.x)+Math.cos(angle)*radius,y:Number(b.y)+Math.sin(angle)*radius};
          const x=Math.max(-1276,Math.min(1276,raw.x));
          const y=Math.max(-1276,Math.min(1276,raw.y));
          const test={...b,x,y};
          if(!isInsideWorldBounds(test,24)||Math.abs(y-riverY(x))<105+Math.max(buildingFootprint(test).halfDepth,buildingFootprint(test).halfWidth)*.18)continue;
          if(!accepted.some(other=>buildingOverlaps(test,other))){found=test;break}
        }
      }
      if(found)candidate=found;else continue;
    }
    accepted.push(candidate);
  }
  return accepted;
}

export function hydrate(d){
  if(!d||d.version<2||!Array.isArray(d.buildings)||!Array.isArray(d.roads))return null;
  const s=freshState();
  s.gameSeed=Math.max(1,Math.floor(finite(d.gameSeed,Math.floor(Math.random()*0x7fffffff)||1)));
  s.layoutSeed=Math.max(1,Math.floor(finite(d.layoutSeed,s.gameSeed)));
  const keys=Object.keys(s);
  for(const k of keys)if(Object.prototype.hasOwnProperty.call(d,k)&&k!=='week'&&k!=='weekTime'&&k!=='version')s[k]=d[k];
  s.version=6;s.renderVersion=Math.max(0,Math.floor(finite(s.renderVersion,0)));s.selected=null;s.trucks=[];s.particles=[];s.goals=goalList();
  s.cash=clampNumber(s.cash,0,Number.MAX_SAFE_INTEGER,500);
  s.orders=Math.max(0,Math.floor(finite(s.orders,0)));
  s.companyLevel=Math.max(1,Math.floor(finite(s.companyLevel,1)));
  s.xp=Math.max(0,finite(s.xp,0));
  s.xpToNext=Math.max(100,finite(s.xpToNext,100));
  s.reputation=clampNumber(s.reputation,0,100,100);
  s.deliveryIncome=Math.max(0,finite(s.deliveryIncome,0));
  s.longContracts=Math.max(0,Math.floor(finite(s.longContracts,0)));
  s.contractId=Math.max(1,Math.floor(finite(s.contractId,1)));
  s.deliveredBy=s.deliveredBy&&typeof s.deliveredBy==='object'?s.deliveredBy:{};
  for(const key of Object.keys(s.deliveredBy))s.deliveredBy[key]=Math.max(0,Math.floor(finite(s.deliveredBy[key],0)));
  s.objective=Math.max(0,Math.min(5,Math.floor(finite(d.objective,0))));
  s.research={...freshState().research,...(d.research||{})};
  s.trafficSignals={...freshState().trafficSignals,...(d.trafficSignals||{})};
  s.trafficSignals.enabled=!!s.trafficSignals.enabled;
  s.trafficSignals.cycle=Math.max(8,Math.min(30,finite(s.trafficSignals.cycle,12)));
  s.roadNetworkRevision=Math.max(0,Math.floor(finite(s.roadNetworkRevision,0)));
  for(const key of Object.keys(s.research))s.research[key]=clampNumber(s.research[key],0,3,0);
  s.buildings=s.buildings.filter(b=>b&&Number.isFinite(Number(b.x))&&Number.isFinite(Number(b.y))&&b.type&&b.kind).map(b=>{
    b.x=finite(b.x);b.y=finite(b.y);b.r=clampNumber(b.r,20,60,25);b.level=Math.max(1,Math.floor(finite(b.level,1)));
    b.max=Math.max(1,Math.floor(finite(b.max,b.kind==='factory'?4:b.kind==='warehouse'?24:8)));
    b.stock=Math.max(0,finite(b.stock,0));b.production=Math.max(0,finite(b.production,0));b.demand=Math.max(0,finite(b.demand,0));
    b.served=Math.max(0,finite(b.served,0));b.satisfaction=clampNumber(b.satisfaction,0,100,b.kind==='shop'?100:0);
    b.loading=Math.max(0,Math.floor(finite(b.loading,0)));b.logistics=Math.max(0,Math.floor(finite(b.logistics,0)));
    b.active=clampNumber(b.active,0,1,0);b.pulse=finite(b.pulse,Math.random()*6.28);
    if(b.kind==='warehouse'){b.storage=Math.max(0,finite(b.storage,0));b.storage=Math.min(b.storage,b.max);b.inventory=b.inventory&&typeof b.inventory==='object'?b.inventory:{}}
    return b;
  });
  s.buildings=repairBuildingLayout(s.buildings);
  s.roads=s.roads.filter(r=>r&&Array.isArray(r.points)&&r.points.length>=2&&r.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))).map(r=>({...r,points:r.points.map(p=>({x:Number(p.x),y:Number(p.y)})),bridge:!!r.bridge,condition:Number.isFinite(r.condition)?r.condition:1,age:Number.isFinite(r.age)?r.age:0}));
  s.buildMode=null;
  return s;
}
