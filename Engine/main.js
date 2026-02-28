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

    // ── 5. SELECTION WRAPPERS & INFO PANEL ──
    
    // Initialize Info Panel first
    const infoPanel = createInfoPanel((obj) => {
        // Callback for the "Remove Item" button inside the side panel
        if (!obj) return;
        scene.remove(obj);
        const idx = spawnedFurniture.indexOf(obj);
        if (idx > -1) spawnedFurniture.splice(idx, 1);
        collisionEngine.updateObstacles();
        wrappedDeselect();
    });

    const wrappedSelect = (obj) => {
        if (!obj) return;
        selectObject(obj);     // Triggers TransformControls
        infoPanel.update(obj);  // Triggers UI Slide-in
    };

    const wrappedDeselect = () => {
        deselectObject();       // Detaches TransformControls
        infoPanel.hide();       // Triggers UI Slide-out
    };

    // ── 6. CONTROLS ──
    const uiRef = { getUI: () => ui };
    const { orbit, transform, selectObject, deselectObject } = initControls(
        camera, renderer, scene,
        collisionEngine, spawnedFurniture,
        updateCollisionVisuals, uiRef
    );

    // ── 7. PLACEMENT ──
    const { placeModel } = createPlacer(
        scene, spawnedFurniture, collisionEngine,
        assetMap, roomManager, wrappedSelect, updateCollisionVisuals
    );

    // ── 8. UI ──
    const ui = initUI(
        () => {},
        (hex) => { transform.object?.traverse(n => { if (n.isMesh) n.material.color.set(hex); }); },
        () => {
            // Global Delete logic (from sidebar or keyboard)
            const obj = transform.object;
            if (!obj) return;
            scene.remove(obj);
            const idx = spawnedFurniture.indexOf(obj);
            if (idx > -1) spawnedFurniture.splice(idx, 1);
            collisionEngine.updateObstacles();
            wrappedDeselect();
        },
        (path) => placeModel({ file: path.split('/').pop(), x: 0, z: 0 })
    );

    // ── 9. AI ──
    const ai = createAI(API_KEY, furnitureLibrary, roomManager);
    const aiBtn   = document.getElementById('ai-generate-btn');
    const aiInput = document.getElementById('ai-prompt');

    async function handleGenerate(userText, useRoomContext = true, roomType = null) {
        if (!userText || aiBtn?.disabled) return;
        if (aiBtn) { aiBtn.disabled = true; }

        try {
            const layout = await ai.runGeneration(userText, {
                useRoomContext,
                roomType,
                onStatus: (s) => { if (aiBtn) aiBtn.innerText = s; },
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
            if (aiBtn) { aiBtn.disabled = false; aiBtn.innerText = 'Generate Layout'; }
        }
    }

    aiBtn?.addEventListener('click', () => {
        const activeRoomBtn = document.querySelector('.room-type-btn.active span');
        const roomType = activeRoomBtn ? activeRoomBtn.innerText.trim() : 'Living Room';
        handleGenerate(aiInput?.value, true, roomType);
    });

    // ── 10. MOUSE & KEYBOARD ──
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

    // ── 11. RENDER LOOP ──
    (function animate() {
        requestAnimationFrame(animate);
        orbit.update();
        renderer.render(scene, camera);
    })();
}

initApp();