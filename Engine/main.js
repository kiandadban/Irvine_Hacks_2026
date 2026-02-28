import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY } from './config.js';
import { initUI } from './ui.js';
import { createRoom } from './walls.js';
import { CollisionEngine } from './collision.js';

async function initApp() {
    let furnitureLibrary = [];
    let assetMap = {};
    const spawnedFurniture = [];
    let selectedObject = null;
    let roomWidth = 10;
    let roomDepth = 10;

    const modelPath = (filename) => {
        const asset = assetMap[filename];
        return asset ? `../models/${asset.category}/${asset.file}` : `../models/${filename}`;
    };


    // ── 1. ASSET DATA LOADING ──
    try {
        const resp = await fetch('../furniture_models/furniture_attributes.json');
        const data = await resp.json();
        furnitureLibrary = data.furniture_library;
        assetMap = furnitureLibrary.reduce((m, a) => { m[a.file] = a; return m; }, {});
    } catch (e) {
        console.error('Failed to load library attributes', e);
        return;
    }

    // ── 2. RENDERER & SCENE SETUP ──
    const container = document.getElementById('canvas-wrapper');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x262018); 

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(8, 8, 8);

    let { walls: currentWalls, floor: roomFloor } = createRoom(scene, roomWidth, roomDepth);
    const collisionEngine = new CollisionEngine(currentWalls, spawnedFurniture, roomWidth, roomDepth);

    function makeGrid(width, depth) {
        const pts = [];
        const step = 1;
        for (let z = -depth / 2; z <= depth / 2 + 0.001; z += step) {
            pts.push(-width / 2, 0, z,  width / 2, 0, z);
        }
        for (let x = -width / 2; x <= width / 2 + 0.001; x += step) {
            pts.push(x, 0, -depth / 2,  x, 0, depth / 2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xAAAAAA }));
        mesh.position.y = 0.01;
        return mesh;
    }

    let grid = makeGrid(roomWidth, roomDepth);
    scene.add(grid);

    // rebuildRoom will be redefined later with additional logic


    // ── 3. VISUAL COLLISION FEEDBACK ──
    const updateCollisionVisuals = (obj) => {
        const check = collisionEngine.checkCollision(obj);
        
        obj.traverse(child => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    if (check.isColliding) {
                        // Apply red tint and emissive glow
                        if (mat.emissive) {
                            mat.emissive.set(0xff0000);
                            mat.emissiveIntensity = 0.5;
                        }
                        mat.color.set(0xffaaaa);
                    } else {
                        // Reset to original
                        if (mat.emissive) {
                            mat.emissive.set(0x000000);
                            mat.emissiveIntensity = 0;
                        }
                        mat.color.set(0xffffff);
                    }
                });
            }
        });
    };

    // ── 4. REBUILD ROOM LOGIC ──
    function rebuildRoom(newWidth, newDepth) {
        currentWalls.forEach(w => scene.remove(w));
        if (roomFloor) scene.remove(roomFloor);
        scene.remove(grid);

        roomWidth = newWidth;
        roomDepth = newDepth;

        const result = createRoom(scene, roomWidth, roomDepth);
        currentWalls = result.walls;
        roomFloor = result.floor;

        grid = makeGrid(roomWidth, roomDepth);
        scene.add(grid);

        collisionEngine.updateWalls(currentWalls, roomWidth, roomDepth);
        
        // Update visuals for all furniture relative to new walls
        spawnedFurniture.forEach(item => updateCollisionVisuals(item));
    }

    // Slider Wiring
    const widthSlider = document.getElementById('widthSlider');
    const lengthSlider = document.getElementById('lengthSlider');
    if (widthSlider) widthSlider.addEventListener('input', () => {
        const val = parseFloat(widthSlider.value);
        document.getElementById('wVal').textContent = val.toFixed(1);
        rebuildRoom(val, roomDepth);
    });
    if (lengthSlider) lengthSlider.addEventListener('input', () => {
        const val = parseFloat(lengthSlider.value);
        document.getElementById('lVal').textContent = val.toFixed(1);
        rebuildRoom(roomWidth, val);
    });

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(5, 15, 7.5);
    scene.add(sun);

    const loader = new FBXLoader();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;

    // ── 5. TRANSFORM CONTROLS & SNAP ──
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setTranslationSnap(0.5); 
    scene.add(transform);

    transform.addEventListener('change', () => {
        if (transform.object) {
            updateCollisionVisuals(transform.object);
        }
    });

    transform.addEventListener('dragging-changed', (event) => {
        orbit.enabled = !event.value;
        if (!event.value) {
            collisionEngine.updateObstacles();
            updateCollisionVisuals(transform.object);
        }
    });

    // Selection Helpers
    const selectObject = (obj) => {
        if (selectedObject === obj) return;
        selectedObject = obj;
        transform.attach(selectedObject);
        const propsPanel = document.getElementById('props-panel');
        if (propsPanel) propsPanel.classList.add('active');
        if (ui) ui.showProps(selectedObject);
    };

    const deselectObject = () => {
        selectedObject = null;
        transform.detach();
        const propsPanel = document.getElementById('props-panel');
        if (propsPanel) propsPanel.classList.remove('active');
        if (ui) ui.hideProps();
    };

    // ── 6. PLACEMENT LOGIC ──
    async function placeModel(itemConfig) {
        const asset = assetMap[itemConfig.file];
        if (!asset) return;
        const path = `../models/${asset.category}/${asset.file}`;

        return new Promise((resolve) => {
            loader.load(path, (model) => {
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                model.scale.setScalar((asset.dimensions.width || 1.0) / size.x);

                model.rotation.y = itemConfig.rotate || 0;

                // Physics Nudge: Try to find a legal spot
                let posX = itemConfig.x || 0, posZ = itemConfig.z || 0;
                let isValid = false, attempts = 0;

                while (!isValid && attempts < 15) {
                    model.position.set(posX, 0, posZ);
                    model.updateMatrixWorld(true);
                    
                    const check = collisionEngine.checkCollision(model);
                    if (!check.isColliding) {
                        isValid = true;
                    } else {
                        // Nudge slightly and clamp to room
                        posX += (Math.random() - 0.5) * 1.5;
                        posZ += (Math.random() - 0.5) * 1.5;
                        posX = Math.max(-(roomWidth/2 - 0.5), Math.min(roomWidth/2 - 0.5, posX));
                        posZ = Math.max(-(roomDepth/2 - 0.5), Math.min(roomDepth/2 - 0.5, posZ));
                        attempts++;
                    }
                }

                if (isValid) {
                    scene.add(model);
                    spawnedFurniture.push(model);
                    collisionEngine.updateObstacles();
                }
                updateCollisionVisuals(model); // Initial check
                selectObject(model);
                resolve(model);
            }, undefined, () => resolve());

        });
    }

    // ── 7. UI & AI ──
    const ui = initUI(
        () => {}, 
        (hex) => { if (selectedObject) selectedObject.traverse(n => { if (n.isMesh) n.material.color.set(hex); }); },
        () => {
            if (selectedObject) {
                scene.remove(selectedObject);
                const index = spawnedFurniture.indexOf(selectedObject);
                if (index > -1) spawnedFurniture.splice(index, 1);
                collisionEngine.updateObstacles();
                deselectObject();
            }
        },
        (path) => placeModel({ file: path.split('/').pop(), x: 0, z: 0 })
    );

    const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
    const aiModel = genAI?.getGenerativeModel({ model: "gemini-2.0-flash" });

    const aiBtn = document.getElementById('ai-generate-btn');
    const aiInput = document.getElementById('ai-prompt');
    const autoPrompt = new URLSearchParams(window.location.search).get('prompt');

    if (aiBtn) {
        // Slider wiring
        const widthSlider  = document.getElementById('widthSlider');
        const lengthSlider = document.getElementById('lengthSlider');
        const wValEl = document.getElementById('wVal');
        const lValEl = document.getElementById('lVal');
        if (widthSlider) widthSlider.addEventListener('input', () => {
            roomWidth = parseFloat(widthSlider.value);
            if (wValEl) wValEl.textContent = roomWidth.toFixed(1);
            rebuildRoom(roomWidth, roomDepth);
        });
        if (lengthSlider) lengthSlider.addEventListener('input', () => {
            roomDepth = parseFloat(lengthSlider.value);
            if (lValEl) lValEl.textContent = roomDepth.toFixed(1);
            rebuildRoom(roomWidth, roomDepth);
        });

        async function runGeneration(userRequest, useRoomContext = true) {
            if (!aiModel || !userRequest || aiBtn.disabled) return;
            aiBtn.disabled = true;
            aiBtn.innerText = "Architecting...";

            try {
                let prompt;

                if (useRoomContext) {
                    const activeRoomBtn = document.querySelector('.room-type-btn.active span');
                    const roomType = activeRoomBtn ? activeRoomBtn.innerText.trim() : 'Living Room';

                    prompt = `
            ACT AS: Senior Interior Architect.
            ROOM TYPE: ${roomType}.
            ROOM: ${roomWidth}m x ${roomDepth}m. Bounds: X(-${roomWidth/2} to ${roomWidth/2}), Z(-${roomDepth/2} to ${roomDepth/2}).

            --- STRICT FILENAME MANIFEST ---
            You MUST ONLY use these exact filenames:
            ${furnitureLibrary.assets.map(a => a.file).join(", ")}

            --- PLACEMENT RULES ---
            1. NO OVERLAP: Maintain at least 2m between all bounding boxes.
            2. BOUNDS: All items must stay within X(-${roomWidth/2} to ${roomWidth/2}) and Z(-${roomDepth/2} to ${roomDepth/2}).
            3. DOORS: If using a door, place it exactly at the edge and lay it flat.
            4. DESK COMBO: If you place a "Desk.fbx", you MUST place a "Desk Chair.fbx" or "Desk Chair (2).fbx" next to it.
            5. SLEEPING: Place beds with the headboard against a wall.
            6. Don't place objects at exactly (0, 0).
            7. Keep amount of objects spawned to 15 or under.
            8. Only place furniture appropriate for a ${roomType}.

            --- OUTPUT FORMAT ---
            Output JSON ONLY array: [{"file": "name.glb", "x": 2.0, "z": -4.0, "rotate": 0}]

            USER REQUEST: "${userRequest}"`;
                } else {
                    prompt = `
            ACT AS: Senior Interior Architect.
            ROOM: 10m x 10m. Bounds: X(-5 to 5), Z(-5 to 5).

            --- STRICT FILENAME MANIFEST ---
            You MUST ONLY use these exact filenames:
            ${furnitureLibrary.assets.map(a => a.file).join(", ")}

            --- PLACEMENT RULES ---
            1. NO OVERLAP: Maintain at least 2m between all bounding boxes.
            2. BOUNDS: All items must stay within X(-5 to 5) and Z(-5 to 5).
            3. DOORS: If using a door, place it exactly at the edge and lay it flat.
            4. DESK COMBO: If you place a "Desk.fbx", you MUST place a "Desk Chair.fbx" or "Desk Chair (2).fbx" next to it.
            5. SLEEPING: Place beds with the headboard against a wall.
            6. Don't place objects at exactly (0, 0).
            7. Keep amount of objects spawned to 15 or under.

            --- OUTPUT FORMAT ---
            Output JSON ONLY array: [{"file": "name.glb", "x": 2.0, "z": -4.0, "rotate": 0}]

            USER REQUEST: "${userRequest}"`;
                }

                const result = await aiModel.generateContent(prompt);
                const rawText = result.response.text();
                console.log("Raw AI response:", rawText);
                const layout = JSON.parse(rawText.replace(/```json|```/g, "").trim());

                deselectObject();
                spawnedFurniture.forEach(obj => scene.remove(obj));
                spawnedFurniture.length = 0;

                for (const item of layout) {
                    await placeModel(item);
                }
            } catch (e) {
                console.error("AI Error:", e);
                const msg = e?.message || String(e);
                if (msg.includes('API_KEY') || msg.includes('403') || msg.includes('401')) {
                    alert(`API key error: ${msg}`);
                } else if (msg.includes('JSON') || msg.includes('parse') || msg.includes('SyntaxError')) {
                    alert(`JSON parse failed — check console for raw model output.\n\n${msg}`);
                } else {
                    alert(`AI Error: ${msg}`);
                }
            } finally {
                aiBtn.disabled = false;
                aiBtn.innerText = "Generate Layout";
            }
        }

        aiBtn.addEventListener('click', () => runGeneration(aiInput.value, true));

        if (autoPrompt && aiInput) {
            aiInput.value = autoPrompt;
            runGeneration(autoPrompt, false);
        }
    }

    // ── 8. EVENTS ──
    window.addEventListener('mousedown', (e) => {
        if (e.target !== renderer.domElement || transform.dragging) return;
        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(spawnedFurniture, true);
        if (hits.length > 0) {
            let root = hits[0].object;
            while (root.parent && !spawnedFurniture.includes(root)) root = root.parent;
            if (spawnedFurniture.includes(root)) selectObject(root);
        } else { deselectObject(); }
    });

    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'escape') deselectObject();
        if (!selectedObject) return;
        if (key === 'g') transform.setMode('translate');
        if (key === 'r') transform.setMode('rotate');
        if (key === 's') transform.setMode('scale');
    });

    function animate() {
        requestAnimationFrame(animate);
        orbit.update();
        renderer.render(scene, camera);
    }
    animate();
}

initApp();