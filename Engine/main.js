import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { initUI } from './ui.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY } from './config.js';

// ── NEW IMPORTS ──
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

const urlParams = new URLSearchParams(window.location.search);
const autoPrompt = urlParams.get('prompt');

if (autoPrompt && aiModel) {
    aiInput.value = autoPrompt;
    aiBtn.click(); // triggers the existing AI handler
}


// ── 2. INITIALIZATION ──
let genAI = null;
let aiModel = null;

if (API_KEY) {
  genAI = new GoogleGenerativeAI(API_KEY);
  aiModel = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xFDFBF7);

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

// ── 3. WALLS & PHYSICS SETUP ──
// Use 'const' for the array so the reference never changes
const spawnedFurniture = []; 
let selectedObject = null;

const roomWidth = 10;
const roomDepth = 10;
const walls = createRoom(scene, roomWidth, roomDepth); 

// Initialize collision engine
const collisionEngine = new CollisionEngine(walls, spawnedFurniture);

// ── 4. HELPERS & LIGHTS ──
const grid = new THREE.GridHelper(10, 10, 0xCCCCCC, 0xE8E8E8);
grid.position.y = -0.01;
scene.add(grid);

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

// COLLISION DETECTION DURING MANUAL DRAG
transform.addEventListener('change', () => {
  if (transform.object && transform.mode === 'translate') {
    const check = collisionEngine.checkCollision(transform.object);
    
    // Visual feedback: Tint red if colliding with WALLS or OTHER FURNITURE
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
  // Update collision engine when drag stops
  if (!e.value) {
    collisionEngine.updateObstacles();
  }
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

// ── 7. CORE ENGINE FUNCTIONS ──
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

    model.position.set(config.x || 0, 0, config.z || 0);
    model.rotation.y = config.rotate || 0;
    model.updateMatrixWorld(true);

    scene.add(model);
    spawnedFurniture.push(model); // Engine is automatically watching this array
    
    collisionEngine.updateObstacles(); 
    selectObject(model);
  }, undefined, (err) => console.error("Failed to load model:", path, err));
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
  collisionEngine.updateObstacles();
  selectObject(mesh);
}

// ── 8. UI LINKING & HANDLERS ──
const ui = initUI(
  (type) => spawnPrimitive(type),
  (hex) => {
    if (selectedObject) {
      selectedObject.traverse(n => {
        if (n.isMesh) n.material.color.set(hex);
      });
    }
  },
  () => {
    if (selectedObject) {
      scene.remove(selectedObject);
      // FIX: Use splice to keep the array reference same for CollisionEngine
      const index = spawnedFurniture.indexOf(selectedObject);
      if (index > -1) spawnedFurniture.splice(index, 1);
      
      collisionEngine.updateObstacles();
      deselectObject();
    }
  },
  (path) => loadModel(path)
);

// AI Generation Handler
const aiBtn = document.getElementById('ai-generate-btn');
const aiInput = document.getElementById('ai-prompt');

if (aiBtn) {
  aiBtn.onclick = async () => {
    if (!aiModel) return alert("AI Key not found.");
    if (!aiInput.value || aiBtn.disabled) return;

    aiBtn.disabled = true;
    aiBtn.innerText = "Calculating Space...";

    try {
      const prompt = `
                ACT AS: A Senior Interior CAD Architect.
                ROOM: 10m x 10m. Bounds: X(-5 to 5), Z(-5 to 5).
                FURNITURE DATA: ${JSON.stringify(furnitureLibrary.assets)}
                RULES: Output ONLY a JSON array: [{"file": "name.glb", "x": 0.0, "z": 0.0, "rotate": 0.0}]
                USER REQUEST: "${aiInput.value}"
            `;

      const result = await aiModel.generateContent(prompt);
      let responseText = result.response.text().replace(/```json|```/g, "").trim();
      const layout = JSON.parse(responseText);

      // Clear current scene
      deselectObject();
      spawnedFurniture.forEach(obj => scene.remove(obj));
      
      // FIX: Use length = 0 to clear array without losing reference
      spawnedFurniture.length = 0; 

      layout.forEach(item => {
        const path = `../furniture_models/${item.file}`;
        loadModel(path, { x: item.x, z: item.z, rotate: item.rotate });
      });

    } catch (err) {
      console.error("AI Error:", err);
    } finally {
      aiBtn.disabled = false;
      aiBtn.innerText = "Generate Layout";
    }
  };
}

// ── 9. MOUSE & KBD INTERACTION ──
window.addEventListener('mousedown', (e) => {
  if (e.target !== renderer.domElement || transform.dragging) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  
  const intersects = raycaster.intersectObjects(spawnedFurniture, true);
  if (intersects.length > 0) {
    let root = intersects[0].object;
    while (root.parent && root.parent !== scene) root = root.parent;
    selectObject(root);
  } else {
    deselectObject();
  }
});

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