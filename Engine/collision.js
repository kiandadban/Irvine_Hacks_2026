import * as THREE from 'three';

export class CollisionEngine {
  constructor(walls, spawnedFurniture) {
    this.walls = walls; 
    this.furniture = spawnedFurniture; // This must be the SAME array used in main.js
    this.wallBoxes = [];
    this.updateObstacles();
  }

  updateObstacles() {
    this.wallBoxes = [];
    this.walls.forEach(wall => {
      this.wallBoxes.push(new THREE.Box3().setFromObject(wall));
    });
  }

  checkCollision(movingObject) {
    // 1. Force update the moving object AND all its children
    movingObject.updateMatrixWorld(true);
    const movingBox = new THREE.Box3().setFromObject(movingObject);

    // 2. Check Walls
    for (let wallBox of this.wallBoxes) {
      if (movingBox.intersectsBox(wallBox)) return { isColliding: true, type: 'wall' };
    }

    // 3. Check Other Furniture
    for (let item of this.furniture) {
      // Check UUID to be 100% sure we aren't colliding with ourselves
      if (item === movingObject || item.uuid === movingObject.uuid) continue;

      // Force update the other item's position in the world
      item.updateMatrixWorld(true);
      const itemBox = new THREE.Box3().setFromObject(item);

      if (movingBox.intersectsBox(itemBox)) {
        return { isColliding: true, type: 'furniture' };
      }
    }

    return { isColliding: false };
  }
}