declare global {
  var MINI_FACTORIES_VERSION:string;
  var MINI_FACTORIES_VERSION_DATE:string;
}

// Single source of truth for the currently published game version.
// v2.1.82: improve road topology, keep road points hidden, prevent rendered roads entering building footprints, and raise roadside paths for visible road depth.
globalThis.MINI_FACTORIES_VERSION='2.1.81';
globalThis.MINI_FACTORIES_VERSION_DATE='7 Oct 2026';

export {};
