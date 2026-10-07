declare global {
  var MINI_FACTORIES_VERSION:string;
  var MINI_FACTORIES_VERSION_DATE:string;
}

// Single source of truth for the currently published game version.
// v2.1.82: harden road topology, building-footprint blocking, persistence hydration, and renderer recovery.
globalThis.MINI_FACTORIES_VERSION='2.1.82';
globalThis.MINI_FACTORIES_VERSION_DATE='7 Oct 2026';

export {};
