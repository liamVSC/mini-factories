import { AddRoadCommand, DeleteRoadCommand, executeCommand } from '../commands.js';
import { roadBuildingTarget, roadTarget, roadPreview, roadSegmentAtPoint, dist } from '../world/roads/index.js';
import { setPreview } from '../render.js';
export function createRoadController(ctx, camera) {
    function roadPreviewTip(preview) {
        if (!preview)
            return 'Invalid road';
        if (preview.blocked)
            return 'Road blocked — move around the building';
        const start = preview.start?.building?.type || preview.start?.building?.kind;
        const end = preview.end?.building?.type || preview.end?.building?.kind;
        if (start && end)
            return 'Connect ' + start + ' to ' + end;
        if (start)
            return 'Road from ' + start;
        if (end)
            return 'Road to ' + end;
        return 'Drag to build road';
    }
    function roadResultMessage(result, path) {
        if (result === true)
            return 'Road built';
        if (result === 'cash') {
            const lengthEstimate = path.length > 1 ? path.reduce((total, point, index) => index ? total + dist(path[index - 1], point) : 0, 0) : 0;
            const cost = Math.max(1, Math.ceil(lengthEstimate / 180)) * 2;
            return 'Need £' + cost + ' cash (you have £' + Math.floor(ctx.state.cash) + ')';
        }
        if (result === 'too-short')
            return 'Select two different points or buildings';
        if (result === 'blocked')
            return 'Road blocked — move around the building';
        if (result === 'duplicate')
            return 'Road already exists here';
        return 'Invalid road';
    }
    function roadPathSafe(a, b) {
        try {
            return roadPreview(ctx.state, a, b)?.path || [a, b];
        }
        catch {
            return [a, b];
        }
    }
    function toggleMode() {
        ctx.state.mode = ctx.state.mode === 'road' ? 'select' : 'road';
        ctx.setMenuActive(ctx.state.mode === 'road' ? 'road' : null);
        ctx.drag = null;
        ctx.state.roadEditSelection = undefined;
        ctx.state.roadEditHover = undefined;
        $('#road')?.classList.toggle('active', ctx.state.mode === 'road');
        $('#erase')?.classList.toggle('active', false);
        $('#tip').textContent = ctx.state.mode === 'road' ? 'Drag on the map to build a road.' : 'Build roads between factories and shops.';
    }
    function startFromPoint(point) {
        ctx.state.mode = 'road';
        ctx.state.buildMode = null;
        ctx.drag = { start: point, current: point };
        ctx.setMenuActive('road');
        $('#road')?.classList.add('active');
        $('#erase')?.classList.remove('active');
    }
    function setEditorOpen(open) {
        if (open)
            openRoadEditor();
        else
            closeRoadEditor();
    }
    function openRoadEditor() {
        if (ctx.buildMenuOpen)
            ctx.closeBuildMenu();
        ctx.drag = null;
        ctx.state.mode = 'select';
        ctx.state.roadEditSelection = undefined;
        ctx.roadEditAction = null;
        const element = $('#roadEditor');
        element.classList.add('open');
        element.setAttribute('aria-hidden', 'false');
        ctx.setMenuActive(null);
    }
    function closeRoadEditor() {
        const element = $('#roadEditor');
        element.classList.remove('open');
        element.setAttribute('aria-hidden', 'true');
        ctx.roadEditAction = null;
        ctx.state.mode = 'select';
        ctx.state.roadEditSelection = undefined;
        ctx.drag = null;
        ctx.setMenuActive(null);
        $('#erase')?.classList.remove('active');
        $('#tip').textContent = 'Build roads between factories and shops.';
    }
    function setEditAction(action) {
        ctx.roadEditAction = action;
        const element = $('#roadEditor');
        element.classList.remove('open');
        element.setAttribute('aria-hidden', 'true');
        ctx.state.mode = 'erase';
        ctx.drag = null;
        ctx.state.roadEditSelection = undefined;
        ctx.setMenuActive('erase');
        $('#erase')?.classList.add('active');
        $('#tip').textContent = 'Tap any part of a road to delete it';
    }
    function pointerDown(event) {
        const point = camera.worldPosition(event);
        if (!point)
            return;
        if (ctx.state.mode === 'road') {
            const target = roadBuildingTarget(ctx.state, point) || roadTarget(ctx.state, point) || point;
            if (!ctx.drag)
                ctx.drag = { start: target, current: target };
            return;
        }
        if (ctx.state.mode !== 'erase')
            return;
        const hit = roadSegmentAtPoint(ctx.state, point, camera.worldHitTolerance(26));
        if (hit && ctx.roadEditAction === 'remove') {
            const result = executeCommand(ctx.commands, ctx.state, new DeleteRoadCommand(point));
            ctx.state.roadEditSelection = undefined;
            if (result.ok) {
                ctx.markWorldDirty();
                ctx.save(true);
                ctx.sync();
                ctx.flash('Road deleted');
            }
            else
                ctx.flash('Could not delete road');
        }
    }
    function pointerMove(event) {
        const point = camera.worldPosition(event);
        if (!point)
            return;
        if (ctx.state.mode === 'road' && ctx.drag) {
            ctx.drag.current = roadBuildingTarget(ctx.state, point) || roadTarget(ctx.state, point) || point;
            let preview = null;
            try {
                preview = roadPreview(ctx.state, ctx.drag.start, ctx.drag.current);
            }
            catch {
                preview = { path: [ctx.drag.start, ctx.drag.current], start: ctx.drag.start, end: ctx.drag.current, blocked: true, blockedReason: 'preview-error' };
            }
            setPreview(preview?.path ?? null, preview?.start ?? null, preview?.end ?? null, preview?.blocked ?? false);
            $('#tip').textContent = roadPreviewTip(preview);
            return;
        }
        if (ctx.state.mode === 'erase') {
            ctx.state.roadEditHover = roadSegmentAtPoint(ctx.state, point, camera.worldHitTolerance(22));
            setPreview(null, null, null, false);
        }
    }
    function pointerUp(event) {
        if (ctx.state.mode === 'road' && ctx.drag) {
            const drag = ctx.drag;
            ctx.drag = null;
            const point = camera.worldPosition(event) || drag.current;
            const target = roadBuildingTarget(ctx.state, point) || roadTarget(ctx.state, point) || point;
            let preview = null;
            try {
                preview = roadPreview(ctx.state, drag.start, target);
            }
            catch {
                preview = null;
            }
            const path = preview?.path || roadPathSafe(drag.start, target);
            const meta = { startBuilding: preview?.start?.building || undefined, endBuilding: preview?.end?.building || undefined };
            let result;
            try {
                const command = executeCommand(ctx.commands, ctx.state, new AddRoadCommand(path, meta));
                result = { ok: command.ok, result: command.result };
            }
            catch {
                result = { ok: false };
            }
            setPreview(null, null, null, false);
            $('#tip').textContent = roadResultMessage(result.ok ? result.result : false, path);
            if (result.result === true) {
                ctx.markWorldDirty();
                ctx.save(true);
                ctx.sync();
            }
            return;
        }
        ctx.drag = null;
            const point = camera.worldPosition(event);
            if (!point)
                return;
        ctx.drag = null;
    }
    return { toggleMode, startFromPoint, setEditorOpen, closeRoadEditor, setEditAction, pointerDown, pointerMove, pointerUp, openRoadEditor };
}
function $(selector) { return document.querySelector(selector); }
//# sourceMappingURL=road-ui.js.map