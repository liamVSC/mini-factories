import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import type { Truck } from '../world/worldTypes.js';
import {box,cyl,glass,material,disposeObjectGroup} from './three.js';

export function createTruckMesh(){
  const g=new THREE.Group(),cab=material('#5d6764',.82,.12),trailer=material('#aeb5b1',.9),dark=material('#242a2a',.98),glassMat=glass('#3b5c62'),metal=material('#6c7570',.75,.18);
  box(g,7,6.8,7,cab,4,4.3,0);box(g,3,3.2,6.5,glassMat,7.1,5.3,0);box(g,12,7.8,7.6,trailer,-4.5,4.7,0);box(g,12.2,.6,7.9,metal,-4.5,8.8,0);
  for(const x of[-7,-2.5,3.8,6.4])for(const z of[-3.85,3.85]){const w=cyl(g,1.55,1.15,dark,x,1.65,z,16);w.rotation.x=Math.PI/2;}
  box(g,.5,1.2,.6,material('#e6d7aa',.5),7.7,4,-3.1);box(g,.5,1.2,.6,material('#e6d7aa',.5),7.7,4,3.1);return g;
}
export function routePoint(points:any,t:number){if(!Array.isArray(points)||points.length<2)return null;let total=0;for(let i=1;i<points.length;i++)total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);if(total<.01)return points[0];const want=Math.max(0,Math.min(1,t))*total;let run=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(run+len>=want){const q=(want-run)/len;return{x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q};}run+=len;}return points.at(-1);}
export function syncTrucks(root:THREE.Group,truckMeshes:Map<string,THREE.Group>,trucks:Truck[]){
  const active=new Set<string>();
  for(const t of trucks||[]){const id=String(t?.id||'');if(!id)continue;active.add(id);if(!truckMeshes.has(id)){const m=createTruckMesh();m.userData.truckId=id;root.add(m);truckMeshes.set(id,m);}}
  for(const [id,m] of truckMeshes){if(active.has(id))continue;truckMeshes.delete(id);root.remove(m);disposeObjectGroup(m);}
}
export function updateTrucks(root:THREE.Group,truckMeshes:Map<string,THREE.Group>,trucks:Truck[]){
  syncTrucks(root,truckMeshes,trucks);const byId=new Map((trucks||[]).map(t=>[String(t?.id||''),t]));
  for(const [id,m] of truckMeshes){const t=byId.get(id);if(!t||t.dead||!Array.isArray(t.route)){m.visible=false;continue;}const p=routePoint(t.route,t.t??0);if(!p){m.visible=false;continue;}m.visible=true;m.position.set(p.x,1,p.y);const q=routePoint(t.route,Math.min(1,(t.t??0)+.015))||p;m.rotation.y=-Math.atan2(q.y-p.y,q.x-p.x);}
}
