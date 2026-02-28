import * as THREE from 'three';

export function createRoom(scene, width, depth) {
  const wallGroup = [];
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  
  // Floor
  const floorGeo = new THREE.PlaneGeometry(width, depth);
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Simple Wall logic (just 4 boxes)
  const wallHeight = 2.5;
  const data = [
    { w: width, d: 0.1, x: 0, z: -depth/2 }, // Back
    { w: width, d: 0.1, x: 0, z: depth/2 },  // Front
    { w: 0.1, d: depth, x: -width/2, z: 0 }, // Left
    { w: 0.1, d: depth, x: width/2, z: 0 },  // Right
  ];

  data.forEach(dim => {
    const geo = new THREE.BoxGeometry(dim.w, wallHeight, dim.d);
    const wall = new THREE.Mesh(geo, wallMat);
    wall.position.set(dim.x, wallHeight/2, dim.z);
    scene.add(wall);
    wallGroup.push(wall);
  });

  return { walls: wallGroup, floor };
}