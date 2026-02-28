import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { initUI } from './ui.js';

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
scene.add(transform); // REQUIRED: Must be added to scene to work

// The "Secret Sauce": Stop camera from moving when dragging arrows
transform.addEventListener('dragging-changed', (event) => {
    orbit.enabled = !event.value;
});

// ── 4. Selection & Raycasting ──
let selectedObject = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Initialize UI
const ui = initUI(
    (type) => spawnObject(type), 
    (hex) => { if(selectedObject) selectedObject.material.color.set(hex); },
    () => { 
        if(selectedObject) {
            const target = selectedObject;
            transform.detach();
            scene.remove(target);
            selectedObject = null;
        }
    }
);

window.addEventListener('mousedown', (event) => {
    // BUG FIX 1: If we are clicking on the UI panels, don't raycast
    if (event.target !== renderer.domElement) return;

    // BUG FIX 2: If the TransformControls are already being dragged, don't change selection
    if (transform.dragging) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    // Filter out the grid and the TransformControls handles
    const hit = intersects.find(i => 
        i.object.type === 'Mesh' && 
        i.object !== grid && 
        !i.object.isTransformControls && 
        !i.object.parent.isTransformControls
    );

    if (hit) {
        selectedObject = hit.object;
        transform.attach(selectedObject);
        ui.showProps(selectedObject);
    } else {
        // Only deselect if we clicked "empty air" (not a gizmo handle)
        // TransformControls handles are children of the transform object
        const hitGizmo = intersects.find(i => i.object.isTransformControls || i.object.parent.isTransformControls);
        if (!hitGizmo) {
            selectedObject = null;
            transform.detach();
            ui.hideProps();
        }
    }
});

// ── 5. Spawning ──
function spawnObject(type) {
    let geo;
    if (type === 'box') geo = new THREE.BoxGeometry(1, 1, 1);
    else if (type === 'sphere') geo = new THREE.SphereGeometry(0.6, 32, 32);
    else geo = new THREE.ConeGeometry(0.6, 1, 32);

    const mat = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
    const mesh = new THREE.Mesh(geo, mat);
    
    // Position it on the grid
    mesh.position.set(Math.random() * 4 - 2, 0, Math.random() * 4 - 2);
    scene.add(mesh);
    
    // Auto-select
    selectedObject = mesh;
    transform.attach(mesh);
    ui.showProps(mesh);
}

// ── 6. Keyboard Shortcuts ──
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'g') transform.setMode('translate');
    if (e.key.toLowerCase() === 'r') transform.setMode('rotate');
    if (e.key.toLowerCase() === 's') transform.setMode('scale');
});

// ── 7. Main Loop ──
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