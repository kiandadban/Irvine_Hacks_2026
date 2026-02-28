import * as THREE from 'three';

// ── Scene ───────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080808);
scene.fog = new THREE.FogExp2(0x080808, 0.12);

// ── Camera ──────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1, 4);

// ── Renderer ────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ── Lights ───────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0x6699ff, 2.5);
keyLight.position.set(3, 5, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xff4422, 1.5, 8);
fillLight.position.set(-2, 1, -1);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x44ffcc, 1.0, 6);
rimLight.position.set(0, -2, -3);
scene.add(rimLight);

// ── Cube ────────────────────────────────────────────────
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({
  color: 0x222222,
  roughness: 0.2,
  metalness: 0.9,
});
const cube = new THREE.Mesh(geometry, material);
cube.castShadow = true;
cube.receiveShadow = true;
scene.add(cube);

// Wireframe overlay
const wireMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, wireframe: true, opacity: 0.15, transparent: true });
const wire = new THREE.Mesh(geometry, wireMat);
cube.add(wire);

// ── Ground plane ─────────────────────────────────────────
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.2;
ground.receiveShadow = true;
scene.add(ground);

// Grid
const grid = new THREE.GridHelper(20, 20, 0x222222, 0x181818);
grid.position.y = -1.19;
scene.add(grid);

// ── Simple orbit controls (manual) ───────────────────────
let isDragging = false, lastX = 0, lastY = 0;
let phi = Math.PI / 6, theta = 0, radius = 4;

renderer.domElement.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  theta -= (e.clientX - lastX) * 0.005;
  phi   -= (e.clientY - lastY) * 0.005;
  phi = Math.max(0.1, Math.min(Math.PI / 2, phi));
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('wheel', e => {
  radius = Math.max(2, Math.min(10, radius + e.deltaY * 0.01));
});

// ── Resize ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── Animate ──────────────────────────────────────────────
function animate(time) {
  requestAnimationFrame(animate);

  // Rotate cube
  cube.rotation.x = time / 3000;
  cube.rotation.y = time / 1500;

  // Pulse rim light
  rimLight.intensity = 0.8 + 0.6 * Math.sin(time / 800);

  // Orbit camera
  //camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
  //camera.position.y = radius * Math.sin(phi);
  //camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
  //camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);


    // Mouse

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const intersection = new THREE.Vector3();
  const offset = new THREE.Vector3();

  let dragging = false;
  let selected = null;

  // The plane always faces the camera, positioned at the object's world position
  function updateDragPlane(object) {
    const normal = camera.getWorldDirection(new THREE.Vector3());
    dragPlane.setFromNormalAndCoplanarPoint(normal, object.position);
  }

  function getMouseWorld(event) {
    mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(dragPlane, intersection);
    return intersection;
  }

  renderer.domElement.addEventListener('mousedown', (e) => {
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObject(cube);
    if (hits.length > 0) {
      selected = cube;
      dragging = true;
      updateDragPlane(selected);

      // Store offset so object doesn't snap to cursor center
      getMouseWorld(e);
      offset.copy(selected.position).sub(intersection);
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging || !selected) return;
    getMouseWorld(e);
    selected.position.copy(intersection.add(offset));
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    selected = null;
  });
}
requestAnimationFrame(animate);