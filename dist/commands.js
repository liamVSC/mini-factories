import { addRoad, eraseRoad, roadSegmentAtPoint } from './world/roads/index.js';
import { placeBuilding } from './world/buildings/index.js';
function clone(value) {
    if (typeof structuredClone === 'function')
        return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}
function snapshot(state, keys) {
    const out = {};
    for (const key of keys)
        out[key] = clone(state[key]);
    return out;
}
function restore(state, data) {
    const target = state;
    for (const [key, value] of Object.entries(data))
        target[key] = clone(value);
}
export class CommandHistory {
    limit;
    undoStack = [];
    redoStack = [];
    constructor(limit = 100) { this.limit = limit; }
    execute(state, command) {
        const result = command.execute(state);
        if (!result.ok)
            return result;
        this.undoStack.push({ command, snapshot: result.snapshot });
        if (this.undoStack.length > this.limit)
            this.undoStack.shift();
        this.redoStack.length = 0;
        return result;
    }
    undo(state) {
        const entry = this.undoStack.pop();
        if (!entry)
            return false;
        restore(state, entry.snapshot);
        this.redoStack.push(entry);
        return true;
    }
    clear() { this.undoStack.length = 0; this.redoStack.length = 0; }
}
class MutationCommand {
    label;
    keys;
    constructor(label, keys) { this.label = label; this.keys = keys; }
    execute(state) {
        const validation = this.validate(state);
        if (!validation.ok)
            return validation;
        const before = snapshot(state, this.keys), result = this.apply(state);
        if (result === false || result == null)
            return { ok: false, reason: 'mutation-failed', result };
        return { ok: true, result, snapshot: before, label: this.label };
    }
    validate(_state) { return { ok: true }; }
    apply(_state) { return false; }
}
export class AddRoadCommand extends MutationCommand {
    points;
    meta;
    constructor(points, meta = {}) { super('add-road', ['roads', 'cash', 'trucks', 'roadNetworkRevision', 'trafficReservations']); this.points = points; this.meta = meta; }
    validate(_state) { return !Array.isArray(this.points) || this.points.length < 2 ? { ok: false, reason: 'invalid' } : { ok: true }; }
    apply(state) { const result = addRoad(state, this.points, this.meta); return result === true ? result : false; }
}
export class DeleteRoadCommand extends MutationCommand {
    point;
    constructor(point) { super('delete-road', ['roads', 'trucks', 'roadNetworkRevision', 'trafficReservations']); this.point = point; }
    validate(state) { return roadSegmentAtPoint(state, this.point) ? { ok: true } : { ok: false, reason: 'no-road' }; }
    apply(state) { return eraseRoad(state, this.point); }
}
export class PlaceBuildingCommand extends MutationCommand {
    type;
    x;
    y;
    constructor(type, x, y) { super('place-building', ['buildings', 'cash']); this.type = type; this.x = x; this.y = y; }
    validate(_state) { return !this.type || !Number.isFinite(this.x) || !Number.isFinite(this.y) ? { ok: false, reason: 'invalid-placement' } : { ok: true }; }
    apply(state) { return placeBuilding(state, this.type, this.x, this.y) || false; }
}
export function executeCommand(history, state, command) { return history.execute(state, command); }
export function createCommandHistory(limit = 100) { return new CommandHistory(limit); }
//# sourceMappingURL=commands.js.map