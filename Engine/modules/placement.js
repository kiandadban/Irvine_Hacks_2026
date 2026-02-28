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

                // 1. PHYSICAL SCALING & ROTATION
                const rawBox = new THREE.Box3().setFromObject(model);
                const rawSize = rawBox.getSize(new THREE.Vector3());
                const targetW = asset.dimensions?.width ?? 1.0;
                if (rawSize.x > 0) model.scale.setScalar(targetW / rawSize.x);
                model.rotation.y = itemConfig.rotate ?? 0;

                // 2. PRECISION SURFACE DETECTION
                let targetY = 0; 
                // Reduced from 0.8 to 0.1 (10cm) for strict precision
                const PRECISION_TOLERANCE = 0.1; 

                if (asset.placeable) {
                    let bestSurface = null;
                    const surfaceCategories = ['Tables', 'Drawers', 'Shelves', 'Electronics'];

                    spawnedFurniture.forEach(f => {
                        const fAttrs = f.userData.attributes;
                        if (fAttrs.placeable || !surfaceCategories.includes(fAttrs.category)) return;

                        // Create a bounding box for the surface item
                        const fBox = new THREE.Box3().setFromObject(f);
                        
                        // Check if the coordinate is WITHIN the furniture's horizontal area
                        // We add a tiny 10cm "padding" so it doesn't have to be pixel-perfect
                        const isOver = (
                            itemConfig.x >= (fBox.min.x - PRECISION_TOLERANCE) &&
                            itemConfig.x <= (fBox.max.x + PRECISION_TOLERANCE) &&
                            itemConfig.z >= (fBox.min.z - PRECISION_TOLERANCE) &&
                            itemConfig.z <= (fBox.max.z + PRECISION_TOLERANCE)
                        );

                        if (isOver) {
                            // If multiple surfaces overlap, pick the highest one (stacking logic)
                            if (!bestSurface || fBox.max.y > bestSurface.max.y) {
                                bestSurface = { obj: f, max: fBox.max.y };
                            }
                        }
                    });

                    if (bestSurface) {
                        targetY = bestSurface.max; 
                    } else {
                        // If not over furniture, place on floor
                        targetY = 0; 
                    }
                }

                // 3. APPLY POSITION WITH PIVOT CORRECTION
                model.position.set(itemConfig.x, 0, itemConfig.z);
                model.updateMatrixWorld(true);

                const currentBox = new THREE.Box3().setFromObject(model);
                const bottomOffset = currentBox.min.y - model.position.y;
                
                const floorLevel = roomManager.roomFloor?.position.y ?? 0;
                model.position.y = (floorLevel + targetY) - bottomOffset;
                model.updateMatrixWorld(true);

                // 4. PHYSICS VALIDATION
                const check = collisionEngine.checkCollision(model);
                let isBlocked = check.isColliding;

                // Only allow overlap with the "Base" furniture, not other placeable items
                if (asset.placeable) {
                    // Check if we hit another small object
                    if (check.collider?.userData?.attributes?.placeable) {
                        isBlocked = true;
                    } else {
                        isBlocked = false;
                    }
                }

                if (!isBlocked) {
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