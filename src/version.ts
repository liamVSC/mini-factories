declare global {
  var MINI_FACTORIES_VERSION:string;
  var MINI_FACTORIES_VERSION_DATE:string;
}

// Single source of truth for the currently published game version.
// v2.1.27: restore legacy gate proximity without accepting building footprints.
globalThis.MINI_FACTORIES_VERSION='2.1.27';
globalThis.MINI_FACTORIES_VERSION_DATE='6 Oct 2026';

export {};
