import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { initUI } from './ui.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY } from './config.js';

// ── MODULE IMPORTS ──
import { createRoom } from './walls.js';
import { CollisionEngine } from './collision.js';

if (!API_KEY) {
    console.error("API_KEY missing! Check your config.js file.");
}

// ── 1. FURNITURE LIBRARY ──
const furnitureLibrary = {
    "assets": [
        { "file": "Bed King.glb", "id": "king_bed", "category": "sleeping" },
        { "file": "Bed Twin Old.glb", "id": "twin_bed", "category": "sleeping" },
        { "file": "Bunk Bed.glb", "id": "bunk_bed", "category": "sleeping" },
        { "file": "Couch Large.glb", "id": "sofa_large", "category": "seating" },
        { "file": "Couch Medium.glb", "id": "sofa_medium", "category": "seating" },
        { "file": "Armchair.glb", "id": "armchair", "category": "seating" },
        { "file": "Desk.glb", "id": "desk", "category": "workspace" },
        { "file": "Desk Chair.glb", "id": "chair_standard", "category": "workspace_seating" },
        { "file": "Desk Chair (2).glb", "id": "chair_exec", "category": "workspace_seating" },
        { "file": "Bookcase with Books.glb", "id": "bookcase", "category": "storage" },
        { "file": "Drawer.glb", "id": "drawer", "category": "storage" },
        { "file": "Dining Set.glb", "id": "dining_set", "category": "dining" },
        { "file": "Kitchen.glb", "id": "kitchen", "category": "cooking" },
        { "file": "Night Stand.glb", "id": "nightstand", "category": "accessory" },
        { "file": "Futuristic Shelf.glb", "id": "shelf_future", "category": "decor" },
        { "file": "Door_brown.glb", "id": "door_brown", "category": "architectural" },
        { "file": "Door_white.glb", "id": "door_white", "category": "architectural" }
    ]
};

// ── 2. INITIALIZATION ──
const container = document.getElementById('canvas-wrapper');

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

const loader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ── 3. ROOM & PHYSICS ──
const spawnedFurniture = [];
let selectedObject = null;
const roomWidth = 10;
const roomDepth = 10;

const walls = createRoom(scene, roomWidth, roomDepth);
const collisionEngine = new CollisionEngine(walls, spawnedFurniture);

const grid = new THREE.GridHelper(roomWidth, 10, 0xCCCCCC, 0x444444);
grid.position.y = 0.01;
scene.add(grid);

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
        loader.load(path, (gltf) => {
            const model = gltf.scene;

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

if (aiBtn) {
    aiBtn.onclick = async () => {
        if (!aiModel || !aiInput.value) return;
        aiBtn.disabled = true;
        aiBtn.innerText = "Simulating Physics...";

        try {
            // Inside aiBtn.onclick...
            const prompt = `
            ACT AS: Senior Interior Architect.
            ROOM: 10m x 10m. Bounds: X(-5 to 5), Y(-5 to 5).
            
            --- STRICT FILENAME MANIFEST ---
            You MUST ONLY use these exact filenames. Do not invent "bed_double" or "wardrobe":
            ${furnitureLibrary.assets.map(a => a.file).join(", ")}
          
            --- PLACEMENT RULES ---
            1. NO OVERLAP: Maintain at least 2m between all bounding boxes.
            2. BOUNDS: All items must stay within X(-5 to 5) and Y(-5 to 5).
            3. DOORS: If using a door, place it exactly at the edge (e.g., X=5 or Y=-5) and lay it flat
            4. DESK COMBO: If you place a "Desk.glb", you MUST place a "Desk Chair.glb" or "Desk Chair (2).glb" directly next to it (within 0.8m).
            5. SLEEPING: Place beds with the headboard against a wall.
          
            --- OUTPUT FORMAT ---
            Output JSON ONLY array: [{"file": "Bed King.glb", "x": 2.0, "y": -4.0, "rotate": 0}]
            
            USER REQUEST: "${aiInput.value}"

  
`;
            const result = await aiModel.generateContent(prompt);
            const layout = JSON.parse(result.response.text().replace(/```json|```/g, ""));

            deselectObject();
            spawnedFurniture.forEach(obj => scene.remove(obj));
            spawnedFurniture.length = 0;

            for (const item of layout) {
                // Path adjusted to your folder structure
                const path = `../furniture_models/${item.file}`;
                await loadModel(path, { x: item.x, z: item.z, rotate: item.rotate });
            }
        } catch (e) { console.error(e); }
        finally {
            aiBtn.disabled = false;
            aiBtn.innerText = "Generate Layout";
        }
    };
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