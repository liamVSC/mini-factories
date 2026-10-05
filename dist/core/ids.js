export function newId(prefix = 'id') {
    return globalThis.crypto?.randomUUID?.()
        || prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}
//# sourceMappingURL=ids.js.map