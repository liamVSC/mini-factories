declare global {
  var MINI_FACTORIES_VERSION:string;
  var MINI_FACTORIES_VERSION_DATE:string;
}

// Single source of truth for the currently published game version.
// v2.1.28: support point-only routing endpoints while preserving live building gate routing.
globalThis.MINI_FACTORIES_VERSION='2.1.28';
globalThis.MINI_FACTORIES_VERSION_DATE='6 Oct 2026';

export {};
