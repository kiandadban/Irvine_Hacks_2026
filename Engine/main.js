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
    
    let grid = new THREE.GridHelper(roomWidth, roomWidth, 0x444444, 0x222222);
    grid.scale.z = roomDepth / roomWidth;
    grid.position.y = 0.01;
    scene.add(grid);

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

        grid = new THREE.GridHelper(roomWidth, roomWidth, 0x444444, 0x222222);
        grid.scale.z = roomDepth / roomWidth;
        grid.position.y = 0.01;
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
                
                box.setFromObject(model);
                model.position.set(itemConfig.x || 0, -box.min.y, itemConfig.z || 0);
                model.rotation.y = itemConfig.rotate || 0;
                
                scene.add(model);
                spawnedFurniture.push(model);
                collisionEngine.updateObstacles();
                
                updateCollisionVisuals(model); // Initial check
                selectObject(model);
                resolve(model);
            });
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

    const genAI = new GoogleGenerativeAI(API_KEY);
    const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const aiBtn = document.getElementById('ai-generate-btn');
    const aiInput = document.getElementById('ai-prompt');

    if (aiBtn) {
        aiBtn.onclick = async () => {
            if (!aiInput.value || aiBtn.disabled) return;
            aiBtn.disabled = true;
            aiBtn.innerText = "Architecting...";

            try {
                const manifest = furnitureLibrary.map(item => item.file).join(", ");
                const prompt = `ACT AS: Interior Designer. 
                ROOM: ${roomWidth}m x ${roomDepth}m. Bounds: X(-${roomWidth/2} to ${roomWidth/2}), Z(-${roomDepth/2} to ${roomDepth/2}).
                TASK: Place 5-8 items for: "${aiInput.value}".
                LIST: ${manifest}.
                OUTPUT: JSON ONLY array. format: [{"file": "Bath.fbx", "x": 2, "z": -2, "rotate": 0}]`;

                const result = await aiModel.generateContent(prompt);
                const layout = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());

                deselectObject();
                spawnedFurniture.forEach(obj => scene.remove(obj));
                spawnedFurniture.length = 0;

                for (const item of layout) {
                    await placeModel(item);
                }
            } catch (e) { console.error("AI Error:", e); }
            finally {
                aiBtn.disabled = false;
                aiBtn.innerText = "Generate Layout";
            }
        };
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