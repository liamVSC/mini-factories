function routeLength(points){
  let total=0;
  for(let i=1;i<points.length;i++)total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
  return total;
}

function pointAtDistance(points,distance){
  let travelled=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],segment=Math.hypot(b.x-a.x,b.y-a.y);
    if(segment<.001)continue;
    if(travelled+segment>=distance){
      const t=(distance-travelled)/segment;
      return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    }
    travelled+=segment;
  }
  return points.at(-1);
}

export function truckRenderPose(truck,lookAhead=10){
  const route=Array.isArray(truck?.laneRoute)&&truck.laneRoute.length>=2?truck.laneRoute:truck?.route;
  if(!Array.isArray(route)||route.length<2||!Number.isFinite(truck?.t))return null;
  const points=route.filter(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y));
  if(points.length<2)return null;
  const total=routeLength(points);
  if(total<.001)return null;
  const progress=Math.max(0,Math.min(1,truck.t))*total;
  const position=pointAtDistance(points,progress);
  const ahead=pointAtDistance(points,Math.min(total,progress+Math.max(1,lookAhead)));
  const behind=progress>0?pointAtDistance(points,Math.max(0,progress-Math.max(1,lookAhead))):position;
  let direction={x:ahead.x-position.x,y:ahead.y-position.y};
  if(Math.hypot(direction.x,direction.y)<.001)direction={x:position.x-behind.x,y:position.y-behind.y};
  if(Math.hypot(direction.x,direction.y)<.001)return null;
  return{x:position.x,y:position.y,yaw:-Math.atan2(direction.y,direction.x)};
}
