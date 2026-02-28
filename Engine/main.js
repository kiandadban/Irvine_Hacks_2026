import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { initUI } from './ui.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

import { API_KEY } from './config.js'; // Import the key here
if (!API_KEY) {
    console.error("API_KEY missing! Check your .env file and ensure it starts with VITE_");
}

const furnitureLibrary = {
    "assets": [
        { "file": "Bed King.glb", "id": "bed" },
        { "file": "Bunk Bed.glb", "id": "bunk_bed" },
        { "file": "Couch Large.glb", "id": "sofa_large" },
        { "file": "Couch Medium.glb", "id": "sofa_medium" },
        { "file": "Desk.glb", "id": "desk" },
        { "file": "Night Stand.glb", "id": "nightstand" },
        { "file": "Bookcase with Books.glb", "id": "bookcase" },
        { "file": "Drawer.glb", "id": "drawer" }
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
scene.background = new THREE.Color(0xF0F0F0); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(6, 6, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const loader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let spawnedFurniture = []; 
let selectedObject = null;

// ── 3. HELPERS & LIGHTS ──
const grid = new THREE.GridHelper(10, 10, 0xCCCCCC, 0xE8E8E8);
grid.position.y = -0.01; 
scene.add(grid);

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 10, 7);
scene.add(sun);

// ── 4. CONTROLS ──
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;

const transform = new TransformControls(camera, renderer.domElement);
scene.add(transform);
transform.addEventListener('dragging-changed', (e) => orbit.enabled = !e.value);

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
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        model.scale.setScalar(2.5 / Math.max(size.x, size.y, size.z));

        model.position.set(config.x || 0, 0, config.z || 0);
        model.rotation.y = config.rotate || 0;

        scene.add(model);
        spawnedFurniture.push(model);
        selectObject(model);
    }, undefined, (err) => console.error("Load fail:", path, err));
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

// ── 7. UI LINKING ──
const ui = initUI(
    (type) => spawnPrimitive(type),
    (hex) => { if(selectedObject) selectedObject.traverse(n => n.isMesh && n.material.color.set(hex)) },
    () => { 
        if(selectedObject) {
            scene.remove(selectedObject);
            spawnedFurniture = spawnedFurniture.filter(o => o !== selectedObject);
            deselectObject();
        }
    },
    (path) => loadModel(path)
);

document.getElementById('add-btn').onclick = () => {
    const type = document.getElementById('shape-type').value;
    spawnPrimitive(type);
};

document.querySelectorAll('.model-load-btn').forEach(btn => {
    btn.onclick = () => loadModel(btn.dataset.path);
});

// AI Generation Handler
const aiBtn = document.getElementById('ai-generate-btn');
const aiInput = document.getElementById('ai-prompt');

if (aiBtn) {
    aiBtn.onclick = async () => {
        if (!aiModel) {
            alert("AI not initialized. Check API key in .env");
            return;
        }
        if (!aiInput.value || aiBtn.disabled) return;
        aiBtn.disabled = true;
        aiBtn.innerText = "Designing...";
        
        try {
            const prompt = `System: Interior Designer. Room: 10x10. Output ONLY JSON.
            Library: ${JSON.stringify(furnitureLibrary.assets)}
            Request: "${aiInput.value}"
            Format: [{"file":"name.glb","x":0,"z":0,"rotate":0}]`;

            const result = await aiModel.generateContent(prompt);
            const text = result.response.text().replace(/```json|```/g, "").trim();
            const layout = JSON.parse(text);

            deselectObject();
            spawnedFurniture.forEach(obj => scene.remove(obj));
            spawnedFurniture = [];

            layout.forEach(item => loadModel(`../furniture_models/${item.file}`, item));
        } catch (err) {
            console.error("AI Error:", err);
            alert("Rate limit or AI error.");
        } finally {
            setTimeout(() => {
                aiBtn.disabled = false;
                aiBtn.innerText = "Generate Layout";
            }, 5000);
        }
    };
}

// ── 8. SELECTION & MOUSE LOGIC ──

window.addEventListener('mousedown', (e) => {
    if (e.target !== renderer.domElement || transform.dragging) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const hitGizmo = intersects.some(i => {
            let n = i.object;
            while(n) {
                if(n.isTransformControls) return true;
                n = n.parent;
            }
            return false;
        });

        if (hitGizmo) return;

        const furnitureHit = intersects.find(i => {
            let candidate = i.object;
            while (candidate.parent && candidate.parent !== scene) {
                candidate = candidate.parent;
            }
            return spawnedFurniture.includes(candidate);
        });

        if (furnitureHit) {
            let root = furnitureHit.object;
            while (root.parent && root.parent !== scene) {
                root = root.parent;
            }
            selectObject(root);
        } else {
            deselectObject();
        }
    } else {
        deselectObject();
    }
});

// ── 9. KEYBOARD & TRANSFORM MODES ──

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (e.key === 'Escape') deselectObject();
    if (!selectedObject) return;

    if (key === 'g') transform.setMode('translate');
    if (key === 'r') transform.setMode('rotate'); 
    if (key === 's') transform.setMode('scale'); 
    if (key === 'l') transform.setSpace(transform.space === 'local' ? 'world' : 'local');
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