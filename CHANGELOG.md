## v2.1.7 — 5 October 2026

### Road regression-test hardening
- Corrected the final stale assertion for the bounded road-corner miter implementation.
- Kept the renderer fix unchanged; this release only aligns regression coverage and published version metadata.

## v2.1.6 — 5 October 2026

### CI regression test correction
- Updated road offset regression assertions to match the corrected bounded-miter implementation.
- No gameplay behaviour changed beyond the already-published road stretch fix in v2.1.5.

# Mini Factories Change Log

## v2.1.5 — 5 October 2026

### Road mesh stretch fix
- Fixed the road offset/miter calculation applying the corner scale twice, which could stretch road surfaces and markings dramatically around bends and junctions.
- Kept miter limits bounded while applying the offset distance exactly once.
- Added regression coverage for the corrected offset geometry and release cache/version alignment.


## v2.1.4 — 5 October 2026

### Full road audit and connectivity hardening
- Fixed legacy/persisted roads that attach near a canonical building gate from producing a route discontinuity between the gate and actual pavement.
- Routing now inserts an explicit gate-to-pavement connector whenever a compatible legacy road does not physically reach the canonical gate.
- Added regression coverage for gate continuity while preserving the existing road/lane/topology architecture.
- Revalidated road mutation, stale-route, bridge, junction, lane and mobile/PWA regression coverage.


## v2.1.3 — 5 October 2026

### Road audit hardening
- Removed renderer-only road curve smoothing from the authoritative road mesh path.
- Road meshes and junction detection now consume the same rounded persisted polyline used by road state, preventing visual geometry from drifting away from routing/topology.
- Added regression coverage for renderer/topology geometry authority.

## v2.1.2 — 5 October 2026

### Road renderer stability
- Fixed a road-ribbon indexing regression where removing short geometry points could leave the mesh builder reading stale point indices.
- Added regression coverage to keep cleaned road geometry and generated ribbon vertices in lockstep.

## v2.1.1 — 5 October 2026

### CI and renderer hardening
- Corrected release-version regression expectations to use the central v2.1.1 runtime version.
- Hardened the 3D road renderer regression test so it validates bridge transition geometry without depending on fragile source formatting.
- Revalidated the mobile/PWA release bookkeeping and service-worker cache version.


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
