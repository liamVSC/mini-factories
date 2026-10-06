declare global {
  var MINI_FACTORIES_VERSION:string;
  var MINI_FACTORIES_VERSION_DATE:string;
}

// Single source of truth for the currently published game version.
// v2.1.78: audit and harden lifecycle binding, gate-only road endpoints, and generated-runtime verification and CI synchronization.
globalThis.MINI_FACTORIES_VERSION='2.1.78';
globalThis.MINI_FACTORIES_VERSION_DATE='6 Oct 2026';

export {};
