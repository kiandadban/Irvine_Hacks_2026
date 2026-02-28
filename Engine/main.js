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

async function initApp() {
    // ── 1. DATA ──
    let furnitureLibrary, assetMap;
    try {
        ({ furnitureLibrary, assetMap } = await loadFurnitureLibrary());
    } catch (e) {
        console.error('Could not load furniture library:', e);
        return;
    }

    // ── 2. SCENE ──
    const container = document.getElementById('canvas-wrapper');
    const { scene, camera, renderer } = initScene(container);

    // ── 3. PHYSICS ──
    const spawnedFurniture = [];
    const collisionEngine  = new CollisionEngine([], spawnedFurniture, 10, 10);

    // ── 4. ROOM ──
    const roomManager = createRoomManager(scene, collisionEngine);

    // ── 5. COLLISION VISUALS ──
    function updateCollisionVisuals(obj) {
        if (!obj) return;
        const { isColliding } = collisionEngine.checkCollision(obj);
        obj.traverse(child => {
            if (!child.isMesh || !child.material) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
                if (!mat.userData._orig) {
                    mat.userData._orig = {
                        color:             mat.color?.clone(),
                        emissive:          mat.emissive?.clone(),
                        emissiveIntensity: mat.emissiveIntensity,
                    };
                }
                if (isColliding) {
                    mat.emissive?.set(0xff0000);
                    if (mat.emissive) mat.emissiveIntensity = 0.5;
                    mat.color?.set(0xffaaaa);
                } else {
                    const o = mat.userData._orig;
                    if (o?.color)    mat.color.copy(o.color);
                    if (o?.emissive) mat.emissive.copy(o.emissive);
                    if (typeof o?.emissiveIntensity === 'number') mat.emissiveIntensity = o.emissiveIntensity;
                }
            });
        });
    }

    // ── 6. CONTROLS ──
    // uiRef defers access to `ui` so controls.js doesn't need it at construction time
    const uiRef = { getUI: () => ui };
    const { orbit, transform, selectObject, deselectObject } = initControls(
        camera, renderer, scene,
        collisionEngine, spawnedFurniture,
        updateCollisionVisuals, uiRef
    );

    // ── 7. PLACEMENT ──
    const { placeModel } = createPlacer(
        scene, spawnedFurniture, collisionEngine,
        assetMap, roomManager, selectObject, updateCollisionVisuals
    );

    // ── 8. UI ──
    const ui = initUI(
        () => {},
        (hex) => { transform.object?.traverse(n => { if (n.isMesh) n.material.color.set(hex); }); },
        () => {
            const obj = uiRef.getUI && transform.object;
            if (!transform.object) return;
            scene.remove(transform.object);
            const idx = spawnedFurniture.indexOf(transform.object);
            if (idx > -1) spawnedFurniture.splice(idx, 1);
            collisionEngine.updateObstacles();
            deselectObject();
        },
        (path) => placeModel({ file: path.split('/').pop(), x: 0, z: 0 })
    );

    // ── 9. AI ──
    const ai = createAI(API_KEY, furnitureLibrary, roomManager);
    const aiBtn   = document.getElementById('ai-generate-btn');
    const aiInput = document.getElementById('ai-prompt');

    async function handleGenerate(userText, useRoomContext = true) {
        if (!userText || aiBtn?.disabled) return;
        if (aiBtn) { aiBtn.disabled = true; }

        try {
            const layout = await ai.runGeneration(userText, {
                useRoomContext,
                onStatus: (s) => { if (aiBtn) aiBtn.innerText = s; },
            });
            if (!layout) return;

            deselectObject();
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

    aiBtn?.addEventListener('click', () => handleGenerate(aiInput?.value, true));

    // Auto-trigger from front-page redirect (?prompt=...)
    const autoPrompt = new URLSearchParams(window.location.search).get('prompt');
    if (autoPrompt && aiInput) {
        setTimeout(() => {
            aiInput.classList.add('auto-fill');
            aiInput.focus();
            let i = 0;
            aiInput.value = '';
            const type = setInterval(() => {
                aiInput.value += autoPrompt[i++];
                if (i >= autoPrompt.length) {
                    clearInterval(type);
                    setTimeout(() => {
                        aiInput.classList.remove('auto-fill');
                        handleGenerate(autoPrompt, false);
                    }, 400);
                }
            }, 30);
        }, 600);
    }

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
            if (spawnedFurniture.includes(root)) selectObject(root);
        } else {
            deselectObject();
        }
    });

    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'escape') { deselectObject(); return; }
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

