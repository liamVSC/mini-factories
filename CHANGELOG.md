# Changelog

## v2.1.83 — 7 October 2026

### Building yards and placement validation
- Added a canonical exterior yard/access area for every logistics building between its dock and road gate.
- Kept the building footprint separate from the road-access area; road routing was not changed.
- Strengthened building placement validation so building footprints and reserved yards cannot overlap existing building sites.
- Validated building yards against playable-world bounds and river clearance so placement cannot create invalid access areas.
- Added regression coverage for yard geometry, building overlap, world bounds, and terrain clearance.
- Published the synchronized runtime and service-worker cache.

### Verification
- Typecheck: passed
- Build: passed
- Full test suite: passed
- Browser audit: passed on desktop and mobile
- GitHub Pages deployment: passed
