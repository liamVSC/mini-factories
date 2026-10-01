import {dist,finitePoint} from '../roads/geometry.js';
import {nearestRoad,roadPathBlocked} from '../roads/placement.js';
import {roadAttachment} from '../roads/routing.js';
import {resolveBuildingRoadEndpoint} from './connections.js';
import {
  buildingFootprint,
  nearestBuilding,
    buildingDockPoints
} from './geometry.js';

export function buildingPlacementTarget(s,type,p){
  if(!finitePoint(p)||!type)return null;

  const footprint=buildingFootprint({kind:type.kind});
  const raw={x:Number(p.x),y:Number(p.y)};
  const road=nearestRoad(s,raw);
  const building=nearestBuilding(s,raw);
  const candidates=[];

  if(road){
    const vx=raw.x-road.x;
    const vy=raw.y-road.y;
    const len=Math.hypot(vx,vy)||1;
    const ux=vx/len;
    const uy=vy/len;
    const support=Math.abs(ux)>Math.abs(uy)?footprint.halfWidth:footprint.halfDepth;

    candidates.push({
      point:{
        x:road.x+ux*(support+10),
        y:road.y+uy*(support+10)
      },
      snapType:'road',
      road:road.road,
      roadPoint:{x:road.x,y:road.y},
      distance:road.distance
    });
  }

  if(building){
    const vx=raw.x-building.x;
    const vy=raw.y-building.y;
    const len=Math.hypot(vx,vy)||1;
    const ux=vx/len;
    const uy=vy/len;
    const other=buildingFootprint(building);
    const support=Math.abs(ux)>Math.abs(uy)?footprint.halfWidth:footprint.halfDepth;
    const otherSupport=Math.abs(ux)>Math.abs(uy)?other.halfWidth:other.halfDepth;

    candidates.push({
      point:{
        x:building.x+ux*(otherSupport+support+12),
        y:building.y+uy*(otherSupport+support+12)
      },
      snapType:'building',
      building,
      distance:dist(raw,building)
    });
  }

  const snap=candidates.sort((a,b)=>a.distance-b.distance)[0];
  const snapped=!!snap&&snap.distance<=58;
  const point=snapped?snap.point:raw;

  const accessPoints=[
    {side:'north',x:point.x,y:point.y-footprint.halfDepth,active:false},
    {side:'east',x:point.x+footprint.halfWidth,y:point.y,active:false},
    {side:'south',x:point.x,y:point.y+footprint.halfDepth,active:false},
    {side:'west',x:point.x-footprint.halfWidth,y:point.y,active:false}
  ];

  let connection=null;
  if(snapped){
    let best=accessPoints[0];
    let bestDistance=Infinity;
    const target=snap.roadPoint||{x:snap.building.x,y:snap.building.y};

    for(const access of accessPoints){
      const distance=dist(access,target);
      if(distance<bestDistance){
        bestDistance=distance;
        best=access;
      }
    }

    best.active=true;
    connection={
      from:snap.roadPoint||best,
      to:best
    };

    if(snap.snapType==='building'){
      const resolved=resolveBuildingRoadEndpoint(s,point,snap.building);
      connection.to=resolved?.point||connection.to;
    }
  }

  return{
    point,
    snapType:snapped?snap.snapType:null,
    road:snap?.road||null,
    building:snap?.building||null,
    roadPoint:snap?.roadPoint||null,
    accessPoints,
    connection
  };
}

export function buildingLogisticsAccess(s,building){
  if(!building||!Array.isArray(s?.buildings)||!s.buildings.includes(building))return null;

  const attachment=roadAttachment(s,building);
  if(!attachment||!s.roads?.includes(attachment.road))return null;

  const docks=buildingDockPoints(building);
  const dock=docks.reduce((best,current)=>{
    const score=dist(attachment.point,current.approach);
    return !best||score<best.score?{...current,score}:best;
  },null);

  if(!dock)return null;

  const driveway=[
    {x:attachment.point.x,y:attachment.point.y},
    {x:dock.approach.x,y:dock.approach.y}
  ];

  return{
    road:attachment.road,
    roadPoint:{...attachment.point},
    dock,
    driveway,
    connected:!roadPathBlocked(s,driveway,{end:building}),
    roadNetworkRevision:Math.max(0,Math.floor(Number(s.roadNetworkRevision)||0))
  };
}
