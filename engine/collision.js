import * as THREE from 'three';

export class CollisionEngine {
  constructor(walls, spawnedFurniture, roomWidth = 10, roomDepth = 10) {
    // Accept group or array for walls, update limits accordingly
    this.walls = walls;
    this.furniture = spawnedFurniture;
    this.roomLimitX = roomWidth / 2;
    this.roomLimitZ = roomDepth / 2;

    // Pre-allocate for performance
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
    this.wallBoxes = this.walls
      .filter(wall => wall && typeof wall.updateMatrixWorld === 'function')
      .map(wall => {
          wall.updateMatrixWorld(true);
          return new THREE.Box3().setFromObject(wall);
      });
  }

  updateWalls(newWalls, newRoomWidth, newRoomDepth) {
    // Handle Group or Array input
    this.walls = newWalls.children ? newWalls.children : (Array.isArray(newWalls) ? newWalls : [newWalls]);
    this.roomLimitX = newRoomWidth / 2;
    this.roomLimitZ = newRoomDepth / 2;
    this.updateObstacles();
  }

  /**
   * @param {THREE.Object3D} movingObject - The object being moved/placed.
   * @returns {Object} Collision status, type, and colliding object reference.
   */
  checkCollision(movingObject) {
    if (!movingObject) return { isColliding: false, collider: null };

    movingObject.updateMatrixWorld(true);
    this._movingBox.setFromObject(movingObject);

    // 1. Boundary Check
    if (
      this._movingBox.min.x < -this.roomLimitX || 
      this._movingBox.max.x > this.roomLimitX ||
      this._movingBox.min.z < -this.roomLimitZ || 
      this._movingBox.max.z > this.roomLimitZ
    ) {
      return { isColliding: true, type: 'boundary', collider: null };
    }

    // 2. Wall Intersections
    for (const wallBox of this.wallBoxes) {
      if (this._movingBox.intersectsBox(wallBox)) {
        return { isColliding: true, type: 'wall', collider: null };
      }
    }

    // 3. Furniture Intersections
    for (const item of this.furniture) {
      if (item === movingObject || item.uuid === movingObject.uuid) continue;
      this._targetBox.setFromObject(item);
      if (this._movingBox.intersectsBox(this._targetBox)) {
        return { isColliding: true, type: 'furniture', collider: item };
      }
    }

    return { isColliding: false, collider: null };
  }
};