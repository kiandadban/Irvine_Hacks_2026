import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const loader = new FBXLoader();

export function createPlacer(
    scene, spawnedFurniture, collisionEngine,
    assetMap, roomManager, selectObject, updateCollisionVisuals
) {
    async function placeModel(itemConfig) {
        const asset = assetMap[itemConfig.file];
        if (!asset) return null;

        const path = `../models/${asset.category}/${asset.file}`;

        return new Promise((resolve) => {
            loader.load(path, (model) => {
                model.userData.attributes = asset; 

                // 1. Scaling
                const rawBox = new THREE.Box3().setFromObject(model);
                const rawSize = rawBox.getSize(new THREE.Vector3());
                const targetW = asset.dimensions?.width ?? 1.0;
                if (rawSize.x > 0) model.scale.setScalar(targetW / rawSize.x);
                model.rotation.y = itemConfig.rotate ?? 0;

                // 2. SURFACE DETECTION WITH TOLERANCE
                let targetY = itemConfig.y ?? 0;
                const TOLERANCE = 0.6; // Allow the item to snap to furniture within 60cm

                if (asset.placeable) {
                    // Find the best supporting furniture nearby
                    let bestSurface = null;
                    let minDistance = TOLERANCE;

                    spawnedFurniture.forEach(f => {
                        const fAttrs = f.userData.attributes;
                        if (fAttrs.placeable) return; // Ignore other small items

                        const fBox = new THREE.Box3().setFromObject(f);
                        const center = fBox.getCenter(new THREE.Vector3());
                        
                        // Calculate horizontal distance from AI point to furniture center
                        const dist = new THREE.Vector2(itemConfig.x, itemConfig.z)
                                        .distanceTo(new THREE.Vector2(center.x, center.z));

                        if (dist < minDistance) {
                            minDistance = dist;
                            bestSurface = f;
                        }
                    });

                    if (bestSurface) {
                        const sBox = new THREE.Box3().setFromObject(bestSurface);
                        targetY = sBox.max.y; 
                        // Snap the item's X/Z slightly toward the surface center if it's hanging off
                        // (Optional: keeps things looking centered on the desk)
                    } else if (targetY === 0) {
                        // If no surface is found nearby and Y is 0, we give it a default "Table Height" 
                        // rather than rejecting it, just in case.
                        targetY = 0.75; 
                        console.warn(`[Placer] ${asset.name} found no surface, using default height.`);
                    }
                }

                // 3. Grounding Math
                model.position.set(itemConfig.x, 0, itemConfig.z);
                model.updateMatrixWorld(true);
                const currentBox = new THREE.Box3().setFromObject(model);
                const bottomOffset = currentBox.min.y - model.position.y;
                
                const floorLevel = roomManager.roomFloor?.position.y ?? 0;
                model.position.y = (floorLevel + targetY) - bottomOffset;
                model.updateMatrixWorld(true);

                // 4. Collision Softening
                const check = collisionEngine.checkCollision(model);
                let collisionDetected = check.isColliding;

                // If it's a placeable item, we effectively ignore collisions 
                // so it doesn't get "nudged" off the desk by the desk itself.
                if (asset.placeable) collisionDetected = false;

                if (!collisionDetected) {
                    scene.add(model);
                    spawnedFurniture.push(model);
                    collisionEngine.updateObstacles();
                    updateCollisionVisuals(model);
                    selectObject(model);
                    resolve(model);
                } else {
                    resolve(null);
                }
            }, undefined, (err) => resolve(null));
        });
    }

    return { placeModel };
}