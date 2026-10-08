# Changelog

## v1 — 8 October 2026

### Published release
- Promoted the current Mini Factories build to the v1 release.
- Includes the current factory, yard, road, routing, camera, PWA and persistence improvements.
- Cache version and runtime version are aligned to v1.

### Verification
- Typecheck: required to pass
- Build: required to pass
- Full test suite: required to pass
- Browser audit: required to pass
- GitHub Pages deployment: required to pass

## v2.1.87 — 7 October 2026

### Camera controls
- Zoom now stays anchored to the cursor/finger position instead of jumping toward a fixed distance.
- Desktop camera controls remain compatible with selection and building/road modes: left-drag pans, right/middle-drag orbits, and Shift+left-drag orbits.
- Two-finger gestures now support pinch zoom, pan, and twist-to-orbit on touch devices.
- Camera yaw interpolation now takes the shortest rotation path, avoiding long spins when crossing the angle boundary.
- Added regression coverage for the camera control semantics.

### Verification
- Typecheck: pending
- Build: pending
- Full test suite: pending
- Browser audit: pending
- GitHub Pages deployment: pending

## v2.1.86 — 7 October 2026

### Road/building clearance and gate hardening
- Roads now keep a 6-unit safety margin beyond the existing physical building hitboxes, protecting the road surface, shoulder, and smoothed curves from visual clipping.
- Building road snapping now resolves only through the reserved exterior yard or canonical gate instead of arbitrary points along the building shell.
- Road endpoint connections continue to canonicalize to the single primary vehicle gate.
- Removed the circular gate disc so the yard connector terminates naturally at the gate instead of looking like an endpoint marker.
- Added regressions for yard/gate-only snapping and the hard clearance margin.

### Verification
- Typecheck: pending
- Build: pending
- Full test suite: pending
- Browser audit: pending
- GitHub Pages deployment: pending


## v2.1.84 — 7 October 2026

### PWA update loop fix
- Fixed the "Update available" prompt appearing repeatedly after service-worker activation.
- New service workers now notify the page through the standard waiting-worker flow instead of forcing an update prompt during installation.
- Refresh now activates the waiting service worker with SKIP_WAITING and reloads only after the new controller takes over.
- Removed the unregister-and-cache-delete update path that could recreate the update state indefinitely.

### Verification
- Typecheck: pending
- Build: pending
- Full test suite: pending
- Browser audit: pending
- GitHub Pages deployment: pending
