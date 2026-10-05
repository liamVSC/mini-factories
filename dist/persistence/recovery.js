import { hydrate } from './load.js';
import { serialise } from './save.js';
export const SAVE_KEY = 'miniFactoriesSaveV6';
export const BACKUP_KEY = 'miniFactoriesSaveV6Backup';
export const RECOVERY_KEY = 'miniFactoriesSaveV6Recovery';
export const SAVE_SCHEMA = 1;
function storageValue(storage, key) {
    try {
        return storage?.getItem(key) || null;
    }
    catch {
        return null;
    }
}
function parseCandidate(raw) {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null)
            return null;
        const record = parsed;
        if (record.schema === SAVE_SCHEMA && record.state && typeof record.state === 'object') {
            return {
                savedAt: Number(record.savedAt) || 0,
                state: record.state
            };
        }
        return { savedAt: 0, state: record };
    }
    catch {
        return null;
    }
}
function hydrateCandidate(raw) {
    const candidate = parseCandidate(raw);
    if (!candidate)
        return null;
    const state = hydrate(candidate.state);
    return state ? { ...candidate, state } : null;
}
export function loadRecoveredState(storage = globalThis.localStorage) {
    const candidates = [
        hydrateCandidate(storageValue(storage, SAVE_KEY)),
        hydrateCandidate(storageValue(storage, BACKUP_KEY)),
        hydrateCandidate(storageValue(storage, RECOVERY_KEY))
    ]
        .filter((candidate) => candidate !== null)
        .sort((a, b) => b.savedAt - a.savedAt);
    return candidates[0]?.state || null;
}
export function saveRecoveredState(state, storage = globalThis.localStorage, now = Date.now()) {
    const payload = JSON.stringify({
        schema: SAVE_SCHEMA,
        savedAt: now,
        state: serialise(state)
    });
    try {
        const current = storage.getItem(SAVE_KEY);
        if (current)
            storage.setItem(BACKUP_KEY, current);
        storage.setItem(RECOVERY_KEY, payload);
        storage.setItem(SAVE_KEY, payload);
        storage.removeItem(RECOVERY_KEY);
        return true;
    }
    catch {
        try {
            storage.setItem(RECOVERY_KEY, payload);
            return true;
        }
        catch {
            return false;
        }
    }
}
export function promoteRecovery(storage = globalThis.localStorage) {
    const recovered = storageValue(storage, RECOVERY_KEY);
    if (!recovered)
        return false;
    try {
        const parsed = parseCandidate(recovered);
        if (!parsed || !hydrate(parsed.state))
            return false;
        const current = storage.getItem(SAVE_KEY);
        if (current)
            storage.setItem(BACKUP_KEY, current);
        storage.setItem(SAVE_KEY, recovered);
        storage.removeItem(RECOVERY_KEY);
        return true;
    }
    catch {
        return false;
    }
}
export function clearRecoveredState(storage = globalThis.localStorage) {
    for (const key of [SAVE_KEY, BACKUP_KEY, RECOVERY_KEY]) {
        try {
            storage.removeItem(key);
        }
        catch {
            // Preserve the legacy best-effort cleanup behaviour.
        }
    }
}
//# sourceMappingURL=recovery.js.map