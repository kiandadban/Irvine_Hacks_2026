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
    // Collision visual feedback removed per user request
    function updateCollisionVisuals(obj) {
        // No-op: objects maintain their natural colors
    }

    // ── 5. SELECTION WRAPPERS & INFO PANEL ──
    const infoPanel = createInfoPanel((obj) => {
        if (!obj) return;
        scene.remove(obj);
        const idx = spawnedFurniture.indexOf(obj);
        if (idx > -1) spawnedFurniture.splice(idx, 1);
        collisionEngine.updateObstacles();
        wrappedDeselect();
    });

    const wrappedSelect = (obj) => {
        if (!obj) return;
        selectObject(obj);     
        infoPanel.update(obj);  
    };

    const wrappedDeselect = () => {
        deselectObject();       
        infoPanel.hide();       
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

    // ── 9. AI GENERATION LOGIC ──
    const ai = createAI(API_KEY, furnitureLibrary, roomManager);
    const aiBtn   = document.getElementById('ai-generate-btn');
    const aiInput = document.getElementById('ai-prompt');

    async function handleGenerate(userText, useRoomContext = true, roomType = null) {
        if (!userText || aiBtn?.disabled) return;
        if (aiBtn) { aiBtn.disabled = true; }

        try {
            const budgetParam = window.initialBudget || document.getElementById('budgetSlider')?.value;
            const layout = await ai.runGeneration(userText, {
                useRoomContext,
                roomType,
                budget: budgetParam,
                onStatus: (s) => { if (aiBtn) aiBtn.innerText = s; },
            });
            
            if (!layout || !Array.isArray(layout)) return;

            // Reorder layout: place non-placeable surface furniture first (tables, drawers, shelves, cupboards, desks)
            try {
                const surfaceOrder = [
                    'tables', 'drawers', 'shelves', 'cupboard', 'cupboards', 'desk', 'sofas', 'beds', 'bed', 'electronics'
                ];

                const scoreFor = (item) => {
                    const a = assetMap.find ? assetMap.find(item.file) : assetMap[item.file];
                    if (!a) return 0;
                    if (!a.placeable) {
                        const folder = (a.folder || a.category || '').toString().toLowerCase();
                        for (let i = 0; i < surfaceOrder.length; i++) {
                            if (folder.startsWith(surfaceOrder[i])) return (surfaceOrder.length - i) + 10; // higher score for earlier entries
                        }
                        // non-placeable generic
                        return 5;
                    }
                    // placeable accessories get low score
                    return 0;
                };

                layout.sort((a, b) => {
                    const sa = scoreFor(a);
                    const sb = scoreFor(b);
                    return sb - sa; // descending: higher score first
                });
            } catch (e) {
                console.warn('[Main] Failed to reorder layout for surface-first placement', e);
            }

            // Clear existing furniture for new AI layout
            wrappedDeselect();
            spawnedFurniture.forEach(o => scene.remove(o));
            spawnedFurniture.length = 0;
            collisionEngine.updateObstacles();

            // Two-pass placement: place non-placeable surface furniture first,
            // then place placeable accessories so they can snap to those surfaces.
            const nonPlaceables = layout.filter(it => {
                const a = assetMap.find ? assetMap.find(it.file) : assetMap[it.file];
                return a ? !a.placeable : true; // if unknown, treat as non-placeable conservatively
            });
            const placeables = layout.filter(it => !nonPlaceables.includes(it));

            // Place surfaces first
            for (const item of nonPlaceables) {
                try { await placeModel(item); } catch (e) { console.warn('[Main] surface placement failed', item, e); }
            }

            // Then place accessories; collect failures for retry passes
            let failedPlaceables = [];
            for (const item of placeables) {
                try {
                    const res = await placeModel(item);
                    if (!res) failedPlaceables.push(item);
                } catch (e) {
                    failedPlaceables.push(item);
                }
            }

            // Multi-pass retry: up to 3 attempts with increasing delays to let surfaces settle
            const maxRetries = 3;
            for (let retryPass = 0; retryPass < maxRetries && failedPlaceables.length > 0; retryPass++) {
                const delay = 200 + (retryPass * 300); // exponential backoff
                await new Promise(r => setTimeout(r, delay));
                console.debug(`[Main] Retry pass ${retryPass + 1}/${maxRetries} for ${failedPlaceables.length} placeables`);
                
                const stillFailed = [];
                for (const item of failedPlaceables) {
                    try {
                        const res = await placeModel(item);
                        if (!res) stillFailed.push(item);
                    } catch (e) {
                        stillFailed.push(item);
                    }
                }
                failedPlaceables = stillFailed;
            }

            // Fallback: place remaining orphaned placeables on the floor at their desired (x, z)
            if (failedPlaceables.length > 0) {
                console.warn(`[Main] ${failedPlaceables.length} items still failed. Attempting ground placement as fallback.`);
                const groundPlaceables = [];
                for (const item of failedPlaceables) {
                    try {
                        // Clone item but force Y=0 (floor) and no surface snapping
                        const groundItem = { ...item, y: 0 };
                        const res = await placeModel(groundItem);
                        if (res) {
                            groundPlaceables.push(item.file);
                        } else {
                            console.error('[Main] Ground placement also failed for:', item.file);
                        }
                    } catch (e) {
                        console.error('[Main] Ground placement exception for:', item.file, e);
                    }
                }
                if (groundPlaceables.length > 0) {
                    console.log(`[Main] Successfully ground-placed ${groundPlaceables.length} orphaned items:`, groundPlaceables);
                }
            }
            window.dispatchEvent(new CustomEvent('layoutgenerated', { detail: layout }));
        } catch (e) {
            console.error("AI Generation Error:", e);
            alert("Design Error: " + (e.message ?? String(e)));
        } finally {
            if (aiBtn) { 
                aiBtn.disabled = false; 
                aiBtn.innerText = 'Generate Layout'; 
            }
        }
    }

    // ── 10. EVENT LISTENERS ──

    // Capture the selected Room Type from the UI when clicking Generate
    aiBtn?.addEventListener('click', () => {
        // Look for the active button in the sidebar
        const activeBtn = document.querySelector('.room-type-btn.active span');
        const selectedRoomType = activeBtn ? activeBtn.innerText.trim() : 'Living Room';
        
        handleGenerate(aiInput?.value, true, selectedRoomType);
    });

    // Auto-generate layout if prompt was passed from front page
    if (window.initialPrompt) {
        aiInput.value = window.initialPrompt;
        const activeBtn = document.querySelector('.room-type-btn.active span');
        const selectedRoomType = activeBtn ? activeBtn.innerText.trim() : 'Living Room';
        handleGenerate(window.initialPrompt, true, selectedRoomType);
    }

    // Load layout from JSON file (dispatched by download.js)
    window.addEventListener('loadlayout', async (e) => {
        const layout = e.detail;
        if (!Array.isArray(layout)) return;
        wrappedDeselect();
        spawnedFurniture.forEach(o => scene.remove(o));
        spawnedFurniture.length = 0;
        collisionEngine.updateObstacles();
        // Two-pass placement for loaded layouts as well: surfaces first, then accessories
        const nonPlaceables = layout.filter(it => {
            const a = assetMap.find ? assetMap.find(it.file) : assetMap[it.file];
            return a ? !a.placeable : true;
        });
        const placeables = layout.filter(it => !nonPlaceables.includes(it));

        for (const item of nonPlaceables) {
            try { await placeModel(item); } catch (e) { console.warn('[Main] surface placement failed (loaded layout)', item, e); }
        }

        const failedPlaceables = [];
        for (const item of placeables) {
            try { const res = await placeModel(item); if (!res) failedPlaceables.push(item); } catch (e) { failedPlaceables.push(item); }
        }

        if (failedPlaceables.length) {
            for (const item of failedPlaceables.slice()) {
                try { const res = await placeModel(item); if (res) { const idx = failedPlaceables.indexOf(item); if (idx > -1) failedPlaceables.splice(idx, 1); } } catch (e) {}
            }
            if (failedPlaceables.length) console.warn('[Main] Some loaded placeables still failed to place:', failedPlaceables.map(i=>i.file));
        }

        window.dispatchEvent(new CustomEvent('layoutgenerated', { detail: layout }));
    });

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
        if (k === 'delete' || k === 'backspace') {
            const obj = transform.object;
            scene.remove(obj);
            const idx = spawnedFurniture.indexOf(obj);
            if (idx > -1) spawnedFurniture.splice(idx, 1);
            collisionEngine.updateObstacles();
            wrappedDeselect();
        }
    });

    // ── 11. RENDER LOOP ──
    (function animate() {
        requestAnimationFrame(animate);
        orbit.update();
        renderer.render(scene, camera);
    })();

    document.getElementById('cart-btn').addEventListener('click', () => {
    // 1. Map the Three.js objects back to their data attributes
    const shoppingItems = spawnedFurniture.map(model => {
        const attr = model.userData.attributes;
        return {
            name: attr.name,
            price: attr.shopping?.price || 0,
            url: attr.shopping?.url || "#",
            store: attr.shopping?.store || "Unknown"
        };
    });

    // 2. Save to local storage
    localStorage.setItem('roomai_cart', JSON.stringify(shoppingItems));

    // 3. Navigate
    window.location.href = "../User Interface/shopping-list.html";
});
}

initApp();