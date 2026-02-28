import * as THREE from 'three';
import { API_KEY }            from './config.js';
import { initUI }             from './ui.js';
import { CollisionEngine }    from './collision.js';
import { loadFurnitureLibrary } from './modules/loader.js';
import { initScene }          from './modules/scene.js';
import { createRoomManager }  from './modules/room.js';
import { initControls }       from './modules/controls.js';
import { createPlacer }       from './modules/placement.js';
import { createAI }           from './modules/ai.js';
import { createInfoPanel }    from './modules/infoPanel.js';

async function initApp() {
    // ── 1. DATA LOADING ──
    let furnitureLibrary, assetMap;
    try {
        ({ furnitureLibrary, assetMap } = await loadFurnitureLibrary());
    } catch (e) {
        console.error('Could not load furniture library:', e);
        return;
    }

    // ── 2. SCENE & RENDERER ──
    const container = document.getElementById('canvas-wrapper');
    const { scene, camera, renderer } = initScene(container);

    // ── 3. PHYSICS & ROOM ──
    const spawnedFurniture = [];
    const collisionEngine  = new CollisionEngine([], spawnedFurniture, 10, 10);
    const roomManager = createRoomManager(scene, collisionEngine);

    // ── 4. COLLISION VISUALS ──
    function updateCollisionVisuals(obj) {
        if (!obj) return;
        const { isColliding } = collisionEngine.checkCollision(obj);
        obj.traverse(child => {
            if (!child.isMesh || !child.material) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
                if (!mat.userData._orig) {
                    mat.userData._orig = {
                        color: mat.color?.clone(),
                        emissive: mat.emissive?.clone(),
                        emissiveIntensity: mat.emissiveIntensity,
                    };
                }
                if (isColliding) {
                    mat.emissive?.set(0xff0000);
                    if (mat.emissive) mat.emissiveIntensity = 0.5;
                    mat.color?.set(0xffaaaa);
                } else {
                    const o = mat.userData._orig;
                    if (o?.color) mat.color.copy(o.color);
                    if (o?.emissive) mat.emissive.copy(o.emissive);
                    if (typeof o?.emissiveIntensity === 'number') mat.emissiveIntensity = o.emissiveIntensity;
                }
            });
        });
    }

    // ── 5. UI PANEL & CONTROLS ──
    // Selection state wrappers
    // In your initApp setup:
const infoPanel = createInfoPanel((obj) => {
    scene.remove(obj);
    spawnedFurniture.splice(spawnedFurniture.indexOf(obj), 1);
    collisionEngine.updateObstacles();
});

const wrappedSelect = (obj) => {
    selectObject(obj);    // Three.js Transform selection
    infoPanel.update(obj); // UI Animation Selection
};

const wrappedDeselect = () => {
    deselectObject();      // Three.js Deselect
    infoPanel.hide();      // UI Slide Out
};

    const uiRef = { getUI: () => ui };
    const { orbit, transform, selectObject, deselectObject } = initControls(
        camera, renderer, scene,
        collisionEngine, spawnedFurniture,
        updateCollisionVisuals, uiRef
    );

    // ── 6. PLACEMENT & AI ──
    const { placeModel } = createPlacer(
        scene, spawnedFurniture, collisionEngine,
        assetMap, roomManager, wrappedSelect, updateCollisionVisuals
    );

    const ai = createAI(API_KEY, furnitureLibrary, roomManager);
    const aiBtn   = document.getElementById('ai-generate-btn');
    const aiInput = document.getElementById('ai-prompt');

<<<<<<< HEAD
    async function handleGenerate(userText, useRoomContext = true, roomType = null) {
=======
    // ── 7. UI INITIALIZATION ──
    const ui = initUI(
        () => {}, // Primitive spawning (disabled)
        (hex) => { transform.object?.traverse(n => { if (n.isMesh) n.material.color.set(hex); }); },
        () => { // Global delete handler
            if (!transform.object) return;
            const obj = transform.object;
            scene.remove(obj);
            const idx = spawnedFurniture.indexOf(obj);
            if (idx > -1) spawnedFurniture.splice(idx, 1);
            collisionEngine.updateObstacles();
            wrappedDeselect();
        },
        (path) => placeModel({ file: path.split('/').pop(), x: 0, z: 0 })
    );

    // ── 8. EVENT HANDLERS ──
    async function handleGenerate(userText, useRoomContext = true) {
>>>>>>> 8595c2e133374ff17ec36068b299d25c12abc262
        if (!userText || aiBtn?.disabled) return;
        aiBtn.disabled = true;
        try {
            const layout = await ai.runGeneration(userText, {
                useRoomContext,
<<<<<<< HEAD
                roomType,
                onStatus: (s) => { if (aiBtn) aiBtn.innerText = s; },
=======
                onStatus: (s) => { aiBtn.innerText = s; },
>>>>>>> 8595c2e133374ff17ec36068b299d25c12abc262
            });
            if (!layout) return;

            wrappedDeselect();
            spawnedFurniture.forEach(o => scene.remove(o));
            spawnedFurniture.length = 0;
            collisionEngine.updateObstacles();

            for (const item of layout) await placeModel(item);
        } catch (e) {
            alert(e.message ?? String(e));
        } finally {
            aiBtn.disabled = false;
            aiBtn.innerText = 'Generate Layout';
        }
    }

    aiBtn?.addEventListener('click', () => {
        const activeRoomBtn = document.querySelector('.room-type-btn.active span');
        const roomType = activeRoomBtn ? activeRoomBtn.innerText.trim() : 'Living Room';
        handleGenerate(aiInput?.value, true, roomType);
    });

    // Typewriter effect for auto-prompts
    const autoPrompt = new URLSearchParams(window.location.search).get('prompt');
    if (autoPrompt && aiInput) {
        setTimeout(() => {
            aiInput.focus();
            let i = 0;
            const type = setInterval(() => {
                aiInput.value += autoPrompt[i++];
                if (i >= autoPrompt.length) {
                    clearInterval(type);
                    setTimeout(() => handleGenerate(autoPrompt, false), 400);
                }
            }, 30);
        }, 600);
    }

    // Canvas Mouse Interaction
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();

    window.addEventListener('mousedown', (e) => {
        if (e.target !== renderer.domElement || transform.dragging) return;
        const rect = container.getBoundingClientRect();
        mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(spawnedFurniture, true);
        
        if (hits.length) {
            let root = hits[0].object;
            while (root.parent && !spawnedFurniture.includes(root)) root = root.parent;
            if (spawnedFurniture.includes(root)) wrappedSelect(root);
        } else {
            wrappedDeselect();
        }
    });

    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'escape') { wrappedDeselect(); return; }
        if (!transform.object) return;
        if (k === 'g') transform.setMode('translate');
        if (k === 'r') transform.setMode('rotate');
        if (k === 's') transform.setMode('scale');
    });

    // ── 9. ANIMATION LOOP ──
    (function animate() {
        requestAnimationFrame(animate);
        orbit.update();
        renderer.render(scene, camera);
    })();
}

initApp();