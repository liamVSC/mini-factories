declare global {
  var MINI_FACTORIES_VERSION:string;
  var MINI_FACTORIES_VERSION_DATE:string;
}

// Single source of truth for the currently published game version.
// v2.1.81: remove interactive road start/end point editing while preserving canonical yard-gate connections and mobile PWA behavior.
globalThis.MINI_FACTORIES_VERSION='2.1.80';
globalThis.MINI_FACTORIES_VERSION_DATE='7 Oct 2026';

export {};
