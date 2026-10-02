import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm';
import {riverY,isInsideWorldBounds,WORLD_BOUNDS,WORLD_MARGIN,WORLD_HALF_SIZE,roadTopology,buildingConnectionPoint,buildingHitbox,buildingDockPoints,roadAttachment} from './world.js';
import {savedBuildingToWorldPosition,buildingRenderTrace} from './rendering/buildingTransform.js';

let renderer=null,scene=null,camera3d=null,root=null,previewGroup=null,buildingPreviewGroup=null,roadEditGroup=null,roadEndpointGroup=null;
let target={x:0,z:0,yaw:0,pitch:.82,distance:620};
let desired={...target};
let home={x:0,z:0};
let cameraReady=false;
let viewport={width:1,height:1};
let previewKey='';
let buildingPreviewKey='';
let roadEditKey='';
let lastBuildingSelection=null;
const meshes=new Map();
const worldObjects=new Set();
const truckMeshes=new Map();
const routeMetrics=new WeakMap();
let ws=null;

function mat(color,roughness=.8,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function box(w,h,d,color){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));}
function roadMat(color){return new THREE.MeshStandardMaterial({color,roughness:.9,metalness:0,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});}
