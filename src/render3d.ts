// Transitional TypeScript migration: preserve runtime behavior while this module's domain types are tightened.
// @ts-nocheck
export {
  render,
  setPreview,
  setBuildingPreview,
  resize,
  controlCamera,
  screenToWorld,
  worldToScreen,
  panScreen,
  zoomAtScreen,
  resetCamera,
  focusCamera
} from './render3d-clean.js?v=7';
