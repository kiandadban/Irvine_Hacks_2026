/**
 * modules/materials.js
 *
 * Every mesh in the FBX library carries a material ARRAY (2-4 entries), so
 * `mesh.material.color` is undefined and any direct `.color.set()` throws.
 * These helpers always work through the array form.
 *
 * three's Object3D.clone() also shares material instances between copies, so a
 * freshly spawned model must own its materials before anything recolours it —
 * otherwise tinting one sofa tints every sofa in the scene.
 */

/** Normalises mesh.material to an array. */
function materialsOf(mesh) {
    if (!mesh.material) return [];
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Gives `root` its own copy of every material so recolouring stays local. */
export function isolateMaterials(root) {
    root.traverse(node => {
        if (!node.isMesh || !node.material) return;
        node.material = Array.isArray(node.material)
            ? node.material.map(m => m.clone())
            : node.material.clone();
    });
}

/** Tints every material on `root`. */
export function setObjectColor(root, hex) {
    root.traverse(node => {
        if (!node.isMesh) return;
        for (const m of materialsOf(node)) m.color?.set(hex);
    });
}

/** Reads a representative colour from `root`, or null when it has none. */
export function getObjectColor(root) {
    let found = null;
    root.traverse(node => {
        if (found || !node.isMesh) return;
        for (const m of materialsOf(node)) {
            if (m.color) { found = `#${m.color.getHexString()}`; return; }
        }
    });
    return found;
}
