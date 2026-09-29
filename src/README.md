# Mini Factories code structure

The game is being split out of the original single-file prototype into focused modules.

Planned boundaries:

- `game/state.js` — runtime state and reset/default values
- `game/config.js` — factory/shop definitions and balance constants
- `game/economy.js` — contracts, rewards, reputation and progression
- `game/world.js` — building placement, districts and world bounds
- `game/roads.js` — road graph, snapping and erase operations
- `game/traffic.js` — trucks, routing and congestion
- `game/save.js` — localStorage serialization/migrations
- `game/ui.js` — DOM panels, pause menu and HUD
- `game/render.js` — canvas rendering/camera
- `game/input.js` — pointer/touch/drag gestures
- `game/main.js` — bootstrapping and game loop

`styles.css` is already separated from the HTML. The legacy game remains intact while the JavaScript is split incrementally so a refactor cannot silently destroy the playable build.
