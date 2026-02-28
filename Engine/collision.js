import * as THREE from 'three';

export class CollisionEngine {
  constructor(walls, furnitureArray) {
    this.walls = walls; // Array of meshes from walls.js
    this.furniture = furnitureArray; // Reference to spawnedFurniture in main.js
    this.obstacles = [];
    this.updateObstacles();
  }

  /**
   * Refreshes the internal list of bounding boxes for all static obstacles.
   */
  updateObstacles() {
    this.obstacles = [];
    
    // Add walls to obstacles
    this.walls.forEach(wall => {
      const box = new THREE.Box3().setFromObject(wall);
      this.obstacles.push(box);
    });

    // Add other furniture (excluding the one currently being moved)
    // Note: In a real-time drag, we filter the "active" object out inside checkCollision
  }

  /**
   * Checks if a specific object is hitting walls or other furniture.
   * @param {THREE.Object3D} movingObject 
   * @returns {Object} { isColliding: boolean, collidedWith: object }
   */
  checkCollision(movingObject) {
    movingObject.updateMatrixWorld(true);
    const movingBox = new THREE.Box3().setFromObject(movingObject);

    // 1. Check against Walls
    for (let wallBox of this.obstacles) {
      if (movingBox.intersectsBox(wallBox)) {
        return { isColliding: true, type: 'wall' };
      }
    }

    // 2. Check against other Furniture
    for (let item of this.furniture) {
      if (item === movingObject) continue; // Don't collide with self

      const itemBox = new THREE.Box3().setFromObject(item);
      if (movingBox.intersectsBox(itemBox)) {
        return { isColliding: true, type: 'furniture' };
      }
    }

    return { isColliding: false };
  }
}