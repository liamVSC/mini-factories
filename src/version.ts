declare global {
  var MINI_FACTORIES_VERSION:string;
  var MINI_FACTORIES_VERSION_DATE:string;
}

// Single source of truth for the currently published game version.
// v2.1.11: disable road shadow reception across all road surface primitives.
globalThis.MINI_FACTORIES_VERSION='2.1.11';
globalThis.MINI_FACTORIES_VERSION_DATE='6 Oct 2026';

export {};
