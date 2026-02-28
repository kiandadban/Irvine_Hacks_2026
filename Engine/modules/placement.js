import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const loader = new FBXLoader();

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
                // 1. Attach metadata for the UI
                model.userData.attributes = asset; 

                // 2. Initial Scaling
                const rawBox  = new THREE.Box3().setFromObject(model);
                const rawSize = rawBox.getSize(new THREE.Vector3());
                const targetW = asset.dimensions?.width ?? 1.0;
                if (rawSize.x > 0) model.scale.setScalar(targetW / rawSize.x);

                model.rotation.y = itemConfig.rotate ?? 0;

                // 3. Positioning & Stacking Logic
                const snap    = 0.5;
                const halfW   = roomManager.roomWidth  / 2 - 0.5;
                const halfD   = roomManager.roomDepth  / 2 - 0.5;
                
                // Use AI-provided coordinates
                let posX      = itemConfig.x ?? 0;
                let posZ      = itemConfig.z ?? 0;
                let targetY   = itemConfig.y ?? 0; // AI now provides the stacking height
                
                let isValid   = false;
                let attempts  = 0;

                // [Image of a 3D bounding box surrounding a mesh with X, Y, and Z dimension labels]

                while (!isValid && attempts < 15) {
                    const testX = Math.round(posX / snap) * snap;
                    const testZ = Math.round(posZ / snap) * snap;

                    // Set horizontal position
                    model.position.set(testX, 0, testZ);
                    model.updateMatrixWorld(true);

                    // 4. THE GROUNDING FIX: 
                    // Calculate current bounding box to find the bottom pivot
                    const currentBox = new THREE.Box3().setFromObject(model);
                    const floorLevel = roomManager.roomFloor?.position.y ?? 0;
                    
                    // Logic: Move model to (Floor + AI Height) then subtract the model's own bottom offset
                    // This ensures y=0 is the floor, and y=0.75 is exactly the desk surface.
                    const bottomOffset = currentBox.min.y - model.position.y;
                    model.position.y = (floorLevel + targetY) - bottomOffset;
                    
                    model.updateMatrixWorld(true);

                    // Check for collisions
                    if (!collisionEngine.checkCollision(model).isColliding) {
                        isValid = true;
                    } else {
                        // Nudge if clipping
                        posX += (Math.random() - 0.5) * 1.0;
                        posZ += (Math.random() - 0.5) * 1.0;
                        posX = Math.max(-halfW, Math.min(halfW, posX));
                        posZ = Math.max(-halfD, Math.min(halfD, posZ));
                        attempts++;
                    }
                }

                // [Image of 3D model pivot point adjustment from center to base]

                if (isValid) {
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