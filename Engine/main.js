import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { initUI } from './ui.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
// furniture attributes will be fetched at runtime instead of using import assertions
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY } from './config.js';

// ── MODULE IMPORTS ──
import { createRoom } from './walls.js';
import { CollisionEngine } from './collision.js';

if (!API_KEY) {
    console.error("API_KEY missing.");
}

// wrap initialization in async function so we can await fetching the JSON
async function initApp() {

    // ── 1. FURNITURE LIBRARY ──
    // will be filled after loading JSON file
    let furnitureLibrary;
    let assetMap;

    // convert a filename to a relative path under models
    function modelPath(filename) {
        const asset = assetMap[filename];
        if (asset) return `../models/${asset.category}/${asset.file}`;
        return `../models/${filename}`; // fallback
    }

    // dynamically populate the sidebar with all models
    function populateModelPanel() {
        const panel = document.getElementById('model-panel');
        if (!panel) return;
        panel.innerHTML = ''; // clear any hardcoded cards
        furnitureLibrary.assets.forEach(asset => {
            const card = document.createElement('div');
            card.className = 'model-card model-load-btn';
            card.dataset.path = modelPath(asset.file);
            const icon = document.createElement('div');
            icon.className = 'icon-box';
            icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4v16M2 8h20M22 4v16M2 17h20M6 8v9M18 8v9"/></svg>';
            const span = document.createElement('span');
            span.textContent = asset.name;
            card.appendChild(icon);
            card.appendChild(span);
            panel.appendChild(card);
        });
    }

    // fetch attributes file and build library
    try {
        const resp = await fetch('../furniture_models/furniture_attributes.json');
        const data = await resp.json();
        furnitureLibrary = {
            assets: data.furniture_library.map(item => ({
                file: item.file,
                name: item.name,
                category: item.category,
                id: item.name.toLowerCase().replace(/\s+/g, '_')
            }))
        };
    } catch (e) {
        console.error('Failed to load furniture attributes', e);
        furnitureLibrary = { assets: [] };
    }

    // build lookup map and populate panel
    assetMap = furnitureLibrary.assets.reduce((m, a) => { m[a.file] = a; return m; }, {});
    populateModelPanel();


// ── 2. INITIALIZATION ──
const container = document.getElementById('canvas-wrapper');
    if (!container) {
        console.error('canvas-wrapper element not found in DOM');
        return;        // abort initialization
    }

let genAI = null;
let aiModel = null;
if (API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
    aiModel = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x262018);

const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(8, 8, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const loader = new FBXLoader();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ── 3. ROOM & PHYSICS ──
const spawnedFurniture = [];
let selectedObject = null;
let roomWidth = 10;
let roomDepth = 10;

let { walls, floor: roomFloor } = createRoom(scene, roomWidth, roomDepth);
let currentWalls = walls;
const collisionEngine = new CollisionEngine(currentWalls, spawnedFurniture);

let grid = new THREE.GridHelper(roomWidth, roomWidth, 0xCCCCCC, 0x444444);
grid.scale.z = roomDepth / roomWidth;
grid.position.y = 0.01;
scene.add(grid);

function rebuildRoom(newWidth, newDepth) {
  // Remove old walls, floor, grid
  currentWalls.forEach(w => scene.remove(w));
  scene.remove(roomFloor);
  scene.remove(grid);

  roomWidth = newWidth;
  roomDepth = newDepth;

  const result = createRoom(scene, roomWidth, roomDepth);
  currentWalls = result.walls;
  roomFloor = result.floor;

  // Rebuild grid to match new size
  grid = new THREE.GridHelper(roomWidth, roomWidth, 0xCCCCCC, 0x444444);
  grid.scale.z = roomDepth / roomWidth;
  grid.position.y = 0.01;
  scene.add(grid);

  // Update collision engine with new walls
  collisionEngine.updateWalls(currentWalls);
}

// ── 4. LIGHTS ──
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

// ── 5. CONTROLS ──
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;

const transform = new TransformControls(camera, renderer.domElement);
scene.add(transform);

transform.addEventListener('change', () => {
    if (transform.object && transform.mode === 'translate') {
        const check = collisionEngine.checkCollision(transform.object);
        transform.object.traverse(n => {
            if (n.isMesh) {
                if (check.isColliding) {
                    n.material.emissive?.set(0xff0000);
                    n.material.emissiveIntensity = 0.5;
                } else {
                    n.material.emissive?.set(0x000000);
                }
            }
        });
    }
});

transform.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    if (!e.value) collisionEngine.updateObstacles();
});

// ── 6. SELECTION HELPERS ──
function selectObject(obj) {
    if (selectedObject === obj) return;
    selectedObject = obj;
    transform.attach(selectedObject);
    if (ui) ui.showProps(selectedObject);
}

function deselectObject() {
    selectedObject = null;
    transform.detach();
    if (ui) ui.hideProps();
}

// ── 7. CORE LOADING FUNCTIONS ──
function loadModel(path, config = {}) {
    return new Promise((resolve) => {
        loader.load(path, (fbx) => {
            // FBXLoader returns the model directly
            const model = fbx;

            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) model.scale.setScalar(2.5 / maxDim);

            model.position.set(config.x || 0, 0, config.z || 0);
            model.rotation.y = config.rotate || 0;
            model.updateMatrixWorld(true);

            scene.add(model);
            spawnedFurniture.push(model);
            collisionEngine.updateObstacles();
            selectObject(model);
            resolve(model);
        }, undefined, (err) => {
            console.error("Load error:", err);
            resolve(null);
        });
    });
}

// ── 8. UI HANDLERS ──
const ui = initUI(
    (type) => { /* primitive logic */ },
    (hex) => {
        if (selectedObject) {
            selectedObject.traverse(n => { if (n.isMesh) n.material.color.set(hex); });
        }
    },
    () => {
        if (selectedObject) {
            scene.remove(selectedObject);
            const idx = spawnedFurniture.indexOf(selectedObject);
            if (idx > -1) spawnedFurniture.splice(idx, 1);
            collisionEngine.updateObstacles();
            deselectObject();
        }
    },
    (path) => loadModel(path)
);

// ── 9. AI GENERATION ──
const aiBtn = document.getElementById('ai-generate-btn');
const aiInput = document.getElementById('ai-prompt');

// Slider wiring
const widthSlider  = document.getElementById('widthSlider');
const lengthSlider = document.getElementById('lengthSlider');
const wVal = document.getElementById('wVal');
const lVal = document.getElementById('lVal');

if (widthSlider) {
    widthSlider.addEventListener('input', () => {
        const v = parseFloat(widthSlider.value);
        wVal.textContent = v.toFixed(1);
        rebuildRoom(v, roomDepth);
    });
}
if (lengthSlider) {
    lengthSlider.addEventListener('input', () => {
        const v = parseFloat(lengthSlider.value);
        lVal.textContent = v.toFixed(1);
        rebuildRoom(roomWidth, v);
    });
}

// Auto-trigger generation when arriving from the front page
const autoPrompt = new URLSearchParams(window.location.search).get('prompt');

if (aiBtn) {
    aiBtn.onclick = async () => {
        if (!aiModel || !aiInput.value) return;
        aiBtn.disabled = true;
        aiBtn.innerText = "Simulating Physics...";

        try {
            // Inside aiBtn.onclick...
            const prompt = `
            ACT AS: Senior Interior Architect.
            ROOM: ${roomWidth}m x ${roomDepth}m. Bounds: X(-${roomWidth/2} to ${roomWidth/2}), Z(-${roomDepth/2} to ${roomDepth/2}).
            
            --- STRICT FILENAME MANIFEST ---
            You MUST ONLY use these exact filenames. Do not invent "bed_double" or "wardrobe":
            ${furnitureLibrary.assets.map(a => a.file).join(", ")}
          
            --- PLACEMENT RULES ---
            1. NO OVERLAP: Maintain at least 2m between all bounding boxes.
            2. BOUNDS: All items must stay within X(-${roomWidth/2} to ${roomWidth/2}) and Z(-${roomDepth/2} to ${roomDepth/2}).
            3. DOORS: If using a door, place it exactly at the edge (e.g., X=5 or Y=-5) and lay it flat
            4. DESK COMBO: If you place a "Desk.fbx", you MUST place a "Desk Chair.fbx" or "Desk Chair (2).fbx" directly next to it (within 0.8m).
            5. SLEEPING: Place beds with the headboard against a wall.
          
            --- OUTPUT FORMAT ---
            Output JSON ONLY array: [{"file": "Bed Double.fbx", "x": 2.0, "y": -4.0, "rotate": 0}]
            
            USER REQUEST: "${aiInput.value}"

  
`;
            const result = await aiModel.generateContent(prompt);
            const layout = JSON.parse(result.response.text().replace(/```json|```/g, ""));

            deselectObject();
            spawnedFurniture.forEach(obj => scene.remove(obj));
            spawnedFurniture.length = 0;

            for (const item of layout) {
                // resolve asset location using our map (category-aware)
                const path = modelPath(item.file);
                await loadModel(path, { x: item.x, z: item.z, rotate: item.rotate });
            }
        } catch (e) { console.error(e); }
        finally {
            aiBtn.disabled = false;
            aiBtn.innerText = "Generate Layout";
        }
    };

    // Typewriter auto-fill when arriving from the front page via ?prompt=
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
                        aiBtn.click();
                    }, 400);
                }
            }, 30);
        }, 600);
    }
}

// ── 10. FIXED MOUSE INTERACTION ──
window.addEventListener('mousedown', (e) => {
    // If the user clicked a button or UI element, don't try to select 3D objects
    if (e.target !== renderer.domElement || transform.dragging) return;

    // FIX: Calculate mouse position relative to the canvas-wrapper
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Check all objects in the spawnedFurniture array
    const hits = raycaster.intersectObjects(spawnedFurniture, true);

    if (hits.length > 0) {
        let clickedObject = hits[0].object;

        // FIND THE ROOT: Move up the parent chain until we find the object in spawnedFurniture
        let root = clickedObject;
        while (root.parent && !spawnedFurniture.includes(root)) {
            root = root.parent;
        }

        if (spawnedFurniture.includes(root)) {
            selectObject(root);
        }
    } else {
        deselectObject();
    }
});

// Shortcut keys
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

} // end initApp

initApp().catch(err => console.error('initApp error', err));