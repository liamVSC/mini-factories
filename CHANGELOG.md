# Changelog

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
