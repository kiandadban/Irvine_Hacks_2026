import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// ── Scene Setup ──
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3, 3, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// ── Lighting ──
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const light = new THREE.PointLight(0xffffff, 50);
light.position.set(5, 5, 5);
scene.add(light);

// ── The Cube ──
const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x00ff88 })
);
scene.add(cube);

const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
grid.position.y = -0.5;
scene.add(grid);

// ── Controls ──
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;

const transform = new TransformControls(camera, renderer.domElement);
transform.attach(cube);
scene.add(transform);

// Snapping
transform.translationSnap = 0.5;
transform.rotationSnap = THREE.MathUtils.degToRad(45);

// Essential: Disable camera movement when clicking the arrows
transform.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
});

// ── Interaction ──
window.addEventListener('keydown', (e) => {
    switch (e.key.toLowerCase()) {
        case 'g': transform.setMode('translate'); break;
        case 'r': transform.setMode('rotate'); break;
        case 's': transform.setMode('scale'); break;
        case 'l': transform.setSpace(transform.space === 'local' ? 'world' : 'local'); break;
        case 'x': 
            transform.translationSnap = transform.translationSnap ? null : 0.5;
            break;
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