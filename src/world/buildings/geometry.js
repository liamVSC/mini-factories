import {finitePoint} from '../roads/geometry.js';
import {isInsideWorldBounds} from '../roads/validation.js';
import {riverY,WORLD_MARGIN} from '../terrain.js';

export function buildingClearance(a,b){
  if(a?.kind==='factory'&&b?.kind==='factory')return 55;
  if(a?.kind==='factory'||b?.kind==='factory')return 36;
  return 18;
}

// Include the rendered site's practical envelope, not only the central building shell.
// This keeps yards, gates and parking from visually overlapping neighbouring sites.
const PLACEMENT_FOOTPRINTS=Object.freeze({
  // These are the full practical site envelopes, including the enlarged depot
  // yard and the single truck gate/driveway. They are deliberately larger than
  // the rendered building shell so neighbouring sites cannot overlap visually.
  warehouse:Object.freeze({halfWidth:105,halfDepth:150}),
  factory:Object.freeze({halfWidth:95,halfDepth:140}),
  shop:Object.freeze({halfWidth:82,halfDepth:115}),
  default:Object.freeze({halfWidth:50,halfDepth:62})
});

function footprintForKind(kind){
  return PLACEMENT_FOOTPRINTS[kind]||PLACEMENT_FOOTPRINTS.default;
}

// Road connections use the rendered building shell, not the larger site/yard
// placement envelope. The latter is intentionally used for construction
// clearance, but must not make a road endpoint think it is still inside a
// building after the endpoint has moved beyond the actual model.
const ROAD_CONNECTION_FOOTPRINTS=Object.freeze({
  warehouse:Object.freeze({halfWidth:48,halfDepth:36}),
  factory:Object.freeze({halfWidth:40,halfDepth:32}),
  shop:Object.freeze({halfWidth:36,halfDepth:36}),
  default:Object.freeze({halfWidth:36,halfDepth:36})
});

function roadConnectionFootprintForKind(kind){
  return ROAD_CONNECTION_FOOTPRINTS[kind]||ROAD_CONNECTION_FOOTPRINTS.default;
}

export function buildingRoadFootprint(building){
  return roadConnectionFootprintForKind(building?.kind);
}

export function buildingVisualFootprint(building){
  return {...(PLACEMENT_FOOTPRINTS[building?.kind]||PLACEMENT_FOOTPRINTS.default)};
}

export function buildingVisualHitbox(building,tolerance=0){
  const footprint=buildingVisualFootprint(building);
  const x=Number(building?.x),y=Number(building?.y);
  return{
    minX:x-footprint.halfWidth-tolerance,
    maxX:x+footprint.halfWidth+tolerance,
    minY:y-footprint.halfDepth-tolerance,
    maxY:y+footprint.halfDepth+tolerance
  };
}

function overlapsBuilding(candidate,b,clearance){
  const other=buildingSiteFootprint(b);
  const overlapX=Math.abs(Number(b.x)-candidate.x)<candidate.footprint.halfWidth+other.halfWidth+clearance;
  const overlapY=Math.abs(Number(b.y)-candidate.y)<candidate.footprint.halfDepth+other.halfDepth+clearance;
  return overlapX&&overlapY;
}

export function buildingPhysicalPlacementReason(s,type,x,y){
  if(!type)return'Unknown building';
  const px=Number(x),py=Number(y);
  if(!Number.isFinite(px)||!Number.isFinite(py))return'Invalid placement';
  if(!isInsideWorldBounds({x:px,y:py},WORLD_MARGIN))return'Outside the playable area';

  const candidate={kind:type.kind,x:px,y:py,footprint:buildingSiteFootprint({kind:type.kind})};
  for(const building of s.buildings||[]){
    if(!finitePoint(building))continue;
    if(candidate.kind==='factory'&&building.kind==='factory'&&Math.hypot(px-Number(building.x),py-Number(building.y))<250){
      return'Too close to another factory';
    }
    if(overlapsBuilding(candidate,building,buildingClearance(candidate,building))){
      return candidate.kind==='factory'&&building.kind==='factory'
        ?'Too close to another factory'
        :'Too close to another building';
    }
  }

  const riverClearance=105+Math.max(candidate.footprint.halfDepth,candidate.footprint.halfWidth)*.18;
  if(Math.abs(py-riverY(px))<riverClearance)return'Too close to the river';
  return null;
}

export function buildingHitbox(building,tolerance=0){
  const footprint=buildingFootprint(building);
  return{
    minX:building.x-footprint.halfWidth-tolerance,
    maxX:building.x+footprint.halfWidth+tolerance,
    minY:building.y-footprint.halfDepth-tolerance,
    maxY:building.y+footprint.halfDepth+tolerance
  };
}

export function buildingAtPoint(s,p,tolerance=10){
  if(!finitePoint(p))return null;

  let best=null;
  let bestDistance=Infinity;
  for(const building of s.buildings||[]){
    const hit=buildingHitbox(building,tolerance);
    const dx=Math.max(hit.minX-p.x,0,p.x-hit.maxX);
    const dy=Math.max(hit.minY-p.y,0,p.y-hit.maxY);
    const distance=Math.hypot(dx,dy);

    if(distance<=tolerance&&distance<bestDistance){
      best=building;
      bestDistance=distance;
    }
  }
  return best;
}

export function nearestBuilding(s,p){
  return buildingAtPoint(s,p,18);
}

const SHELL_FOOTPRINTS=Object.freeze({
  warehouse:Object.freeze({halfWidth:82,halfDepth:56}),
  factory:Object.freeze({halfWidth:75,halfDepth:56}),
  shop:Object.freeze({halfWidth:66,halfDepth:47}),
  default:Object.freeze({halfWidth:48,halfDepth:40})
});

export function buildingFootprint(building){
  return SHELL_FOOTPRINTS[building?.kind]||SHELL_FOOTPRINTS.default;
}

export function buildingSiteFootprint(building){
  return footprintForKind(building?.kind);
}

const DOCK_SPECS={
  factory:[
    {name:'north-loading',x:0,y:56,normal:{x:0,y:1},width:28},
    {name:'south-loading',x:-38,y:-56,normal:{x:0,y:-1},width:18}
  ],
  warehouse:[
    {name:'north-main',x:0,y:60,normal:{x:0,y:1},width:32},
    {name:'north-secondary',x:-48,y:60,normal:{x:0,y:1},width:18},
    {name:'south-secondary',x:48,y:-60,normal:{x:0,y:-1},width:18}
  ],
  default:[
    {name:'front-entrance',x:0,y:-47,normal:{x:0,y:-1},width:18}
  ]
};

export function buildingDockPoints(building){
  const x=Number(building?.x)||0;
  const y=Number(building?.y)||0;
  const specs=DOCK_SPECS[building?.kind]||DOCK_SPECS.default;

  return specs.map(dock=>({
    ...dock,
    point:{x:x+dock.x,y:y+dock.y},
    approach:{
      x:x+dock.x+dock.normal.x*10,
      y:y+dock.y+dock.normal.y*10
    }
  }));
}

// Every site has one canonical truck entrance. Secondary visual loading bays can
// remain as scenery, but simulation/road snapping must always use this dock.
export function buildingPrimaryDock(building){
  return buildingDockPoints(building)[0]||null;
}

export function buildingRoadEntrance(building){
  const dock=buildingPrimaryDock(building);
  if(!dock)return null;
  // Put the road connection beyond the yard gate. The driveway between this
  // point and dock.approach is the only truck entry/exit path for the site.
  // Keep the gate far enough out in the enlarged yard to give trucks a real
  // approach/turning area, while remaining inside the road-snap search envelope.
  const gateOffset=42;
  return{
    x:dock.approach.x+dock.normal.x*gateOffset,
    y:dock.approach.y+dock.normal.y*gateOffset,
    building
  };
}

export function buildingRoadHitbox(building,tolerance=0){
  const footprint=buildingRoadFootprint(building);
  return{
    minX:Number(building?.x)-footprint.halfWidth-tolerance,
    maxX:Number(building?.x)+footprint.halfWidth+tolerance,
    minY:Number(building?.y)-footprint.halfDepth-tolerance,
    maxY:Number(building?.y)+footprint.halfDepth+tolerance
  };
}

export function buildingConnectionPoint(building,target,exteriorOffset=2.5){
  const entrance=buildingRoadEntrance(building);
  if(entrance)return entrance;
  return null;
}

export function buildingFootprintRadius(building){
  const footprint=buildingRoadFootprint(building);
  return Math.max(
    26,
    (building?.r||25)+9,
    Math.min(footprint.halfWidth,footprint.halfDepth)
  );
}
