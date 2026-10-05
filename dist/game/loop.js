import { updateEconomy } from '../economy.js';
import { render } from '../render.js';
export function createGameLoop(ctx) {
    let last = performance.now();
    let animationFrame = 0;
    let running = false;
    function schedule() {
        if (!running || animationFrame)
            return;
        animationFrame = requestAnimationFrame(tick);
    }
    function tick(now) {
        animationFrame = 0;
        if (!running || document.visibilityState === 'hidden') {
            running = false;
            ctx.save(true);
            return;
        }
        const dt = Math.min(.05, Math.max(0, (now - last) / 1000));
        last = now;
        const state = ctx.state;
        if (!state.paused && !state.gameOver) {
            updateEconomy(state, dt, ctx.flash);
            state.congestion = Math.min(1, (state.trucks.length / 12) * .72 + (state.roads.length / 18) * .28);
            if (state.objective < state.goals.length && state.goals[state.objective].done(state)) {
                state.objective = Math.min(state.goals.length, state.objective + 1);
            }
            if (state.cash < 0)
                state.gameOver = true;
            ctx.save();
            ctx.sync(false);
        }
        render(state, ctx.viewport.width, ctx.viewport.height);
        if (!renderReadySignalled) {
            renderReadySignalled = true;
            window.dispatchEvent(new Event('mini-factories-ready'));
        }
        schedule();
    }
    let renderReadySignalled = false;
    function resume() {
        if (running)
            return;
        running = true;
        last = performance.now();
        ctx.resize();
        schedule();
    }
    function suspend() {
        running = false;
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = 0;
        }
        ctx.save(true);
    }
    return { schedule, resume, suspend };
}
//# sourceMappingURL=loop.js.map