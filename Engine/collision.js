import * as THREE from 'three';

export class CollisionEngine {
  constructor(walls, spawnedFurniture, roomWidth = 10, roomDepth = 10) {
    this.walls = walls; 
    this.furniture = spawnedFurniture;
    this.roomLimitX = roomWidth / 2;
    this.roomLimitZ = roomDepth / 2;
    
    // Pre-allocate objects to avoid Garbage Collection spikes
    this._movingBox = new THREE.Box3();
    this._targetBox = new THREE.Box3();
    this.wallBoxes = [];
    
    this.updateObstacles();
  }

  /**
   * Refreshes the bounding boxes for the walls. 
   * Call this if you change the room shape or wall positions.
   */
  updateObstacles() {
    this.wallBoxes = this.walls.map(wall => {
      wall.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(wall);
    });
  }

  updateWalls(newWalls, newRoomWidth, newRoomDepth) {
    this.walls = newWalls;
    this.roomLimitX = newRoomWidth / 2;
    this.roomLimitZ = newRoomDepth / 2;
    this.updateObstacles();
  }

  /**
   * @param {THREE.Object3D} movingObject - The object being moved/placed.
   * @returns {Object} Collision status and type.
   */
  checkCollision(movingObject) {
    // 1. Sync the object's world position
    movingObject.updateMatrixWorld(true);
    this._movingBox.setFromObject(movingObject);

    // 2. Room Boundary Check (The most reliable wall collision)
    // Checks if the object is poking outside the -5 to 5 range
    if (
      this._movingBox.min.x < -this.roomLimitX || 
      this._movingBox.max.x > this.roomLimitX ||
      this._movingBox.min.z < -this.roomLimitZ || 
      this._movingBox.max.z > this.roomLimitZ
    ) {
      return { isColliding: true, type: 'boundary' };
    }

    // 3. Wall Mesh Intersections
    for (const wallBox of this.wallBoxes) {
      if (this._movingBox.intersectsBox(wallBox)) {
        return { isColliding: true, type: 'wall' };
      }
    }

    // 4. Furniture Intersections
    for (const item of this.furniture) {
      // Skip self
      if (item === movingObject || item.uuid === movingObject.uuid) continue;

      // Ensure target world matrix is fresh
      item.updateMatrixWorld(true);
      this._targetBox.setFromObject(item);

      if (this._movingBox.intersectsBox(this._targetBox)) {
        return { isColliding: true, type: 'furniture' };
      }
    }

    return { isColliding: false };
  }
}