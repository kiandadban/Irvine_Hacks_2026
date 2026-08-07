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

    transform.addEventListener('change', () => {
        // Collision visuals removed per user request
    });

    transform.addEventListener('dragging-changed', (e) => {
        orbit.enabled = !e.value;
        if (!e.value) {
            collisionEngine.updateObstacles();
            // updateCollisionVisuals removed
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
