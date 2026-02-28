import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { initUI } from './ui.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

import { API_KEY } from './config.js'; 
if (!API_KEY) {
    console.error("API_KEY missing! Check your config.js file.");
}

// ── 1. COMPLETE FURNITURE LIBRARY ──
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
let genAI = null;
let aiModel = null;

if (API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
    aiModel = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" }); 
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFDFBF7); // Cream background matching your CSS

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(8, 8, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const loader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let spawnedFurniture = []; 
let selectedObject = null;

// ── 3. HELPERS & LIGHTS ──
const grid = new THREE.GridHelper(20, 20, 0xCCCCCC, 0xE8E8E8);
grid.position.y = -0.01; 
scene.add(grid);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

// ── 4. CONTROLS ──
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;

const transform = new TransformControls(camera, renderer.domElement);
scene.add(transform);

// Prevent orbit moving while using transform gizmos
transform.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
});

// ── 5. SELECTION HELPERS ──
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

// ── 6. CORE ENGINE FUNCTIONS ──
function loadModel(path, config = {}) {
    loader.load(path, (gltf) => {
        const model = gltf.scene;
        
        // Normalize size
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            model.scale.setScalar(2.5 / maxDim);
        }

        // Set Position and Rotation
        model.position.set(config.x || 0, 0, config.z || 0);
        model.rotation.y = config.rotate || 0;

        scene.add(model);
        spawnedFurniture.push(model);
        selectObject(model);
    }, undefined, (err) => console.error("Failed to load model at:", path, err));
}

function spawnPrimitive(type) {
    const geo = type === 'box' ? new THREE.BoxGeometry(1, 1, 1) : 
                type === 'sphere' ? new THREE.SphereGeometry(0.7, 32, 32) : 
                new THREE.ConeGeometry(0.7, 1.2, 32);
    
    const mat = new THREE.MeshStandardMaterial({ color: 0x2C4C3B }); 
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.random() * 2, 0.5, Math.random() * 2);
    
    scene.add(mesh);
    spawnedFurniture.push(mesh);
    selectObject(mesh);
}

// ── 7. UI LINKING & HANDLERS ──
const ui = initUI(
    (type) => spawnPrimitive(type),
    (hex) => { 
        if(selectedObject) {
            selectedObject.traverse(n => {
                if(n.isMesh) n.material.color.set(hex);
            });
        }
    },
    () => { 
        if(selectedObject) {
            scene.remove(selectedObject);
            spawnedFurniture = spawnedFurniture.filter(o => o !== selectedObject);
            deselectObject();
        }
    },
    (path) => loadModel(path)
);

// Manual Load Buttons (uses dataset.path from HTML)
document.querySelectorAll('.model-load-btn').forEach(btn => {
    btn.onclick = () => loadModel(btn.dataset.path);
});

// AI Generation Handler
const aiBtn = document.getElementById('ai-generate-btn');
const aiInput = document.getElementById('ai-prompt');

if (aiBtn) {
    aiBtn.onclick = async () => {
        if (!aiModel) return alert("AI Key not found.");
        if (!aiInput.value || aiBtn.disabled) return;

        aiBtn.disabled = true;
        aiBtn.innerText = "Designing...";
        
        try {
            const prompt = `System: Expert Interior Designer. 
            Room Size: 10x10.
            Asset Library: ${JSON.stringify(furnitureLibrary.assets)}
            User Request: "${aiInput.value}"
            
            Task: Arrange the room. Provide a valid JSON array of objects. 
            Rules: Coordinates (x, z) should be between -4 and 4. Rotation is in Radians.
            Format: [{"file":"filename.glb","x":0,"z":0,"rotate":0}]`;

            const result = await aiModel.generateContent(prompt);
            const responseText = result.response.text().replace(/```json|```/g, "").trim();
            const layout = JSON.parse(responseText);

            // Clear Scene
            deselectObject();
            spawnedFurniture.forEach(obj => scene.remove(obj));
            spawnedFurniture = [];

            // Spawn AI Layout
            layout.forEach(item => {
                const path = `../furniture_models/${item.file}`;
                loadModel(path, item);
            });

        } catch (err) {
            console.error("AI Generation Error:", err);
            alert("The AI had trouble generating that layout. Try a simpler prompt.");
        } finally {
            aiBtn.disabled = false;
            aiBtn.innerText = "Generate Layout";
        }
    };
}

// ── 8. MOUSE INTERACTION ──
window.addEventListener('mousedown', (e) => {
    if (e.target !== renderer.domElement || transform.dragging) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        // Check if we hit a transform gizmo first
        const isGizmo = intersects.some(i => {
            let n = i.object;
            while(n) { if(n.isTransformControls) return true; n = n.parent; }
            return false;
        });
        if (isGizmo) return;

        // Find the root furniture object
        const furnitureHit = intersects.find(i => {
            let n = i.object;
            while(n.parent && n.parent !== scene) n = n.parent;
            return spawnedFurniture.includes(n);
        });

        if (furnitureHit) {
            let root = furnitureHit.object;
            while (root.parent && root.parent !== scene) root = root.parent;
            selectObject(root);
        } else {
            deselectObject();
        }
    } else {
        deselectObject();
    }
});

// ── 9. KEYBOARD SHORTCUTS ──
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (e.key === 'Escape') deselectObject();
    if (!selectedObject) return;

    if (key === 'g') transform.setMode('translate');
    if (key === 'r') transform.setMode('rotate'); 
    if (key === 's') transform.setMode('scale'); 
});

// ── 10. RENDER LOOP ──
function animate() {
    requestAnimationFrame(animate);
    orbit.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});