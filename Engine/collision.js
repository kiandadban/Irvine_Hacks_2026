import * as THREE from 'three';

export class CollisionEngine {
    constructor(walls, spawnedFurniture, roomWidth = 10, roomDepth = 10) {
        this.updateWalls(walls, roomWidth, roomDepth);
        this.furniture = spawnedFurniture;
        
        this._movingBox = new THREE.Box3();
        this._targetBox = new THREE.Box3();
        this.wallBoxes = [];
        
        this.updateObstacles();
    }

    /**
     * Updates the physical boundaries of the room.
     */
    updateWalls(newWalls, newRoomWidth, newRoomDepth) {
        // Handle Group or Array input
        this.walls = newWalls.children ? newWalls.children : (Array.isArray(newWalls) ? newWalls : [newWalls]);
        this.roomLimitX = newRoomWidth / 2;
        this.roomLimitZ = newRoomDepth / 2;
        this.updateObstacles();
    }

    updateObstacles() {
        // Filter out non-Object3D items to prevent crashes
        this.wallBoxes = this.walls
            .filter(wall => wall && typeof wall.updateMatrixWorld === 'function')
            .map(wall => {
                wall.updateMatrixWorld(true);
                return new THREE.Box3().setFromObject(wall);
            });
    }

    checkCollision(movingObject) {
        if (!movingObject) return { isColliding: false };
        
        movingObject.updateMatrixWorld(true);
        this._movingBox.setFromObject(movingObject);

        // 1. Boundary Check (Dynamic based on Slider values)
        if (
            this._movingBox.min.x < -this.roomLimitX || 
            this._movingBox.max.x > this.roomLimitX ||
            this._movingBox.min.z < -this.roomLimitZ || 
            this._movingBox.max.z > this.roomLimitZ
        ) {
            return { isColliding: true, type: 'boundary' };
        }

        // 2. Wall Intersections
        for (const wallBox of this.wallBoxes) {
            if (this._movingBox.intersectsBox(wallBox)) {
                return { isColliding: true, type: 'wall' };
            }
        }

        // 3. Furniture Intersections
        for (const item of this.furniture) {
            if (item === movingObject || item.uuid === movingObject.uuid) continue;
            this._targetBox.setFromObject(item);
            if (this._movingBox.intersectsBox(this._targetBox)) {
                return { isColliding: true, type: 'furniture' };
            }
        }

        return { isColliding: false };
    }
}