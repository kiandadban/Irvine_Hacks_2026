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

const urlParams = new URLSearchParams(window.location.search);
const autoPrompt = urlParams.get('prompt');

if (autoPrompt && aiModel) {
    aiInput.value = autoPrompt;
    aiBtn.click(); // triggers the existing AI handler
}


// ── 2. INITIALIZATION ──
// Get the specific container for the 3D view
const container = document.getElementById('canvas-wrapper');

let genAI = null;
let aiModel = null;

if (API_KEY) {
  genAI = new GoogleGenerativeAI(API_KEY);
  aiModel = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x262018); // Matching your new dark aesthetic

// Calculate aspect ratio based on the container, not the window
const camera = new THREE.PerspectiveCamera(
    75, 
    container.clientWidth / container.clientHeight, 
    0.1, 
    100
);
camera.position.set(8, 8, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
// Set size to fit the container
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;

// Append the canvas to the WRAPPER, not the body
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

const grid = new THREE.GridHelper(roomWidth, 10, 0xCCCCCC, 0xE8E8E8);
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
    });
  });
}

// ── 8. UI HANDLERS ──
const ui = initUI(
  (type) => { /* spawnPrimitive Logic */ },
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

// ── 9. AI GENERATION WITH COLLISION PREVENTION ──
const aiBtn = document.getElementById('ai-generate-btn');
const aiInput = document.getElementById('ai-prompt');

if (aiBtn) {
  aiBtn.onclick = async () => {
    if (!aiModel || !aiInput.value) return;
    aiBtn.disabled = true;
    aiBtn.innerText = "Simulating Physics...";

    try {
      const prompt = `
        ACT AS: Senior Interior Architect.
        ROOM: 10m x 10m. Coordinates: -5 to 5 on X and Z.
        ASSETS: ${JSON.stringify(furnitureLibrary.assets)}
        TASK: Layout furniture based on: "${aiInput.value}". 
        RULES: 
        1. Give items space (approx 2m apart). 
        2. Don't place items at exactly (0,0). 
        3. Output JSON ONLY: [{"file": "name.glb", "x": 1.2, "z": -2.5, "rotate": 1.57}]
      `;

      const result = await aiModel.generateContent(prompt);
      const layout = JSON.parse(result.response.text().replace(/```json|```/g, ""));

      // Clean scene
      deselectObject();
      spawnedFurniture.forEach(obj => scene.remove(obj));
      spawnedFurniture.length = 0; 

      // Sequential placement with Nudge logic
      for (const item of layout) {
        const path = `../furniture_models/${item.file}`;
        
        await new Promise((resolve) => {
          loader.load(path, (gltf) => {
            const model = gltf.scene;
            
            // Normalize Size
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) model.scale.setScalar(2.5 / maxDim);
            
            model.rotation.y = item.rotate || 0;

            // Collision Check & Nudge
            let posX = item.x;
            let posZ = item.z;
            let valid = false;
            let tries = 0;

            while (!valid && tries < 10) {
              model.position.set(posX, 0, posZ);
              model.updateMatrixWorld(true);
              
              const check = collisionEngine.checkCollision(model);
              if (!check.isColliding) {
                valid = true;
              } else {
                // Nudge random direction if collision found
                posX += (Math.random() - 0.5) * 1.0;
                posZ += (Math.random() - 0.5) * 1.0;
                tries++;
              }
            }

            scene.add(model);
            spawnedFurniture.push(model);
            collisionEngine.updateObstacles();
            resolve();
          });
        });
      }
    } catch (e) {
      console.error("AI Error:", e);
    } finally {
      aiBtn.disabled = false;
      aiBtn.innerText = "Generate Layout";
    }
  };
}

// ── 10. MOUSE INTERACTION & LOOP ──
window.addEventListener('mousedown', (e) => {
  if (e.target !== renderer.domElement || transform.dragging) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(spawnedFurniture, true);
  if (hits.length > 0) {
    let root = hits[0].object;
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
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  renderer.setSize(width, height);
});