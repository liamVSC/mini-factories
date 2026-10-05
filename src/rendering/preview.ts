import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import {buildingSitePlan} from './sitePlan.js';
import {box,material,disposeObjectGroup} from './three.js';
import {ribbon,rounded} from './roads.js';

function clear(group:any){while(group.children.length){const child=group.children.pop();if(child)disposeObjectGroup(child);}}

export function setRoadPreview(group:any,path:any[]|null,blocked=false){
  clear(group);if(!Array.isArray(path)||path.length<2)return;
  const mesh=ribbon(rounded(path),18,.95,material(blocked?'#c65a54':'#e1b84b',.7));if(mesh)group.add(mesh);
}
export function setBuildingPreview(group:any,type:any,point:{x:number;y:number}|null,blocked=false){
  clear(group);if(!point||!type)return;const plan=buildingSitePlan({...type,id:'building-preview',x:point.x,y:point.y});if(!plan)return;
  const m=material(blocked?'#c65a54':'#63a987',.65);m.transparent=true;m.opacity=.32;const mesh=new THREE.Mesh(new any(plan.width,10,plan.depth),m);mesh.position.set(point.x,5,point.y);group.add(mesh);
}
