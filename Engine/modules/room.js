import * as THREE from 'three';
import { createRoom } from '../walls.js';

/**
 * Builds a 1m-cell LineSegments grid that exactly fits width x depth.
 */
export function makeGrid(width, depth) {
    const pts = [];
    const step = 1;
    for (let z = -depth / 2; z <= depth / 2 + 0.001; z += step) {
        pts.push(-width / 2, 0, z, width / 2, 0, z);
    }
    for (let x = -width / 2; x <= width / 2 + 0.001; x += step) {
        pts.push(x, 0, -depth / 2, x, 0, depth / 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mesh = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color: 0xaaaaaa })
    );
    mesh.position.y = 0.01;
    return mesh;
}

/**
 * Creates a room manager that handles walls, floor, and grid lifecycle.
 * @param {THREE.Scene} scene
 * @param {CollisionEngine} collisionEngine
 * @returns {{ roomWidth, roomDepth, currentWalls, roomFloor, rebuildRoom }}
 */
export function createRoomManager(scene, collisionEngine) {
    let roomWidth = 10;
    let roomDepth = 10;

    let { walls: currentWalls, floor: roomFloor } = createRoom(scene, roomWidth, roomDepth);
    collisionEngine.updateWalls(currentWalls, roomWidth, roomDepth);

    let grid = makeGrid(roomWidth, roomDepth);
    scene.add(grid);

    function rebuildRoom(newWidth, newDepth) {
        currentWalls.forEach(w => scene.remove(w));
        if (roomFloor) scene.remove(roomFloor);
        scene.remove(grid);

        roomWidth = newWidth;
        roomDepth = newDepth;

        const result = createRoom(scene, roomWidth, roomDepth);
        currentWalls = result.walls;
        roomFloor = result.floor;

        grid = makeGrid(roomWidth, roomDepth);
        scene.add(grid);

        collisionEngine.updateWalls(currentWalls, roomWidth, roomDepth);
    }

    // Wire sliders
    const widthSlider  = document.getElementById('widthSlider');
    const lengthSlider = document.getElementById('lengthSlider');
    const wValEl       = document.getElementById('wVal');
    const lValEl       = document.getElementById('lVal');

    if (widthSlider) {
        widthSlider.addEventListener('input', () => {
            roomWidth = parseFloat(widthSlider.value);
            if (wValEl) wValEl.textContent = roomWidth.toFixed(1);
            rebuildRoom(roomWidth, roomDepth);
        });
    }
    if (lengthSlider) {
        lengthSlider.addEventListener('input', () => {
            roomDepth = parseFloat(lengthSlider.value);
            if (lValEl) lValEl.textContent = roomDepth.toFixed(1);
            rebuildRoom(roomWidth, roomDepth);
        });
    }

    return {
        get roomWidth()    { return roomWidth; },
        get roomDepth()    { return roomDepth; },
        get currentWalls() { return currentWalls; },
        get roomFloor()    { return roomFloor; },
        rebuildRoom,
    };
}
