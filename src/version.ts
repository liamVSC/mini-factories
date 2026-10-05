declare global {
  var MINI_FACTORIES_VERSION:string;
  var MINI_FACTORIES_VERSION_DATE:string;
}

// Single source of truth for the currently published game version.
// v2.1.8: add real browser rendering/runtime road audit coverage.
globalThis.MINI_FACTORIES_VERSION='2.1.8';
globalThis.MINI_FACTORIES_VERSION_DATE='5 Oct 2026';

export {};
