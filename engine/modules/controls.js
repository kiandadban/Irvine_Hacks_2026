import * as THREE from 'three';
import { OrbitControls }     from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

/**
 * Sets up orbit + transform controls and selection helpers.
 * @param {THREE.Camera}   camera
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene}    scene
 * @param {CollisionEngine} collisionEngine
 * @param {THREE.Object3D[]} spawnedFurniture
 * @param {Function} updateCollisionVisuals(obj)
 * @param {{ getUI }} uiRef - object with getUI() that returns the ui instance (avoids circular dep)
 * @returns {{ orbit, transform, selectObject, deselectObject, getSelected }}
 */
export function initControls(
    camera, renderer, scene,
    collisionEngine, spawnedFurniture,
    updateCollisionVisuals, uiRef
) {
    let selectedObject = null;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setTranslationSnap(0.5);
    scene.add(transform);

    // ── Keep dragged objects inside the room ──
    // The last transform known to be clear of the walls. Restored whenever a
    // drag pushes the object through one, which stops it at the wall instead
    // of letting it pass. Furniture-vs-furniture overlap is deliberately NOT
    // blocked: accessories legitimately intersect the surface they sit on.
    let lastValid = null;

    const snapshot = (obj) => ({
        position: obj.position.clone(),
        scale: obj.scale.clone(),
        quaternion: obj.quaternion.clone(),
    });

    const restore = (obj, snap) => {
        obj.position.copy(snap.position);
        obj.scale.copy(snap.scale);
        obj.quaternion.copy(snap.quaternion);
        obj.updateMatrixWorld(true);
    };

    const hitsRoomShell = (obj) => {
        const { isColliding, type } = collisionEngine.checkCollision(obj);
        return isColliding && (type === 'boundary' || type === 'wall');
    };

    transform.addEventListener('objectChange', () => {
        const obj = transform.object;
        if (!obj) return;

        if (hitsRoomShell(obj)) {
            // Without a known-good transform (object spawned overlapping a
            // wall) let the user drag freely rather than freezing it.
            if (lastValid) restore(obj, lastValid);
        } else {
            lastValid = snapshot(obj);
        }
    });

    transform.addEventListener('dragging-changed', (e) => {
        orbit.enabled = !e.value;
        if (e.value) {
            const obj = transform.object;
            lastValid = obj && !hitsRoomShell(obj) ? snapshot(obj) : null;
        } else {
            collisionEngine.updateObstacles();
        }
    });

    function selectObject(obj) {
        if (selectedObject === obj) return;
        selectedObject = obj;
        transform.attach(obj);
        document.getElementById('props-panel')?.classList.add('active');
        uiRef.getUI()?.showProps(obj);
    }

    function deselectObject() {
        selectedObject = null;
        transform.detach();
        document.getElementById('props-panel')?.classList.remove('active');
        uiRef.getUI()?.hideProps();
    }

    return { orbit, transform, selectObject, deselectObject, getSelected: () => selectedObject };
}
