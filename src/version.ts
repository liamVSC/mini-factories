declare global {
  var MINI_FACTORIES_VERSION:string;
  var MINI_FACTORIES_VERSION_DATE:string;
}

// Single source of truth for the currently published game version.
// v2.1.46: harden CI economy fixtures and make published-version assertions follow the central runtime source.
globalThis.MINI_FACTORIES_VERSION='2.1.46';
globalThis.MINI_FACTORIES_VERSION_DATE='6 Oct 2026';

export {};
