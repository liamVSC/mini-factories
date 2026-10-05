import type { Point, Road } from '../worldTypes.js';
import {dist,length,projectSegment,segmentIntersection,addNode,collinearOverlapLength} from './geometry.js';

export function roadsHaveMeaningfulOverlap(a:Road,b:Road):boolean{const ap=a?.points||[],bp=b?.points||[];if(ap.length<2||bp.length<2)return false;let overlap=0;for(let i=1;i<ap.length;i++)for(let j=1;j<bp.length;j++)overlap=Math.max(overlap,collinearOverlapLength(ap[i-1],ap[i],bp[j-1],bp[j]));const aLen=length(ap),bLen=length(bp);return overlap>=24||overlap>=Math.min(aLen,bLen)*.65}
function roadGeometrySignature(road:Road):string{return(road?.points||[]).map(p=>`${Math.round(p.x*10)/10},${Math.round(p.y*10)/10}`).join("|")}
export function roadsExactlyDuplicate(a:Road,b:Road):boolean{if(!a?.points||!b?.points)return false;if(roadGeometrySignature(a)===roadGeometrySignature(b))return true;return roadGeometrySignature({...a,points:[...a.points].reverse()})===roadGeometrySignature(b)}
export function buildRoadIntersections(valid:Road[],nodes:Point[],marks:Map<Road,Point[][]>,virtualEdges:{a:Point;b:Point;d:number;road:Road}[]):void{
  for(let ri=0;ri<valid.length;ri++){const aRoad=valid[ri];for(let qi=ri;qi<valid.length;qi++){const bRoad=valid[qi];for(let i=1;i<aRoad.points.length;i++){const a=aRoad.points[i-1],b=aRoad.points[i],first=aRoad===bRoad?i:1;for(let j=first;j<bRoad.points.length;j++){if(aRoad===bRoad&&i===j)continue;const hit=segmentIntersection(a,b,bRoad.points[j-1],bRoad.points[j]);if(!hit)continue;const n=addNode(nodes,hit);marks.get(aRoad)![i-1].push(n);marks.get(bRoad)![j-1].push(n);}}}}
  const junctionTolerance=6;
  const connectEndpoint=(road:Road,index:number,node:Point)=>{const endpoint=addNode(nodes,road.points[index],.5),d=dist(endpoint,node);if(d>.001)virtualEdges.push({a:endpoint,b:node,d,road});};
  for(let ri=0;ri<valid.length;ri++)for(let qi=ri;qi<valid.length;qi++){const aRoad=valid[ri],bRoad=valid[qi];const aEnds=[{index:0,point:aRoad.points[0]},{index:aRoad.points.length-1,point:aRoad.points.at(-1)!}],bEnds=[{index:0,point:bRoad.points[0]},{index:bRoad.points.length-1,point:bRoad.points.at(-1)!}];if(aRoad===bRoad)continue;
    for(const aEnd of aEnds)for(const bEnd of bEnds){if(dist(aEnd.point,bEnd.point)>junctionTolerance)continue;const n=addNode(nodes,{x:(aEnd.point.x+bEnd.point.x)/2,y:(aEnd.point.y+bEnd.point.y)/2},.5);connectEndpoint(aRoad,aEnd.index,n);connectEndpoint(bRoad,bEnd.index,n);}
    for(const aEnd of aEnds)for(let j=1;j<bRoad.points.length;j++){const q=projectSegment(aEnd.point,bRoad.points[j-1],bRoad.points[j]);if(q.distance>junctionTolerance)continue;const n=addNode(nodes,q.point,.5);connectEndpoint(aRoad,aEnd.index,n);marks.get(bRoad)![j-1].push(n);}
    for(const bEnd of bEnds)for(let i=1;i<aRoad.points.length;i++){const q=projectSegment(bEnd.point,aRoad.points[i-1],aRoad.points[i]);if(q.distance>junctionTolerance)continue;const n=addNode(nodes,q.point,.5);connectEndpoint(bRoad,bEnd.index,n);marks.get(aRoad)![i-1].push(n);}
  }
}
