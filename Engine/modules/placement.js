import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const loader = new FBXLoader();

/**
 * Creates a placement system for loading and positioning furniture models.
 *
 * @param {THREE.Scene}       scene
 * @param {THREE.Object3D[]}  spawnedFurniture  - shared mutable array
 * @param {CollisionEngine}   collisionEngine
 * @param {Object}            assetMap          - filename → asset record
 * @param {Object}            roomManager       - { roomWidth, roomDepth, roomFloor }
 * @param {Function}          selectObject
 * @param {Function}          updateCollisionVisuals
 * @returns {{ placeModel(itemConfig): Promise<THREE.Object3D|null> }}
 */
export function createPlacer(
    scene, spawnedFurniture, collisionEngine,
    assetMap, roomManager, selectObject, updateCollisionVisuals
) {
    async function placeModel(itemConfig) {
        const asset = assetMap[itemConfig.file];
        if (!asset) {
            console.warn(`[Placer] Unknown asset: "${itemConfig.file}"`);
            return null;
        }

        const path = `../models/${asset.category}/${asset.file}`;

        return new Promise((resolve) => {
            loader.load(path, (model) => {
                // Scale to declared physical width
                const rawBox  = new THREE.Box3().setFromObject(model);
                const rawSize = rawBox.getSize(new THREE.Vector3());
                const targetW = asset.dimensions?.width ?? 1.0;
                if (rawSize.x > 0) model.scale.setScalar(targetW / rawSize.x);

                model.rotation.y = itemConfig.rotate ?? 0;

                // Physics nudge: find a collision-free spot
                const snap    = 0.5;
                const halfW   = roomManager.roomWidth  / 2 - 0.5;
                const halfD   = roomManager.roomDepth  / 2 - 0.5;
                let posX      = itemConfig.x ?? 0;
                let posZ      = itemConfig.z ?? 0;
                let isValid   = false;
                let attempts  = 0;

                while (!isValid && attempts < 15) {
                    const testX = Math.round(posX / snap) * snap;
                    const testZ = Math.round(posZ / snap) * snap;

                    model.position.set(testX, 0, testZ);
                    model.updateMatrixWorld(true);

                    // Snap to floor surface
                    const worldBox = new THREE.Box3().setFromObject(model);
                    const floorY   = roomManager.roomFloor?.position.y ?? 0;
                    model.position.y = floorY - worldBox.min.y;
                    model.updateMatrixWorld(true);

                    if (!collisionEngine.checkCollision(model).isColliding) {
                        isValid = true;
                    } else {
                        posX += (Math.random() - 0.5) * 1.5;
                        posZ += (Math.random() - 0.5) * 1.5;
                        posX = Math.max(-halfW, Math.min(halfW, posX));
                        posZ = Math.max(-halfD, Math.min(halfD, posZ));
                        attempts++;
                    }
                }

                if (isValid) {
                    // Final snap
                    model.position.x = Math.round(model.position.x / snap) * snap;
                    model.position.z = Math.round(model.position.z / snap) * snap;
                    const finalBox = new THREE.Box3().setFromObject(model);
                    model.position.y = (roomManager.roomFloor?.position.y ?? 0) - finalBox.min.y;

                    scene.add(model);
                    spawnedFurniture.push(model);
                    collisionEngine.updateObstacles();
                    updateCollisionVisuals(model);
                    selectObject(model);
                }

                resolve(isValid ? model : null);
            }, undefined, (err) => {
                console.error(`[Placer] Failed to load "${path}"`, err);
                resolve(null);
            });
        });
    }

    return { placeModel };
}
