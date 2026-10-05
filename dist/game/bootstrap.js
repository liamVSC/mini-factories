import { freshState } from '../state.js';
import { loadRecoveredState, saveRecoveredState, clearRecoveredState } from '../persistence/recovery.js';
import { seed } from '../world/buildings/index.js';
import { newContract } from '../economy.js';
import { createCommandHistory } from '../commands.js';
import { createCameraController } from './camera.js';
import { createGameLoop } from './loop.js';
import { bindLifecycle } from './lifecycle.js';
import { createUiController } from './ui.js';
import { createBuildController } from './build-ui.js';
import { createRoadController } from './road-ui.js';
import { bindInput } from './input.js';
const GAME_VERSION = globalThis.MINI_FACTORIES_VERSION;
const CHANGELOG = [
    { version: '2.0', date: '2 Oct 2026', items: [
            'Rebuilt factories, warehouses and shops as distinct industrial buildings with multi-height roofs, loading bays and facade details.',
            'Developed fenced sites with asphalt truck courts, concrete loading aprons, parking, utility areas and working yard gates.',
            'Unified the active and legacy renderer entry points so obsolete road-to-building apron geometry can no longer render.'
        ] },
    { version: '1.4', date: '2 Oct 2026', items: [
            'Road connections now terminate at the single building yard gate instead of the building shell.',
            'Truck routes now enter the yard, use a turning waypoint and finish at the primary loading dock before returning through the same gate.',
            'Visual yard gates are aligned with the canonical road entrance used by routing.'
        ] },
    { version: '1.3', date: '2 Oct 2026', items: [
            'Rebuilt the shop into a larger multi-volume retail/service model with a glazed frontage, canopy, service bay and roof plant.',
            'Expanded factory and warehouse depot yards with larger truck turning areas, marked access spines and wider security gates.',
            'Versioned the renderer and PWA cache so the new 3D assets are forced to load.'
        ] },
    { version: '1.2', date: '2 Oct 2026', items: [
            'Reworked factory, warehouse and shop silhouettes so the 3D upgrade is visibly architectural rather than only larger dimensions.',
            'Added stronger industrial roof, service-wing and logistics-building forms while preserving the existing yard and single-gate layout.',
            'Versioned the 3D renderer asset and PWA cache so deployed clients cannot silently keep the previous renderer.'
        ] },
    { version: '1.1', date: '2 Oct 2026', items: [
            'Expanded factory, warehouse and shop yards with larger depot and truck turning areas.',
            'Buildings now use one canonical truck entrance/exit for road snapping and logistics access.',
            'Road/building placement and routing were hardened around the enlarged site envelopes.',
            'Fixed the remaining building/road architecture regression coverage.'
        ] },
    { version: GAME_VERSION, date: globalThis.MINI_FACTORIES_VERSION_DATE, items: [
            'Starter layouts now deliberately distribute factories around the map.',
            'Starter shops are positioned relative to seeded factories instead of using any district system.',
            'Building seeding is restricted to new-game initialization; normal simulation no longer auto-spawns buildings.',
            'Starter building placement is validated against physical spacing, world bounds and river clearance.',
            'Starter layout regression coverage now checks deterministic, valid and district-free layouts.'
        ] },
    { version: '2', date: '1 Oct 2026', items: [
            'Factories now spawn across separate map sectors instead of clustering together.',
            'Starter factories have a dedicated minimum spacing target of 250 units.',
            'Factory placement now enforces an additional physical separation buffer.',
            'Traffic simulation was optimized by reusing junction control data per update.',
            'HUD updates are throttled during simulation to reduce unnecessary mobile work.',
            'Mobile WebGL rendering now uses a lighter configuration for smoother performance.',
            'Mobile Safari/PWA viewport, touch interaction and safe-area handling were hardened.',
            'Road routing now detects stale routes after road network changes and reroutes traffic safely.'
        ] },
    { version: '1', date: '30 Sep 2026', items: [
            'Initial Mini Factories release with factories, shops, warehouses, roads and traffic.',
            'Added mobile-first build controls, road editing and PWA support.'
        ] }
];
function createGame() {
    const canvas = document.querySelector('#game');
    if (!canvas)
        throw new Error('Game canvas #game is missing');
    let state = load();
    const commands = createCommandHistory();
    let lastHudSync = 0;
    let lastSaveAt = 0;
    let flashTimer;
    const ctx = {
        state,
        commands,
        viewport: { width: 0, height: 0 },
        canvas,
        buildFilter: 'all',
        buildMenuOpen: false,
        roadEditAction: null,
        drag: null,
        markWorldDirty() { ctx.state.renderVersion = (ctx.state.renderVersion || 0) + 1; },
        save(force = false) {
            if (ctx.state.gameOver && !force)
                return;
            const now = performance.now();
            if (!force && now - lastSaveAt < 1000)
                return;
            const ok = saveRecoveredState(ctx.state, localStorage, Date.now());
            lastSaveAt = now;
            if (!ok && force)
                ctx.flash('Recovery save unavailable — storage is full');
        },
        sync(force = true) {
            const now = performance.now();
            if (!force && now - lastHudSync < 100)
                return;
            lastHudSync = now;
            const state = ctx.state;
            const cash = document.querySelector('#cash');
            const orders = document.querySelector('#orders');
            const companyLevel = document.querySelector('#companyLevel');
            if (cash)
                cash.textContent = '£' + Math.floor(state.cash);
            if (orders)
                orders.textContent = String(state.orders);
            if (companyLevel)
                companyLevel.textContent = String(state.companyLevel);
            const version = document.querySelector('#gameVersion');
            if (version)
                version.textContent = 'v' + GAME_VERSION;
            const progress = document.querySelector('#levelProgress');
            if (progress)
                progress.style.width = Math.min(100, Math.max(0, (state.xp / Math.max(1, state.xpToNext)) * 100)) + '%';
            const traffic = document.querySelector('#traffic');
            if (traffic)
                traffic.textContent = Math.round(Math.max(0, Math.min(100, (state.congestion || 0) * 100))) + '%';
            const goal = state.goals[state.objective];
            const objective = document.querySelector('#objective');
            if (objective)
                objective.innerHTML = goal
                    ? '<b>Goal ' + (state.objective + 1) + '/6</b> • ' + goal.text + ' <span>' + Math.min(goal.target, Math.floor(goal.progress(state))) + '/' + goal.target + '</span>'
                    : 'All objectives complete';
            if (ui && ui.getPanelMode() === 'building' && state.selected) {
                ui.showPanel(state.selected);
            }
        },
        flash(message) {
            const element = document.querySelector('#tip');
            if (!element)
                return;
            element.textContent = message;
            if (flashTimer !== undefined)
                window.clearTimeout(flashTimer);
            flashTimer = window.setTimeout(() => { element.textContent = 'Build roads between factories and shops.'; }, 1200);
        },
        setMenuActive(_id) { },
        showPanel(_building) { },
        hidePanel() { },
        closeBuildMenu() { },
        closeRoadEditor() { },
        startRoadFromPoint(_point) { },
        setRoadEditAction(_action) { },
        setRoadEditorOpen(_open) { },
        toggleRoadMode() { },
        reset() { },
        resize() { },
        resetCamera() { },
        resumeGameLoop() { },
        suspendGameLoop() { },
        updatePlacementPreview(_point) { },
        clearPlacementPreview() { }
    };
    const camera = createCameraController(ctx);
    const ui = createUiController(ctx);
    const build = createBuildController(ctx);
    const road = createRoadController(ctx, camera);
    ctx.setMenuActive = ui.setMenuActive;
    ctx.showPanel = ui.showPanel;
    ctx.hidePanel = ui.hidePanel;
    ctx.closeBuildMenu = build.closeBuildMenu;
    ctx.closeRoadEditor = road.closeRoadEditor;
    ctx.startRoadFromPoint = road.startFromPoint;
    ctx.setRoadEditAction = road.setEditAction;
    ctx.setRoadEditorOpen = road.setEditorOpen;
    ctx.toggleRoadMode = road.toggleMode;
    ctx.reset = reset;
    ctx.updatePlacementPreview = build.updateBuildingPlacementPreview;
    ctx.clearPlacementPreview = build.clearBuildingPlacementPreview;
    const loop = createGameLoop(ctx);
    ctx.resize = camera.resize;
    ctx.resetCamera = camera.reset;
    ctx.resumeGameLoop = loop.resume;
    ctx.suspendGameLoop = loop.suspend;
    bindLifecycle(ctx, loop);
    ui.bind();
    build.bind();
    bindInput(ctx, camera, build, road);
    renderChangeLog();
    ctx.sync();
    try {
        localStorage.setItem('miniFactoriesRuntimeVersion', GAME_VERSION);
    }
    catch { }
    loop.resume();
    function reset() {
        build.closeBuildMenu();
        road.closeRoadEditor();
        commands.clear();
        clearRecoveredState(localStorage);
        state = startNewGame();
        ctx.state = state;
        ctx.state.paused = false;
        document.querySelector('#settingsMenu').style.display = 'none';
        document.querySelector('#gameOver').style.display = 'none';
        ui.hidePanel();
        ctx.sync();
        ctx.save(true);
        ctx.flash('New factory started');
    }
    return { ctx, camera, ui, build, road, loop };
}
function startNewGame() {
    const state = freshState();
    const newGameSeed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    state.gameSeed = newGameSeed || 1;
    state.layoutSeed = ((newGameSeed ^ Math.floor(Math.random() * 0x7fffffff) ^ 0x9e3779b9) >>> 0) || 1;
    if (!seed(state))
        throw new Error('New game seed initialization failed');
    state.renderVersion = 1;
    for (const building of state.buildings.filter(item => item.kind === 'shop'))
        newContract(state, building);
    return state;
}
function load() {
    const recovered = loadRecoveredState();
    if (recovered && (recovered.seeded === true || (recovered.buildings?.length || 0) > 0 || (recovered.roads?.length || 0) > 0))
        return recovered;
    return startNewGame();
}
function renderChangeLog() {
    const element = document.querySelector('#changeLog');
    if (!element)
        return;
    element.innerHTML = CHANGELOG.map(version => '<section class="changelog-version"><div class="changelog-head"><b>v' + version.version + '</b><span>' + version.date + '</span></div><ul>' + version.items.map(item => '<li>' + item + '</li>').join('') + '</ul></section>').join('');
}
function injectMobileTouchStyles() {
    const style = document.createElement('style');
    style.textContent = '@media(max-width:700px){.actions{grid-template-columns:repeat(5,minmax(0,1fr));padding-left:max(6px,env(safe-area-inset-left));padding-right:max(6px,env(safe-area-inset-right));padding-bottom:max(7px,env(safe-area-inset-bottom))}.actions button{touch-action:manipulation;user-select:none;-webkit-user-select:none}.build-menu{bottom:calc(58px + env(safe-area-inset-bottom));padding-bottom:calc(8px + env(safe-area-inset-bottom))}.build-card{touch-action:none}.road-editor{bottom:calc(62px + env(safe-area-inset-bottom))}}';
    document.head.appendChild(style);
}
export function bootstrapGame() { injectMobileTouchStyles(); return createGame(); }
//# sourceMappingURL=bootstrap.js.map