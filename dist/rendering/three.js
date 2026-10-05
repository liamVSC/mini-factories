import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm?v=6';
const sharedMaterials = new Set();
const boxGeometries = new Map();
const cylinderGeometries = new Map();
const sharedGeometries = new WeakSet();
export function material(color, roughness = .82, metalness = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    sharedMaterials.add(m);
    return m;
}
export function glass(color = '#284b52') { return material(color, .18, .12); }
export function part(g, geometry, mat, x, y, z, ry = 0, cast = true) {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
    return m;
}
export function cachedGeometry(cache, key, create) {
    let geometry = cache.get(key);
    if (!geometry) {
        geometry = create();
        sharedGeometries.add(geometry);
        cache.set(key, geometry);
    }
    return geometry;
}
export function boxGeometry(w, h, d) {
    const dims = [w, h, d].map(value => Math.max(.1, Math.round(value * 2) / 2));
    return cachedGeometry(boxGeometries, dims.join(','), () => new THREE.BoxGeometry(...dims));
}
export function box(g, w, h, d, mat, x, y, z, ry = 0, cast = true) {
    return part(g, boxGeometry(w, h, d), mat, x, y, z, ry, cast);
}
export function instancedBoxes(g, w, h, d, mat, positions, cast = false) {
    if (!positions.length)
        return null;
    const mesh = new THREE.InstancedMesh(boxGeometry(w, h, d), mat, positions.length), matrix = new THREE.Matrix4();
    for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        matrix.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry || 0, 0)), new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
}
export function cyl(g, r, h, mat, x, y, z, segments = 16) {
    const radius = Math.max(.1, Math.round(r * 2) / 2), height = Math.max(.1, Math.round(h * 2) / 2), key = `${radius},${height},${segments}`;
    return part(g, cachedGeometry(cylinderGeometries, key, () => new THREE.CylinderGeometry(radius, radius, height, segments)), mat, x, y, z);
}
export function surface(g, w, d, mat, x, z, y = .12) { box(g, w, .14, d, mat, x, y, z, 0, false); }
export function foundation(g, w, d, concrete, dark, x = 0, z = 0) {
    box(g, w + 8, .7, d + 8, concrete, x, .45, z, 0, false);
    box(g, w + 3, 1.1, d + 3, dark, x, .95, z, 0, false);
}
export function windowPanel(g, x, y, z, w, h, glassMat, frameMat, axis = 'front', direction = 1, divisions = 0) {
    if (axis === 'front') {
        box(g, w + 1.6, h + 1, .55, frameMat, x, y, z);
        box(g, w, h, .24, glassMat, x, y, z + direction * .32, 0, false);
        for (const side of [-1, 1])
            box(g, .55, h + .2, .7, frameMat, x + side * (w / 2 + .25), y, z);
        for (let i = 1; i < divisions; i++)
            box(g, .32, h, .72, frameMat, x - w / 2 + w * i / divisions, y, z, 0, false);
    }
    else {
        box(g, .55, h, w + 1.6, frameMat, x, y, z);
        box(g, .24, h, w, glassMat, x + direction * .32, y, z, 0, false);
        for (const side of [-1, 1])
            box(g, .72, h, .55, frameMat, x, y, z + side * (w / 2 + .25));
        for (let i = 1; i < divisions; i++)
            box(g, .72, h, .32, frameMat, x, y, z - w / 2 + w * i / divisions, 0, false);
    }
}
export function frontWindows(g, width, y, z, dir, count, glassMat, frameMat, windowW = 8, windowH = 6, centerX = 0) {
    for (let i = 0; i < count; i++) {
        const x = centerX - width / 2 + (i + .5) * width / count;
        windowPanel(g, x, y, z + dir * .42, windowW, windowH, glassMat, frameMat, 'front', dir, 2);
    }
}
export function sideWindows(g, x, side, depth, y, glassMat, frameMat, count = 5, centerZ = 0) {
    for (let i = 0; i < count; i++) {
        const z = centerZ - depth / 2 + (i + .5) * depth / count;
        windowPanel(g, x, y, z, 7, 5, glassMat, frameMat, 'side', side, 2);
    }
}
export function loadingDoor(g, x, z, w, h, dir, metal, dark) {
    const cy = h / 2 + 1.5;
    box(g, w + 3, h + 3, .85, metal, x, cy, z + dir * .34);
    box(g, w, h, .32, dark, x, cy, z + dir * .82, 0, false);
    for (const side of [-1, 1]) {
        box(g, 1.1, h + 1, .9, metal, x + side * (w / 2 + 1), cy, z + dir * .8);
        cyl(g, .45, 1.2, metal, x + side * (w / 2 + 2.3), 2, z + dir * 2, 8);
    }
    for (let i = 1; i < 4; i++)
        box(g, w - .7, .28, .42, metal, x, 1.5 + i * (h - 3) / 4, z + dir * 1.02, 0, false);
}
export function dockStrip(g, x, z, w, dir, mat) {
    box(g, w, 1.25, 8, mat, x, 1.08, z + dir * 4, 0, false);
    const bump = material('#b5bbb6', .75);
    for (let i = 0; i < Math.max(3, Math.floor(w / 16)); i++) {
        const px = x - w / 2 + 8 + i * (w - 16) / Math.max(1, Math.floor(w / 16) - 1);
        box(g, .7, 1.5, 1.4, bump, px, 1.8, z + dir * 1.2, 0, false);
    }
}
export function gate(g, z, width, metal) {
    const dark = material('#303635', .98);
    for (const x of [-width / 2, width / 2]) {
        box(g, 2.2, 8, 1.4, metal, x, 4, z);
        box(g, 1, 5, .5, dark, x, 4, z - 1);
    }
    box(g, width + 2, .65, 1.1, metal, 0, 8, z);
    for (const x of [-width / 2 - 3, width / 2 + 3])
        cyl(g, .55, 3.4, material('#d8b95e', .56), x, 1.7, z, 10);
}
export function fence(g, x1, z1, x2, z2, metal) {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    if (len < 1)
        return;
    for (const y of [.55, 2.15, 3.8])
        box(g, len, .3, .7, metal, (x1 + x2) / 2, y, (z1 + z2) / 2, a, false);
    const count = Math.ceil(len / 18) + 1, geometry = cachedGeometry(cylinderGeometries, 'fence-post', () => new THREE.CylinderGeometry(.35, .35, 4, 8)), posts = new THREE.InstancedMesh(geometry, metal, count), matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
        const d = len * i / (count - 1), x = x1 + Math.cos(a) * d, z = z1 + Math.sin(a) * d;
        posts.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, 2.1, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
    }
    posts.instanceMatrix.needsUpdate = true;
    posts.castShadow = true;
    posts.receiveShadow = true;
    g.add(posts);
}
export function parkedMarkings(g, plan, paint) {
    const count = Math.max(4, Math.floor(plan.parkingWidth / 12)), stall = plan.parkingWidth / count;
    for (const row of [-1, 1]) {
        const z = plan.parkingZ + row * 8, lines = [];
        for (let i = 0; i <= count; i++)
            lines.push({ x: -plan.parkingWidth / 2 + i * stall, y: .28, z });
        instancedBoxes(g, .42, .08, 15, paint, lines);
        box(g, plan.parkingWidth, .08, .42, paint, 0, .28, z - 7.5, 0, false);
        box(g, plan.parkingWidth, .08, .42, paint, 0, .28, z + 7.5, 0, false);
    }
}
export function palletStack(g, x, z, wood) {
    box(g, 6, .5, 5, wood, x, .4, z, 0, false);
    for (const ox of [-2, 0, 2])
        box(g, .65, .8, 5, wood, x + ox, .95, z, 0, false);
    box(g, 5, 2.3, 4, material('#a98255', .94), x, 2.5, z);
    box(g, 5, 2.3, 4, material('#b58a5b', .94), x, 4.9, z);
}
export function container(g, x, z, metal, accent) {
    box(g, 28, 9, 11, metal, x, 4.6, z);
    const ribs = [];
    for (let i = -5; i <= 5; i++)
        ribs.push({ x: x + i * 2.4, y: 4.6, z: z + 5.7 });
    instancedBoxes(g, .3, 8.5, .3, accent, ribs);
    box(g, .4, 8.5, .4, accent, x - 13.8, 4.6, z, 0, false);
    box(g, .4, 8.5, .4, accent, x + 13.8, 4.6, z, 0, false);
}
export function dumpster(g, x, z, metal, dark) {
    box(g, 10, 4, 6, metal, x, 2.4, z);
    box(g, 10.5, .6, 6.5, dark, x, 4.7, z);
    for (const side of [-1, 1])
        cyl(g, .8, .65, dark, x + side * 3.2, 1, z - 3, 8);
}
export function forklift(g, x, z, metal, dark, glassMat) {
    box(g, 8, 4, 5, dark, x, 3, z);
    box(g, 4, 4, 4, metal, x - 1, 7, z);
    box(g, 3, 2.5, 4, glassMat, x - 1, 7, z + 2.1, 0, false);
    for (const side of [-1, 1]) {
        const wheel = cyl(g, 1.35, 1, material('#252a29', .98), x, 1.5, z + side * 2.7, 12);
        wheel.rotation.x = Math.PI / 2;
    }
    for (const side of [-1, 1])
        box(g, .5, 7, .6, metal, x + 4.7, 4.7, z + side * 1.6);
    box(g, 3, .5, .6, metal, x + 5.8, 1, z, 0, false);
}
export function roofRibs(g, w, d, y, metal, count = 5) { for (let i = 0; i < count; i++) {
    const x = -w / 2 + 6 + i * (w - 12) / Math.max(1, count - 1);
    box(g, 1.6, .9, d - 10, metal, x, y, 0);
} }
export function siteLights(g, plan, metal, lightMat) {
    for (const side of [-1, 1]) {
        const x = side * (plan.site.halfWidth - 15), z = plan.courtZ;
        box(g, .8, 17, .8, metal, x, 8.5, z);
        box(g, 3, .55, 1.6, lightMat, x, 17.2, z);
    }
}
export function materialsIn(group) {
    const found = new Set();
    group.traverse((o) => { for (const mat of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []))
        found.add(mat); });
    return found;
}
export function disposeObjectGroup(group) {
    const materials = materialsIn(group);
    group.traverse((o) => { if (o.geometry && !sharedGeometries.has(o.geometry))
        o.geometry.dispose(); });
    for (const mat of materials) {
        mat.dispose();
        sharedMaterials.delete(mat);
    }
}
//# sourceMappingURL=three.js.map