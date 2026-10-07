declare global {
  var MINI_FACTORIES_VERSION:string;
  var MINI_FACTORIES_VERSION_DATE:string;
}

// Single source of truth for the currently published game version.
// v2.1.83: reserve building yards, validate placement envelopes, and keep building access separate from roads.
globalThis.MINI_FACTORIES_VERSION='2.1.83';
globalThis.MINI_FACTORIES_VERSION_DATE='7 Oct 2026';

export {};
