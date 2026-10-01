import {dist,projectSegment,collinearOverlapLength,segmentDistance} from './geometry.js';

function reconcileRoadJunctions(s,points,meta={}

function roadsHaveMeaningfulOverlap(a,b){const ap=a?.points||[],bp=b?.points||[];if(ap.length<2||bp.length<2)return false;let overlap=0;for(let i=1;i<ap.length;i++)for(let j=1;j<bp.length;j++)overlap=Math.max(overlap,collinearOverlapLength(ap[i-1],ap[i],bp[j-1],bp[j]));const aLen=length(ap),bLen=length(bp);return overlap>=24||overlap>=Math.min(aLen,bLen)*.65}

function roadGeometrySignature(road){return(road?.points||[]).map(p=>`${Math.round(p.x*10)/10},${Math.round(p.y*10)/10}`).join('|')}

function roadsExactlyDuplicate(a,b){if(!a?.points||!b?.points)return false;if(roadGeometrySignature(a)===roadGeometrySignature(b))return true;return roadGeometrySignature({...a,points:[...a.points].reverse()})===roadGeometrySignature(b)}

export function routeTouchesRoad(route,road,tolerance=3){if(!Array.isArray(route)||route.length<2||!road?.points||road.points.length<2)return false;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i];for(let j=1;j<road.points.length;j++){const c=road.points[j-1],d=road.points[j],ab={x:b.x-a.x,y:b.y-a.y},cd={x:d.x-c.x,y:d.y-c.y},cross=Math.abs(ab.x*cd.y-ab.y*cd.x),aligned=cross<=1e-6*Math.max(1,Math.hypot(ab.x,ab.y)*Math.hypot(cd.x,cd.y));if(aligned){if(collinearOverlapLength(a,b,c,d)>tolerance)return true}else if(segmentDistance(a,b,c,d)<=tolerance&&segmentDistance(a,b,c,d)>tolerance*.25)return true}}return false}

export {reconcileRoadJunctions,roadsHaveMeaningfulOverlap,roadGeometrySignature,roadsExactlyDuplicate};
