const boundContexts = new WeakSet();
export function bindLifecycle(ctx, loop) {
    if (boundContexts.has(ctx))
        return;
    boundContexts.add(ctx);
    window.addEventListener('pagehide', loop.suspend, { capture: true });
    window.addEventListener('beforeunload', () => ctx.save(true), { capture: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden')
            loop.suspend();
        else
            loop.resume();
    }, { passive: true });
    document.addEventListener('freeze', loop.suspend, { passive: true });
    window.addEventListener('pageshow', loop.resume, { capture: true });
    window.addEventListener('online', () => {
        ctx.save(true);
        loop.resume();
        ctx.flash('Back online — game state recovered');
    }, { passive: true });
    window.addEventListener('offline', () => {
        ctx.save(true);
        ctx.flash('Offline mode — progress is saved locally');
    }, { passive: true });
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => { });
        });
    }
}
//# sourceMappingURL=lifecycle.js.map