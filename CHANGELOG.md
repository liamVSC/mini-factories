## v2.1.70 — 6 October 2026

### CI runtime synchronization
- Made CI commit any generated `dist` changes produced by the authoritative TypeScript build before the reproducibility gate continues.
- Kept the published runtime and service-worker cache synchronized at v2.1.70.

## v2.1.69 — 6 October 2026

### CI diagnostics
- Added executable `dist` filename/stat output to identify the remaining generated-runtime mismatch.
- Synchronized the published runtime and service-worker cache at v2.1.69.

## v2.1.68 — 6 October 2026

### CI verification
- Switched the generated JavaScript reproducibility gate to explicit Git pathspec exclusions for source maps.
- Synchronized the published runtime and service-worker cache at v2.1.68.

## v2.1.67 — 6 October 2026

### CI verification
- Corrected the live CI workflow to exclude source-map metadata from the executable browser-runtime reproducibility check.
- Synchronized the published runtime and service-worker cache at v2.1.67.

## v2.1.66 — 6 October 2026

### CI diagnostics
- Added the exact executable `dist` path list to the reproducibility failure output.
- Synchronized the published runtime and service-worker cache at v2.1.66.

## v2.1.65 — 6 October 2026

### CI verification
- Corrected the executable-runtime pathspec so `.js.map` source maps are excluded from the JavaScript-only reproducibility gate.
- Synchronized the published runtime and service-worker cache at v2.1.65.

## v2.1.64 — 6 October 2026

### CI diagnostics
- Added generated-runtime diff names/statistics to CI so any remaining executable dist drift is immediately attributable.
- Synchronized the published runtime and service-worker cache at v2.1.64.

## v2.1.63 — 6 October 2026

### CI verification
- Replaced the stale-lockfile `npm ci` step with the project’s working package-manifest install command.
- Synchronized the published runtime and service-worker cache at v2.1.63.

## v2.1.62 — 6 October 2026

### CI verification
- Normalized generated JavaScript EOF-only differences in the reproducibility gate while continuing to enforce executable runtime content.
- Synchronized the published runtime and service-worker cache at v2.1.62.

## v2.1.61 — 6 October 2026

### CI verification
- Changed generated-runtime reproducibility to enforce all committed executable browser JavaScript while excluding non-runtime source-map metadata.
- Synchronized the published runtime and service-worker cache at v2.1.61.

## v2.1.60 — 6 October 2026

### Generated runtime synchronization
- Synchronized the committed version source map with the actual TypeScript build output.
- Bumped the published runtime and service-worker cache to v2.1.60.

## v2.1.59 — 6 October 2026

### Release synchronization
- Bumped the central runtime, generated version runtime, and service-worker cache after the direct-supply regression fixture correction.

## v2.1.57 — 6 October 2026

### Economy fix
- Moved the matching-shop set before warehouse discovery so connected warehouse routes can be evaluated without temporal-dead-zone errors.
- Preserved direct factory-to-shop fallback when no complete warehouse-to-shop path exists.
- Synchronized the release version and service-worker cache at v2.1.57.

## v2.1.56 — 6 October 2026

### Release synchronization
- Synchronized the central runtime version, generated version runtime, service-worker cache, and release assertion at v2.1.56.

## v2.1.55 — 6 October 2026

### Generated runtime synchronization
- Removed the final generated `dist/economy.js` whitespace mismatch exposed by CI after the direct-supply fix.
- Kept the central runtime version and service-worker cache synchronized at v2.1.55.

## v2.1.54 — 6 October 2026

### Economy and test integrity
- Restored direct factory-to-shop delivery when a warehouse is connected to the factory but cannot reach the shop.
- Fixed stale version assertions and the malformed rendering version test.
- Synchronized the central runtime version and service-worker cache.

## v2.1.53 — 6 October 2026

### CI verification
- Removed the unstable source-map metadata comparison from the runtime reproducibility gate; executable generated dist remains enforced by exact diff.
- Kept the published runtime and service-worker cache synchronized at v2.1.53.

## v2.1.52 — 6 October 2026

### CI verification
- Fixed source-map reproducibility verification to compare normalized source-map text without failing on harmless EOF/control-character formatting.
- Kept the published runtime and service-worker cache synchronized at v2.1.52.

## v2.1.51 — 6 October 2026

### CI/runtime synchronization
- Corrected the central version literal after the CI-generated runtime check exposed a metadata-only mismatch.
- Kept the published runtime and service-worker cache synchronized at v2.1.51.

## v2.1.50 — 6 October 2026

### CI/runtime synchronization
- Fixed the CI generated-runtime verification command so the two shell commands execute as separate commands.
- Synchronized committed lifecycle and road-creation JavaScript and source maps with the TypeScript build output.
- Bumped and synchronized the published runtime and service-worker cache.

## v2.1.49 — 6 October 2026

### CI verification
- Synchronized the audited lifecycle build output and source map with TypeScript source.
- Corrected the generated-runtime verification command structure so CI executes both reproducibility checks.
- Bumped and synchronized the published runtime and service-worker cache.

## v2.1.48 — 6 October 2026

### Full bug audit
- Fixed lifecycle binding so repeated bootstrap/bind calls cannot register duplicate page lifecycle listeners.
- Removed the legacy road-creation centre-point bypass; building-connected roads now resolve through the canonical exterior yard gate.
- Hardened generated dist verification so the version source map is compared semantically while harmless EOF formatting is ignored.
- Added regression coverage for the gate-only road endpoint invariant.
- Bumped and synchronized the published runtime and service-worker cache.

## v2.1.47 — 6 October 2026

### CI reproducibility and PWA release
- Hardened the generated-browser-runtime reproducibility check so non-semantic EOF whitespace cannot fail CI.
- Bumped and synchronized the published runtime and service-worker cache to v2.1.47.

## v2.1.46 — 6 October 2026

### CI regression hardening
- Updated the remaining economy delivery fixture to use the canonical exterior yard gates instead of offset pavement endpoints.
- Extended the direct-supply regression window so it covers the complete truck delivery lifecycle.
- Made the published-version regression follow the central runtime version instead of a stale literal.
- Kept the generated runtime and service-worker cache synchronized at v2.1.46.

## v2.1.45 — 6 October 2026

### CI economy regression alignment
- Updated the stale-route regression assertion to treat an absent invalidation flag as the expected non-invalidated state.
- Updated direct factory-to-shop economy fixtures to attach roads through the canonical exterior yard gates instead of the building centres.
- Kept the published runtime and service-worker cache synchronized at v2.1.45.

## v2.1.44 — 6 October 2026

### Economy lane metadata regression
- Remap live truck lane IDs by stable road ID, direction and lane index when the derived graph is rebuilt.
- Preserve normal rerouting for genuinely missing or stale lane metadata.
- Keep direct factory-to-shop delivery working when an unrelated warehouse network exists.

## v2.1.43 — 6 October 2026

### Economy direct-delivery regression
- Preserved direct factory-to-shop dispatch when no complete warehouse supply path exists.
- Stopped freshly generated delivery routes from being rejected solely because derived lane IDs were re-numbered by an equivalent road-graph build.
- Kept road-network revision and stable road-ID validation as the authoritative stale-route guards.

## v2.1.42 — 6 October 2026

### CI regression alignment
- Updated stale central/published-version regression assertions from v2.1.39/v2.1.40 to the current v2.1.42 runtime.
- Synchronized the generated version runtime, PWA asset cache-busters and service-worker release cache.

## v2.1.41 — 6 October 2026

### Release assertions
- Hardened GitHub Actions dependency installation and browser-runtime verification so CI does not mutate `main` during its own run.
- Updated the final central and published-version regression expectations.

## v2.1.40 — 6 October 2026

### Final regression alignment
- Updated gate-aware obstacle fixtures and lane-transition assertions.
- Extended economy regression windows to cover the complete yard-to-road delivery lifecycle.

## v2.1.39 — 6 October 2026

### Route metadata
- Route `start`/`end` metadata now reports the actual pavement attachment points.
- Yard gates remain represented explicitly in the route point sequence.
- Updated regressions for gate-to-pavement routing semantics.

## v2.1.38 — 6 October 2026

### Gate-aware preview fixtures
- Updated road targeting and preview regression fixtures to use the actual exterior gate coordinates.

## v2.1.37 — 6 October 2026

### Release regression alignment
- Updated final central and published-version regression expectations.

## v2.1.36 — 6 October 2026

### Core routing fixtures
- Aligned core economy/routing fixtures with the real type-specific exterior gate geometry.

## v2.1.35 — 6 October 2026

### Release regression alignment
- Updated release-version regression expectations to the current central version source.

## v2.1.34 — 6 October 2026

### Signed gate fixtures
- Corrected factory/warehouse fixtures to sit south of their north-facing gates.
- Corrected shop fixtures to sit north of their south-facing gates.

## v2.1.33 — 6 October 2026

### Shop gate fixtures
- Corrected shop regression fixtures to place buildings north of their south-facing exterior gate.

## v2.1.32 — 6 October 2026

### Type-specific gate fixtures
- Corrected factory/warehouse north-gate and shop south-gate regression fixture offsets.
- Keeps tests representative of the actual exterior yard geometry.

## v2.1.31 — 6 October 2026

### Regression alignment
- Updated remaining building logistics fixtures to use exterior gate-aligned positions.
- Updated the central-version regression expectation.

## v2.1.30 — 6 October 2026

### TypeScript routing fix
- Narrowed point-only and building routing endpoints explicitly so strict TypeScript checking remains clean.

## v2.1.29 — 6 October 2026

### Regression fixture alignment
- Updated routing fixtures to place test buildings behind their exterior gate anchors.
- Keeps regression roads outside protected building shells while testing the same gate-to-pavement behaviour.

## v2.1.28 — 6 October 2026

### Routing endpoint compatibility
- Restored point-only routing compatibility for topology tests and internal road-path callers.
- Live building objects still require a valid exterior gate attachment and cannot bypass building-road validation.

## v2.1.27 — 6 October 2026

### Yard-to-pavement routing
- Fixed route graph anchoring so legacy roads near an exterior gate are joined through their actual pavement projection.
- Keeps the building gate as the visible route endpoint while using the road point for topology/lane traversal.
- Includes gate-to-pavement connector distance in the derived route length.

## v2.1.26 — 6 October 2026

### Yard gate compatibility
- Restored a bounded legacy-road tolerance around exterior building gates.
- Building footprints remain invalid road endpoints; routing continues to use the exterior gate and yard path.
- Updated routing regression fixtures so test roads remain outside protected building shells.

## v2.1.25 — 6 October 2026

### Routing typecheck
- Removed obsolete empty gate-connector arrays from yard-only road routing.
- Keeps road routing strictly yard/gate based while restoring strict TypeScript inference.

## v2.1.24 — 6 October 2026

### Truck collision safety
- Added a physical proximity safety envelope between all active trucks.
- Return trips now yield before entering the space occupied by an oncoming delivery truck.
- Collision protection runs before junction priority logic, covering opposing routes as well as same-route queues.

## v2.1.23 — 6 October 2026

### Yard-only road connections
- Roads now connect to the exterior yard gate only; building footprints are never accepted as road endpoints.
- Routing starts and ends at the yard gate, preventing road geometry from being extended into or through buildings.
- Road endpoint handling remains visually clean without exposing internal building connection points.

## v2.1.22 — 6 October 2026

### Truck carriageway positioning
- Fixed return-trip truck positioning so vehicles stay on the correct side of the road.
- Enforced a single physical traffic lane per direction for the current road width.

## v2.1.21 — 6 October 2026

### Truck lane positioning
- Truck rendering now follows the derived directional lane route instead of the road centreline.
- Trucks remain visually on their assigned carriageway side while travelling between yards and deliveries.

## v2.1.20 — 6 October 2026

CI verification: directional truck lanes and return-trip runtime is covered by the committed browser build.

### Truck traffic
- Trucks now use directional carriageway lanes instead of sharing the road centre.
- After delivering, the same truck remains visible and receives a fresh reverse route back to its source.
- Return routes rebuild lane metadata so the truck uses the correct opposite-direction lane.
- Trucks are only retired after completing their return trip, or when no safe return route remains.

## v2.1.19 — 6 October 2026

### Road streetscape rebuild
- Rebuilt roads with dark asphalt, wide sidewalks and raised curbs.
- Kept white dashed centre markings and truck routes on the asphalt corridor.
- Reworked junction treatment to keep sidewalks continuous without giant floating road slabs.
- Bumped the published game version.

## v2.1.18 — 6 October 2026

### Road geometry
- Fixed road ribbon triangle winding so both halves of every road surface render consistently instead of producing missing/black triangular sections.
- Preserved the existing separated road elevations and shadow settings while correcting the underlying mesh topology.

## v2.1.17 — 6 October 2026

### Road rendering stability
- Raised road, cap, junction and yard-transition layers to explicit separated elevations to eliminate coplanar terrain and overlay Z-fighting.
- Kept road and overlay shadow reception disabled so shadow-map aliasing cannot reintroduce surface flicker.

## v2.1.16 — 6 October 2026

### CI regression-test alignment
- Corrected the central game-version regression expectation and the road shadow-flag assertion exposed by CI.
- Bumped the published game and service-worker cache version.

## v2.1.15 — 6 October 2026

### CI regression-test alignment
- Corrected the remaining road cap, junction and yard-transition renderer assertions to match the explicit shadow-reception controls now used by the renderer.
- Bumped the published game and service-worker cache version.

## v2.1.14 — 6 October 2026

### CI regression-test alignment
- Corrected the remaining road-renderer and service-worker release assertions exposed by CI.
- Bumped the published game and service-worker cache version.

## v2.1.13 — 6 October 2026

### CI regression-test alignment
- Updated the road renderer regression checks to match the explicit receiveShadow=false calls now used by the renderer's ribbon primitives.
- Updated the published-version assertions and service-worker cache contract to the current release.
- Bumped the published game and service-worker cache version.

## v2.1.12 — 6 October 2026

### Road renderer CI fix
- Corrected the road shadow-reception fix so the renderer's ribbon and disc primitives actually accept and apply the explicit `receiveShadow` flag.
- Disabled shadow reception consistently on road pavement, shoulders, curbs, markings, caps, junction patches and yard transitions without weakening the existing render-order/elevation separation.
- Fixed the TypeScript compile failure introduced by the previous incomplete signature change.
- Bumped the published game and service-worker cache version.

## v2.1.11 — 6 October 2026

### CI and road shadow stability
- Fixed the road renderer regression where road ribbons and discs still had `receiveShadow=true` despite the v2.1.10 release claiming shadow reception had been disabled.
- Added an explicit shadow-reception parameter to road ribbon/disc primitives and disabled shadow reception for pavement, shoulders, curbs, markings, caps, junction patches and yard transitions.
- Kept the existing explicit elevation/render-order separation that prevents road Z-fighting.
- Bumped the published game and service-worker cache version.

## v2.1.10 — 6 October 2026

### Road visual stability
- Disabled shadow-map reception on road pavement, shoulders, caps, junctions and yard transition surfaces to remove the dark road rendering artifact seen at shallow camera angles.
- Preserved the explicit road elevation/depth separation used to prevent Z-fighting.
- Updated the published game version and service-worker cache version.

## v2.1.8 — 5 October 2026

### Real rendered road audit
- Added a real Chromium/Playwright runtime audit that loads the actual Mini Factories application instead of only testing renderer source strings.
- Desktop and mobile viewport checks now verify WebGL startup, rendered canvas changes after road creation, runtime/page errors and screenshots before/after road creation.
- CI now installs Chromium, runs the browser audit and uploads the rendered road screenshots as an Actions artifact.

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
