# Changelog

## v2.1.86 — 7 October 2026

### Road/building clearance and gate hardening
- Roads now keep a 14-unit safety margin beyond the existing physical building hitboxes, protecting the road surface, shoulder, and smoothed curves from visual clipping.
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
