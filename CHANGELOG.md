# Mini Factories Change Log

## v2.1 — 5 October 2026

### Mobile and PWA hardening
- Hardened touch interaction so map gestures stay isolated from scrollable mobile UI.
- Added idempotent pause/resume handling for iOS Safari/PWA background suspension and foreground recovery.
- Added safe saves on pagehide, visibility changes, freeze, offline transitions and before unload.
- Hardened viewport/orientation resizing and safe-area handling for portrait and landscape devices.
- Prevented duplicate animation loops after PWA resume and added WebGL context-loss recovery.
- Reduced mobile WebGL pixel ratio to lower GPU pressure while retaining full-resolution desktop rendering.
- Removed the per-frame road-array mutation used only to invalidate truck rendering, reducing unnecessary renderer work.
- Added mobile/PWA regression coverage and bumped the published game/PWA cache version.


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
