import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { initUI } from './ui.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// ── 1. Scene Setup ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(5, 5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// ── 2. Lights & Helpers ──
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 7);
scene.add(light);

const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
grid.position.y = -0.5;
scene.add(grid);

// ── 3. Controls ──
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;

const transform = new TransformControls(camera, renderer.domElement);
scene.add(transform);

transform.addEventListener('dragging-changed', (event) => {
  orbit.enabled = !event.value;
});

// ── 4. UI Initialization (Defined outside listeners) ──
const ui = initUI(
    (type) => spawnObject(type), 
    (hex) => changeColor(hex),
    () => {
        // --- THIS IS THE ONDELETE FUNCTION ---
        if (selectedObject) {
            console.log("Engine: Removing object", selectedObject);
            
            // 1. Remove the gizmo from the object first
            transform.detach();
            
            // 2. Remove the object from the 3D world
            scene.remove(selectedObject);
            
            // 3. Clear the reference so we don't try to delete it again
            selectedObject = null;
            
            // 4. Hide the properties panel
            ui.hideProps();
        } else {
            console.warn("Engine: No object selected to delete");
        }
    },
    (path) => loadModel(path)
);

// ── 5. Selection & Raycasting ──
let selectedObject = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('mousedown', (event) => {
  // 1. Ignore clicks on HTML UI elements
  if (event.target !== renderer.domElement) return;

  // 2. Prevent selection changes while actively dragging the gizmo
  if (transform.dragging) return;

  // 3. Update mouse coordinates
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // 4. Perform Raycast
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  // 5. Look for a valid Mesh (excluding grid and gizmo)
  const hit = intersects.find(i => {
    let current = i.object;
    while (current.parent && current.parent !== scene) {
      current = current.parent;
    }
    return current !== grid && !current.isTransformControls;
  });

  if (hit) {
    // Find the root object (crucial for GLB groups)
    let rootObject = hit.object;
    while (rootObject.parent && rootObject.parent !== scene) {
      rootObject = rootObject.parent;
    }

    selectedObject = rootObject;
    transform.attach(selectedObject);
    ui.showProps(selectedObject);
  } else {
    // --- DESELECTION LOGIC ---

    // Check if we accidentally hit the gizmo handles (arrows/rings)
    const hitGizmo = intersects.find(i =>
      i.object.isTransformControls ||
      (i.object.parent && i.object.parent.isTransformControls)
    );

    // If we hit absolutely nothing, or anything that isn't the gizmo...
    if (!hitGizmo) {
      selectedObject = null;
      transform.detach(); // Remove the arrows
      ui.hideProps();     // Hide the side panel
    }
  }
});

// ── 6. Spawning Functions ──
function spawnObject(type) {
  let geo;
  if (type === 'box') geo = new THREE.BoxGeometry(1, 1, 1);
  else if (type === 'sphere') geo = new THREE.SphereGeometry(0.6, 32, 32);
  else geo = new THREE.ConeGeometry(0.6, 1, 32);

  const mat = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(Math.random() * 4 - 2, 0, Math.random() * 4 - 2);
  scene.add(mesh);

  selectedObject = mesh;
  transform.attach(mesh);
  ui.showProps(mesh);
}

function loadModel(path) {
  console.log("Loading model from:", path);

  loader.load(path, (gltf) => {
    const model = gltf.scene;

    // --- SCALE & CENTERING FIX ---
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Rescale the model so it's roughly 2 units big
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = 2 / maxDim;
      model.scale.setScalar(scale);
    }

    // Center the model's geometry so the arrows appear in the middle
    model.position.x = -center.x * model.scale.x;
    model.position.z = -center.z * model.scale.z;
    model.position.y = 0; // Sit on the grid

    scene.add(model);

    // --- SELECTION ---
    selectedObject = model;
    transform.attach(model);
    ui.showProps(model);

    console.log("Model successfully added to scene.");
  },
    (xhr) => {
      console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    (error) => {
      console.error("FAILED TO LOAD. Check if the file exists at: " + path, error);
    });
}
// ── 7. Interaction & Loop ──
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'g') transform.setMode('translate');
  if (e.key.toLowerCase() === 'r') transform.setMode('rotate');
  if (e.key.toLowerCase() === 's') transform.setMode('scale');
  
  if (e.key === 'Escape') {
        selectedObject = null;
        transform.detach();
        ui.hideProps();
    }
});


function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();