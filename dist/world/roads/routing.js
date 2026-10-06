import { dist, length, finitePoint, projectSegment } from './geometry.js';
import { buildingRoadAttachment } from '../buildings/connections.js';
import { buildingPrimaryDock, buildingRoadEntrance } from '../buildings/geometry.js';
import { snap } from './placement.js';
import { roadNetwork, nearestGraphNode, shortestRoadPath } from './topology.js';
import { buildLaneGraph, findLaneRoute, laneRouteGeometry } from '../../laneGraph.js';
export { buildingRoadAttachment as roadAttachment };
export function connectedRoadComponents(network) {
    const nodes = network?.nodes || [], adjacency = network?.adjacency || new Map(), seen = new Set(), components = [];
    for (const start of nodes) {
        if (seen.has(start))
            continue;
        const component = [];
        const queue = [start];
        seen.add(start);
        while (queue.length) {
            const node = queue.shift();
            component.push(node);
            for (const link of adjacency.get(node) || []) {
                if (!seen.has(link.node)) {
                    seen.add(link.node);
                    queue.push(link.node);
                }
            }
        }
        components.push(component);
    }
    return components;
}
function componentIndex(network) { const index = new Map(); for (const [componentId, component] of connectedRoadComponents(network).entries())
    for (const node of component)
        index.set(node, componentId); return index; }
export function isRouteStale(state, route) { return !route || route.roadNetworkRevision !== Math.max(0, Math.floor(Number(state.roadNetworkRevision) || 0)); }
export function routeNetworkValid(state, route) {
    if (isRouteStale(state, route) || !route)
        return false;
    if (!Array.isArray(route.laneIds) || !route.laneIds.length)
        return false;
    if (!Array.isArray(route.laneRoadIds) || route.laneRoadIds.length !== route.laneIds.length)
        return false;
    const roadIds = new Set(state.roads.map(road => road?.id).filter(Boolean));
    if (!route.laneRoadIds.every(id => !!id && roadIds.has(id)))
        return false;
    const laneGraph = buildLaneGraph(roadNetwork(state), { lanesPerDirection: 1 });
    return route.laneIds.every((id, index) => { const lane = laneGraph.lanesById.get(id); return !!lane && lane.roadId === route.laneRoadIds[index]; });
}
export function routeOnRoadNetwork(s, a, b) {
    const aa = buildingRoadAttachment(s, a), bb = buildingRoadAttachment(s, b);
    if (!aa || !bb)
        return null;
    const startPoint = aa.canonical && aa.entrance ? aa.entrance : aa.roadPoint, endPoint = bb.canonical && bb.entrance ? bb.entrance : bb.roadPoint, startGate = startPoint, endGate = endPoint;
    const network = roadNetwork(s, [startPoint, endPoint]), start = nearestGraphNode(network, startPoint), end = nearestGraphNode(network, endPoint);
    if (!start || !end)
        return null;
    const components = componentIndex(network), startComponent = components.get(start), laneGraph = buildLaneGraph(network, { lanesPerDirection: 1 }), roadResult = shortestRoadPath(network, start, end);
    if (!roadResult?.path || roadResult.path.length < 2)
        return null;
    const laneResult = findLaneRoute(laneGraph, start, end);
    if (!laneResult?.laneIds?.length)
        return null;
    const laneIds = [...laneResult.laneIds], routeDistance = roadResult.distance, routePoints = roadResult.path.map(p => ({ x: p.x, y: p.y })), laneGeometry = laneRouteGeometry(laneGraph, laneIds), lanePoints = laneGeometry.points.length >= 2 ? laneGeometry.points : routePoints;
    for (const junction of network.junctions || [])
        for (let i = 1; i < routePoints.length; i++) {
            const q = projectSegment(junction, routePoints[i - 1], routePoints[i]), a = routePoints[i - 1], b = routePoints[i], dx = b.x - a.x, dy = b.y - a.y, t = dx * dx + dy * dy ? ((q.point.x - a.x) * dx + (q.point.y - a.y) * dy) / (dx * dx + dy * dy) : 0;
            if (q.distance > 8 || t <= 1e-6 || t >= 1 - 1e-6)
                continue;
            routePoints.splice(i, 0, { x: junction.x, y: junction.y });
            break;
        }
    const yardPath = (building, fromGateToDock = false) => { const dock = buildingPrimaryDock(building), entrance = buildingRoadEntrance(building); if (!dock || !entrance)
        return []; const turnX = dock.point.x + ((dock.normal?.y || 0) > 0 ? 48 : -48), midY = (entrance.y + dock.approach.y) / 2, turn = { x: turnX, y: midY }; return fromGateToDock ? [{ x: entrance.x, y: entrance.y }, turn, { x: dock.approach.x, y: dock.approach.y }] : [{ x: dock.approach.x, y: dock.approach.y }, turn, { x: entrance.x, y: entrance.y }]; };
    const startYard = aa.canonical ? yardPath(a, false) : [], endYard = bb.canonical ? yardPath(b, true) : [], combined = [...startYard, ...routePoints, ...endYard], combinedPoints = combined.filter((p, i) => i === 0 || dist(p, combined[i - 1]) > .01), yardDistance = length(startYard) + length(endYard);
    return { points: combinedPoints, distance: Math.max(0, routeDistance + yardDistance), networkDistance: routeDistance, yardDistance: Math.max(0, yardDistance), laneIds, laneRoadIds: laneIds.map(id => laneGraph.lanesById.get(id)?.roadId || null), graphNodeCount: network.nodes.length, laneCount: laneGraph.lanes.length, lanePoints, laneTransitions: laneGeometry.transitions, start: { x: startPoint.x, y: startPoint.y }, end: { x: endPoint.x, y: endPoint.y }, startYard: startYard.map(p => ({ ...p })), endYard: endYard.map(p => ({ ...p })), roadNetworkRevision: Math.max(0, Math.floor(Number(s.roadNetworkRevision) || 0)), componentId: startComponent === undefined ? null : startComponent };
}
export function roadPath(s, a, b) { if (!finitePoint(a) || !finitePoint(b))
    return null; const start = snap(s, a), end = snap(s, b); if (dist(start, end) < 8)
    return [start, end]; const existing = routeOnRoadNetwork(s, start, end); return existing?.points || null; }
//# sourceMappingURL=routing.js.map