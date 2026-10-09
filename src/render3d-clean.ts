import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import type { GameState, Building } from './state.js';
import type { Point } from './world/worldTypes.js';
import { RenderCamera } from './rendering/camera.js';
import { makeBuilding } from './rendering/buildings.js';
import { RenderScene } from './rendering/scene.js';
import { setBuildingPreview as drawBuildingPreview, setRoadPreview } from './rendering/preview.js';
import { buildRoadGroup, rounded } from './rendering/roads.js';
import { syncTrucks, updateTrucks } from './rendering/trucks.js';
import {BRIDGE_SURFACE_Y,GRASS_SURFACE_Y,ROAD_SURFACE_Y,WATER_SURFACE_Y} from './rendering/surfaceHeights.js';

const sceneRuntime=new RenderScene();
const cameraRuntime=new RenderCamera();
const buildingMeshes=new Map<string,any>();
const truckMeshes=new Map<string,any>();
let worldKey='';
let framedGameSeed:number|null=null;
let lastRenderedState:GameState|null=null;

function starterCameraFrame(state:GameState){
  const factories=(state.buildings||[]).filter(building=>building.kind==='factory');
  const shops=(state.buildings||[]).filter(building=>building.kind==='shop');
  if(!factories.length)return{x:0,z:0,distance:1250,yaw:0,pitch:.82};
  let best:{factory:Building;shop:Building;separation:number}|null=null;
  for(const factory of factories)for(const shop of shops){
    const separation=Math.hypot(shop.x-factory.x,shop.y-factory.y);
    if(!best||separation<best.separation)best={factory,shop,separation};
  }
  if(!best){
    const factory=factories[0];
    return{x:factory.x,z:factory.y,distance:1250,yaw:0,pitch:.82};
  }
  const {factory,shop,separation}=best;
  // Align the closest factory/shop pair along the camera depth axis so both
  // remain in the initial portrait viewport instead of spawning off-screen.
  return{
    x:(factory.x+shop.x)/2,
    z:(factory.y+shop.y)/2,
    distance:Math.max(1050,Math.min(1250,900+separation*.45)),
    yaw:Math.atan2(shop.x-factory.x,shop.y-factory.y),
    pitch:.82
  };
}

function buildingKey(state:GameState){
  return JSON.stringify((state.buildings||[]).map(b=>[b.id,b.kind,b.type,b.x,b.y,b.color]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
function roadKey(state:GameState){
  return JSON.stringify((state.roads||[]).map(r=>[r.id,r.bridge,r.points]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
function rebuildWorld(state:GameState){
  sceneRuntime.clearRoot();buildingMeshes.clear();truckMeshes.clear();
  // A malformed road must never prevent the base map, buildings or UI from rendering.
  // Keep the world rebuild atomic from the renderer's point of view: roads are optional,
  // while the terrain/building scene is still a valid playable state.
  try{sceneRuntime.root.add(buildRoadGroup(state.roads,state));}
  catch(error){console.warn('Mini Factories: road renderer recovered from an invalid road state',error);}
  for(const building of state.buildings){
    try{
      const model=makeBuilding(building),anchor=new THREE.Group();
      anchor.name=`building-anchor-${building.id}`;
      anchor.position.set(Number(building.x)||0,0,Number(building.y)||0);
      anchor.add(model);sceneRuntime.root.add(anchor);buildingMeshes.set(building.id,model);
    }catch(error){console.warn('Mini Factories: building renderer skipped an invalid building',building.id,error);}
  }
  try{syncTrucks(sceneRuntime.root,truckMeshes,state.trucks);}catch(error){console.warn('Mini Factories: truck renderer recovered from invalid truck state',error);}
  worldKey=buildingKey(state)+'|'+roadKey(state);
}
function updateSelection(state:GameState){
  for(const [id,model] of buildingMeshes){
    const selected=state.buildings.some((building:Building)=>building.id===id&&state.selected===building);
    model.traverse((object:any)=>{
      if(!object.isMesh||!object.material?.emissive)return;
      object.material.emissive.setHex(selected?0x294634:0);
      object.material.emissiveIntensity=selected?.32:0;
    });
  }
}
function ensureCanvas(canvas:HTMLCanvasElement|null):HTMLCanvasElement|null{
  return canvas||document.querySelector<HTMLCanvasElement>('#game');
}

export function render(state:GameState,width:number,height:number,canvas:HTMLCanvasElement|null=document.querySelector<HTMLCanvasElement>('#game')){
  const target=ensureCanvas(canvas);if(!target)return;
  if(!sceneRuntime.ready)sceneRuntime.init(target);
  if(sceneRuntime.recovering)return;
  sceneRuntime.resize(width,height);cameraRuntime.resize(width,height);
  if(framedGameSeed!==state.gameSeed){
    const frame=starterCameraFrame(state);
    cameraRuntime.frame(frame.x,frame.z,frame.distance,frame.yaw,frame.pitch);
    framedGameSeed=state.gameSeed;
  }
  lastRenderedState=state;
  const key=buildingKey(state)+'|'+roadKey(state);
  if(key!==worldKey)rebuildWorld(state);
  updateTrucks(sceneRuntime.root,truckMeshes,state.trucks);updateSelection(state);
  cameraRuntime.interpolate();sceneRuntime.render(cameraRuntime.threeCamera);
}
export function setPreview(path:Point[]|null,_start:Point|null,_end:Point|null,blocked=false){setRoadPreview(sceneRuntime.previewGroup,path,blocked);}
export function setBuildingPreview(type:any,point:Point|null,blocked=false){drawBuildingPreview(sceneRuntime.buildingPreviewGroup,type,point,blocked);}
export function resize(width:number,height:number){sceneRuntime.resize(width,height);cameraRuntime.resize(width,height);}
export function controlCamera(dx:number,dy:number,distanceDelta=0,yawDelta=0,pitchDelta=0){cameraRuntime.control(dx,dy,distanceDelta,yawDelta,pitchDelta);}
export function screenToWorld(x:number,y:number,width=globalThis.innerWidth,height=globalThis.innerHeight){return cameraRuntime.screenToWorld(x,y,width,height);}
export function worldToScreen(x:number,y:number,width=globalThis.innerWidth,height=globalThis.innerHeight){return cameraRuntime.worldToScreen(x,y,width,height);}
export function panScreen(dx:number,dy:number,width=globalThis.innerWidth,height=globalThis.innerHeight){cameraRuntime.panScreen(dx,dy,width,height);}
export function zoomAtScreen(x:number,y:number,zoom:number,width=globalThis.innerWidth,height=globalThis.innerHeight){cameraRuntime.zoomAtScreen(x,y,zoom,width,height);}
export function resetCamera(){
  if(lastRenderedState){
    const frame=starterCameraFrame(lastRenderedState);
    cameraRuntime.frame(frame.x,frame.z,frame.distance,frame.yaw,frame.pitch);
  }else cameraRuntime.reset();
}
export function focusCamera(x:number,y:number){cameraRuntime.focus(x,y);}
export function renderDiagnostics(){
  const roadObjects:any[]=[],buildingObjects:any[]=[];
  sceneRuntime.root.traverse((object:any)=>{
    if(object.userData?.road){
      const bounds=new THREE.Box3().setFromObject(object);let descendants=0;object.traverse((child:any)=>{if(child!==object)descendants++;});
      roadObjects.push({id:object.userData.road.id,objectChildren:object.children.length,objectDescendants:descendants,visible:object.visible,bounds:{min:{x:bounds.min.x,z:bounds.min.z},max:{x:bounds.max.x,z:bounds.max.z}},logicalPoints:rounded(object.userData.road.points)});
    }
    if(typeof object.name==='string'&&object.name.startsWith('building-anchor-')){const bounds=new THREE.Box3().setFromObject(object);buildingObjects.push({id:object.name.slice('building-anchor-'.length),position:{x:object.position.x,z:object.position.z},projectedCenter:cameraRuntime.worldToScreen(object.position.x,object.position.z),children:object.children.length,bounds:{min:{x:bounds.min.x,z:bounds.min.z},max:{x:bounds.max.x,z:bounds.max.z}}});}
  });
  return {roadObjectCount:roadObjects.length,roadObjects,buildingObjectCount:buildingObjects.length,buildingObjects,viewport:{width:globalThis.innerWidth||1,height:globalThis.innerHeight||1},camera:cameraRuntime.snapshot(),terrainSurfaceLevels:{water:WATER_SURFACE_Y,grass:GRASS_SURFACE_Y,road:ROAD_SURFACE_Y,bridge:BRIDGE_SURFACE_Y},environmentTreeCount:sceneRuntime.scene?.userData?.environmentTreeCount||0,rootObjectCount:sceneRuntime.root.children.length,rendererReady:sceneRuntime.ready,sceneReady:sceneRuntime.ready};
}
if(typeof window!=='undefined')(window as any).__miniFactoriesRenderDiagnostics=renderDiagnostics;
