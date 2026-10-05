import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
import { RenderCamera } from './rendering/camera.js';
import { makeBuilding } from './rendering/buildings.js';
import { RenderScene } from './rendering/scene.js';
import { setBuildingPreview as drawBuildingPreview, setRoadPreview } from './rendering/preview.js';
import { buildRoadGroup, rounded } from './rendering/roads.js';
import { syncTrucks, updateTrucks } from './rendering/trucks.js';
const sceneRuntime = new RenderScene();
const cameraRuntime = new RenderCamera();
const buildingMeshes = new Map();
const truckMeshes = new Map();
let worldKey = '';
function buildingKey(state) {
    return JSON.stringify((state.buildings || []).map(b => [b.id, b.kind, b.type, b.x, b.y, b.color]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}
function roadKey(state) {
    return JSON.stringify((state.roads || []).map(r => [r.id, r.bridge, r.points]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}
function rebuildWorld(state) {
    sceneRuntime.clearRoot();
    buildingMeshes.clear();
    truckMeshes.clear();
    sceneRuntime.root.add(buildRoadGroup(state.roads, state));
    for (const building of state.buildings) {
        const model = makeBuilding(building), anchor = new THREE.Group();
        anchor.name = `building-anchor-${building.id}`;
        anchor.position.set(Number(building.x) || 0, 0, Number(building.y) || 0);
        anchor.add(model);
        sceneRuntime.root.add(anchor);
        buildingMeshes.set(building.id, model);
    }
    syncTrucks(sceneRuntime.root, truckMeshes, state.trucks);
    worldKey = buildingKey(state) + '|' + roadKey(state);
}
function updateSelection(state) {
    for (const [id, model] of buildingMeshes) {
        const selected = state.buildings.some((building) => building.id === id && state.selected === building);
        model.traverse((object) => {
            if (!object.isMesh || !object.material?.emissive)
                return;
            object.material.emissive.setHex(selected ? 0x294634 : 0);
            object.material.emissiveIntensity = selected ? .32 : 0;
        });
    }
}
function ensureCanvas(canvas) {
    return canvas || document.querySelector('#game');
}
export function render(state, width, height, canvas = document.querySelector('#game')) {
    const target = ensureCanvas(canvas);
    if (!target)
        return;
    if (!sceneRuntime.ready)
        sceneRuntime.init(target);
    if (sceneRuntime.recovering)
        return;
    sceneRuntime.resize(width, height);
    cameraRuntime.resize(width, height);
    const key = buildingKey(state) + '|' + roadKey(state);
    if (key !== worldKey)
        rebuildWorld(state);
    updateTrucks(sceneRuntime.root, truckMeshes, state.trucks);
    updateSelection(state);
    cameraRuntime.interpolate();
    sceneRuntime.render(cameraRuntime.threeCamera);
}
export function setPreview(path, _start, _end, blocked = false) { setRoadPreview(sceneRuntime.previewGroup, path, blocked); }
export function setBuildingPreview(type, point, blocked = false) { drawBuildingPreview(sceneRuntime.buildingPreviewGroup, type, point, blocked); }
export function resize(width, height) { sceneRuntime.resize(width, height); cameraRuntime.resize(width, height); }
export function controlCamera(dx, dy, distanceDelta = 0, yawDelta = 0, pitchDelta = 0) { cameraRuntime.control(dx, dy, distanceDelta, yawDelta, pitchDelta); }
export function screenToWorld(x, y, width = globalThis.innerWidth, height = globalThis.innerHeight) { return cameraRuntime.screenToWorld(x, y, width, height); }
export function worldToScreen(x, y, width = globalThis.innerWidth, height = globalThis.innerHeight) { return cameraRuntime.worldToScreen(x, y, width, height); }
export function panScreen(dx, dy, width = globalThis.innerWidth, height = globalThis.innerHeight) { cameraRuntime.panScreen(dx, dy, width, height); }
export function zoomAtScreen(x, y, zoom, width = globalThis.innerWidth, height = globalThis.innerHeight) { cameraRuntime.zoomAtScreen(x, y, zoom, width, height); }
export function resetCamera() { cameraRuntime.reset(); }
export function focusCamera(x, y) { cameraRuntime.focus(x, y); }
export function renderDiagnostics() {
    const roadObjects = [], buildingObjects = [];
    sceneRuntime.root.traverse((object) => {
        if (object.userData?.road) {
            const bounds = new THREE.Box3().setFromObject(object);
            let descendants = 0;
            object.traverse((child) => { if (child !== object)
                descendants++; });
            roadObjects.push({ id: object.userData.road.id, objectChildren: object.children.length, objectDescendants: descendants, visible: object.visible, bounds: { min: { x: bounds.min.x, z: bounds.min.z }, max: { x: bounds.max.x, z: bounds.max.z } }, logicalPoints: rounded(object.userData.road.points) });
        }
        if (typeof object.name === 'string' && object.name.startsWith('building-anchor-'))
            buildingObjects.push({ id: object.name.slice('building-anchor-'.length), position: { x: object.position.x, z: object.position.z }, children: object.children.length });
    });
    return { roadObjectCount: roadObjects.length, roadObjects, buildingObjectCount: buildingObjects.length, buildingObjects, rootObjectCount: sceneRuntime.root.children.length, rendererReady: sceneRuntime.ready, sceneReady: sceneRuntime.ready };
}
if (typeof window !== 'undefined')
    window.__miniFactoriesRenderDiagnostics = renderDiagnostics;
//# sourceMappingURL=render3d-clean.js.map