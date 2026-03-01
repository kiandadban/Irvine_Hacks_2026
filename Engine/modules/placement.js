import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const loader = new FBXLoader();
// Simple in-memory cache for loaded FBX scenes. Keyed by asset.file
const modelCache = new Map();

export function createPlacer(
    scene, spawnedFurniture, collisionEngine,
    assetMap, roomManager, selectObject, updateCollisionVisuals
) {
    async function placeModel(itemConfig) {
        // tolerant lookup: allow keys produced by AI that may differ in case/extension
        const asset = assetMap.find ? assetMap.find(itemConfig.file) : assetMap[itemConfig.file];
        if (!asset) {
            console.warn('[Placer] asset not found for', itemConfig.file);
            return null;
        }

        const path = asset.url || `../models/${encodeURIComponent(asset.folder || asset.category)}/${encodeURIComponent(asset.file)}`;

        return new Promise((resolve) => {
            // If we've loaded this model before, clone and return immediately
            if (modelCache.has(asset.file)) {
                try {
                    const cached = modelCache.get(asset.file);
                    const clone = cached.clone(true);
                    clone.userData = { ...cached.userData };
                    clone.userData.attributes = asset;
                    // finalize clone placement
                    finalizeAndAdd(clone, asset, itemConfig, resolve);
                    return;
                } catch (err) {
                    // fallthrough to fresh load on clone errors
                    console.warn('[Placer] failed to clone cached model', asset.file, err);
                }
            }

            loader.load(path, (model) => {
                // cache a deep clone (original loaded root) for reuse
                try { modelCache.set(asset.file, model.clone(true)); } catch (e) { /* cache best-effort */ }
                model.userData.attributes = asset;

                // 1. PHYSICAL SCALING & ROTATION
                const rawBox = new THREE.Box3().setFromObject(model);
                const rawSize = rawBox.getSize(new THREE.Vector3());
                const targetW = asset.dimensions?.width ?? 1.0;
                if (rawSize.x > 0) model.scale.setScalar(targetW / rawSize.x);
                model.rotation.y = itemConfig.rotate ?? 0;

                // 2. AESTHETIC SURFACE DETECTION
                let targetY = 0; 
                let posX = itemConfig.x;
                let posZ = itemConfig.z;

                if (asset.placeable) {
                    // Logic: Only place on items that make sense (no keyboards on bathtubs)
                    const surfaceCategories = ['Tables', 'Drawers', 'Shelves', 'Electronics'];
                    const SNAP_TOLERANCE = 0.5; // 50cm search radius

                    let bestSurface = null;
                    let minDistance = SNAP_TOLERANCE;

                    spawnedFurniture.forEach(f => {
                        const fAttrs = f.userData.attributes;
                        if (fAttrs.placeable || !surfaceCategories.includes(fAttrs.category)) return;

                        const fBox = new THREE.Box3().setFromObject(f);
                        const fCenter = fBox.getCenter(new THREE.Vector3());
                        
                        // Check horizontal distance to the surface center
                        const dist = new THREE.Vector2(posX, posZ).distanceTo(new THREE.Vector2(fCenter.x, fCenter.z));

                        if (dist < minDistance) {
                            minDistance = dist;
                            bestSurface = f;
                        }
                    });

                    if (bestSurface) {
                        const sBox = new THREE.Box3().setFromObject(bestSurface);
                        const sCenter = sBox.getCenter(new THREE.Vector3());

                        targetY = sBox.max.y; // Snap to top mesh
                        
                        // AESTHETIC FIX: Snap coordinates to the center of the surface
                        // This prevents items from hanging off the edges due to sloppy AI math
                        posX = sCenter.x;
                        posZ = sCenter.z;
                        
                        // Inherit rotation: If the desk is turned, the monitor turns with it
                        model.rotation.y = bestSurface.rotation.y;
                    } else {
                        // If it's placeable but no surface is found, skip it to prevent floor clutter
                        console.warn(`[Placer] Skipping ${asset.name}: No logical surface found.`);
                        resolve(null);
                        return;
                    }
                }

                // attach computed targetY so finalize can access it
                model.userData.targetY = targetY;
                model.userData._posX = posX;
                model.userData._posZ = posZ;

                // finalize and add
                finalizeAndAdd(model, asset, itemConfig, resolve);
            }, undefined, (err) => {
                console.error('[Placer] failed to load', path, err);
                resolve(null);
            });
        });
    }

    // Helper used for both freshly loaded and cloned models
    function finalizeAndAdd(model, asset, itemConfig, resolve) {
        // prefer computed snapped coordinates if present
        const posX = model.userData._posX ?? itemConfig.x;
        const posZ = model.userData._posZ ?? itemConfig.z;

        // 3. APPLY POSITION WITH PIVOT CORRECTION
        model.position.set(posX, 0, posZ);
        model.updateMatrixWorld(true);

        const currentBox = new THREE.Box3().setFromObject(model);
        const bottomOffset = currentBox.min.y - model.position.y;
        
        const floorLevel = roomManager.roomFloor?.position.y ?? 0;
        const targetY = model.userData?.targetY ?? 0;
        model.position.y = (floorLevel + targetY) - bottomOffset;
        model.updateMatrixWorld(true);

        // 4. PHYSICS VALIDATION
        const check = collisionEngine.checkCollision(model);
        let isBlocked = check.isColliding;

        // For accessories, we ignore the collision with the table beneath them
        if (asset.placeable && isBlocked) {
            const hitObj = check.collider;
            if (hitObj?.userData?.attributes?.placeable === false) {
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
    }

    return { placeModel };
}