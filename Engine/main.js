import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { initUI } from './ui.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY } from './config.js';

// ── MODULE IMPORTS ──
import { createRoom } from './walls.js';
import { CollisionEngine } from './collision.js';

async function initApp() {
    // ── 1. STATE & LIBRARY ──
    let furnitureLibrary;
    let assetMap;
    const spawnedFurniture = [];
    let selectedObject = null;
    const roomSize = 10;

    const modelPath = (filename) => {
        const asset = assetMap[filename];
        return asset ? `../models/${asset.category}/${asset.file}` : `../models/${filename}`;
    };

    try {
        const resp = await fetch('../furniture_models/furniture_attributes.json');
        const data = await resp.json();
        furnitureLibrary = {
            assets: data.furniture_library.map(item => ({
                file: item.file,
                name: item.name,
                category: item.category
            }))
        };
        assetMap = furnitureLibrary.assets.reduce((m, a) => { m[a.file] = a; return m; }, {});
    } catch (e) {
        console.error('Failed to load library', e);
        furnitureLibrary = { assets: [] };
    }

    // ── 2. SCENE SETUP ──
    const container = document.getElementById('canvas-wrapper');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x262018);

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(8, 8, 8);

    const walls = createRoom(scene, roomSize, roomSize);
    const collisionEngine = new CollisionEngine(walls, spawnedFurniture, roomSize);
    scene.add(new THREE.GridHelper(roomSize, 10, 0xCCCCCC, 0x444444));

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(10, 20, 10);
    scene.add(sun);

    const loader = new FBXLoader();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // ── 3. CONTROLS & SELECTION ──
    const orbit = new OrbitControls(camera, renderer.domElement);
    const transform = new TransformControls(camera, renderer.domElement);
    scene.add(transform);

    const selectObject = (obj) => {
        if (selectedObject === obj) return;
        selectedObject = obj;
        transform.attach(selectedObject);
        if (ui) ui.showProps(selectedObject);
    };

    const deselectObject = () => {
        selectedObject = null;
        transform.detach();
        if (ui) ui.hideProps();
    };

    // ── 4. MATERIAL & COLLISION VISUALS ──
    const updateCollisionVisuals = (obj) => {
        const check = collisionEngine.checkCollision(obj);
        obj.traverse(child => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    if (check.isColliding) {
                        if (mat.emissive) {
                            mat.emissive.set(0xff0000);
                            mat.emissiveIntensity = 0.6;
                        }
                        mat.color.set(0xffaaaa); // Tint red
                    } else {
                        if (mat.emissive) {
                            mat.emissive.set(0x000000);
                            mat.emissiveIntensity = 0;
                        }
                        mat.color.set(0xffffff); // Reset
                    }
                });
            }
        });
    };

    transform.addEventListener('change', () => {
        if (transform.object && transform.mode === 'translate') {
            updateCollisionVisuals(transform.object);
        }
    });

    transform.addEventListener('dragging-changed', (e) => {
        orbit.enabled = !e.value;
        if (!e.value) {
            collisionEngine.updateObstacles();
            if (transform.object) updateCollisionVisuals(transform.object);
        }
    });

    // ── 5. CORE LOADING WITH NUDGE LOGIC ──
    async function placeModel(item) {
        const path = modelPath(item.file);
        return new Promise((resolve) => {
            loader.load(path, (fbx) => {
                const model = fbx;
                
                // Scale normalization
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                if (maxDim > 0) model.scale.setScalar(2.5 / maxDim);
                
                model.rotation.y = item.rotate || 0;

                // Physics Nudge: Try to find a legal spot
                let posX = item.x, posZ = item.z;
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
                        posX = Math.max(-4.5, Math.min(4.5, posX));
                        posZ = Math.max(-4.5, Math.min(4.5, posZ));
                        attempts++;
                    }
                }

                if (isValid) {
                    scene.add(model);
                    spawnedFurniture.push(model);
                    collisionEngine.updateObstacles();
                }
                resolve();
            }, undefined, () => resolve());
        });
    }

    // ── 6. UI & AI INTEGRATION ──
    const ui = initUI(() => {}, (hex) => {
        if (selectedObject) selectedObject.traverse(n => { if (n.isMesh) n.material.color.set(hex); });
    }, () => {
        if (selectedObject) {
            scene.remove(selectedObject);
            spawnedFurniture.splice(spawnedFurniture.indexOf(selectedObject), 1);
            collisionEngine.updateObstacles();
            deselectObject();
        }
    }, (path) => placeModel({ file: path.split('/').pop(), x: 0, z: 0 }));

    const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
    const aiModel = genAI?.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const aiBtn = document.getElementById('ai-generate-btn');
    const aiInput = document.getElementById('ai-prompt');

    if (aiBtn) {
        aiBtn.onclick = async () => {
            if (!aiModel || !aiInput.value) return;
            aiBtn.disabled = true;
            aiBtn.innerText = "Architect is thinking...";

            try {
                const prompt = `
            ACT AS: Senior Interior Architect.
            ROOM: 10m x 10m. Bounds: X(-5 to 5), Z(-5 to 5).
            
            --- STRICT FILENAME MANIFEST ---
            You MUST ONLY use these exact filenames. Do not invent "bed_double" or "wardrobe":
            ${furnitureLibrary.assets.map(a => a.file).join(", ")}
          
            --- PLACEMENT RULES ---
            1. NO OVERLAP: Maintain at least 2m between all bounding boxes.
            2. BOUNDS: All items must stay within X(-5 to 5) and Z(-5 to 5).
            3. DOORS: If using a door, place it exactly at the edge (e.g., X=5 or Z=-5) and lay it flat
            4. DESK COMBO: If you place a "Desk.fbx", you MUST place a "Desk Chair.fbx" or "Desk Chair (2).fbx" directly next to it (within 0.8m).
            5. SLEEPING: Place beds with the headboard against a wall.
            6. Don't place objects at exactly (0, 0)
            7. Keep amount of objects spawned to 15 or under
          
            --- OUTPUT FORMAT ---
            Output JSON ONLY array: [{"file": "Bed Double.fbx", "x": 2.0, "z": -4.0, "rotate": 0}]
            
            USER REQUEST: "${aiInput.value}"`;

                const result = await aiModel.generateContent(prompt);
                const layout = JSON.parse(result.response.text().replace(/```json|```/g, ""));

                // Clear scene
                deselectObject();
                spawnedFurniture.forEach(obj => scene.remove(obj));
                spawnedFurniture.length = 0;
                collisionEngine.updateObstacles();

                // Sequential placement ensures items don't stack
                for (const item of layout) {
                    await placeModel(item);
                }
            } catch (e) {
                console.error("AI Error:", e);
                alert("AI hit a limit or failed to parse. Try again in a moment.");
            } finally {
                aiBtn.disabled = false;
                aiBtn.innerText = "Generate Layout";
            }
        };
    }

    // ── 7. INTERACTION LOOP ──
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
        } else {
            deselectObject();
        }
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

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

initApp();