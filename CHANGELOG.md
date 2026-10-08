# Changelog

## v2.1 — 8 Oct 2026
- Lowered the river water surface visually below the grass while keeping bridge decks elevated.
- Added deterministic low-poly forest/tree clusters as a future lumber resource visual.
- Kept forest trees clear of existing roads, river crossings, and building areas.
- Refreshed the PWA renderer cache version so the map changes are picked up by installed clients.

# Mini Factories Change Log

## v3 — 2 October 2026

### Starter layout and building seeding
- Factories are deliberately distributed around separate map sectors during new-game initialization.
- Starter shops are positioned relative to the seeded factories rather than through any artificial district system.
- Building creation is now explicit: starter buildings are seeded only when a new game is initialized, while normal gameplay does not automatically spawn buildings.
- Starter placement is checked against physical building spacing, factory separation, world bounds and river clearance.
- Added regression coverage for deterministic, valid and district-free starter layouts.

### Versioning
- Game version is now defined in one central runtime source and consumed by the game UI and update checks.

### Platform and PWA
- Updated the visible game version to **v3**.
- Updated the service-worker cache/version and game asset cache-busting so the PWA can pick up the new build.
- Updated the website-facing changelog shown inside the game.

## v2 — 1 October 2026

- Factories spawn across separate map sectors instead of clustering together.
- Starter factories use a dedicated minimum spacing target.
- Factory placement enforces an additional physical separation buffer.
- Traffic simulation and HUD updates were optimized for mobile.
- Mobile WebGL rendering, Safari/PWA viewport handling and safe-area behavior were hardened.
- Road routing detects stale routes after road-network changes and reroutes traffic safely.

## v1 — 30 September 2026

- Initial Mini Factories release with factories, shops, warehouses, roads and traffic.
- Added mobile-first build controls, road editing and PWA support.
