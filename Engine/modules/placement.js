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
                    // Logic: Only place on reasonable surfaces. Use original folder (fAttrs.folder)
                    const allowedFolders = ['tables', 'drawers', 'shelves', 'electronics', 'sofas', 'cupboard', 'kitchen', 'desks'];
                    const SNAP_TOLERANCE = 2.5; // expanded search radius (meters)
                    const MAX_FALLBACK_DISTANCE = 5.0; // increased fallback radius

                    let bestSurface = null;
                    let minDistance = SNAP_TOLERANCE;

                    spawnedFurniture.forEach(f => {
                        const fAttrs = f.userData.attributes;
                        if (fAttrs.placeable) return; // skip other small accessories

                        // Check both folder and category fields for surface type
                        const fFolder = (fAttrs.folder || fAttrs.category || '').toString().toLowerCase();
                        const isSurface = allowedFolders.some(sf => fFolder.includes(sf));
                        
                        if (!isSurface) return;

                        const fBox = new THREE.Box3().setFromObject(f);
                        const fCenter = fBox.getCenter(new THREE.Vector3());

                        // horizontal distance to the surface center
                        const dist = new THREE.Vector2(posX, posZ).distanceTo(new THREE.Vector2(fCenter.x, fCenter.z));

                        if (dist < minDistance) {
                            minDistance = dist;
                            bestSurface = f;
                        }
                    });

                    // If no close surface found, try a nearest-surface fallback
                    if (!bestSurface) {
                        let fallback = null;
                        let bestDist = MAX_FALLBACK_DISTANCE;
                        spawnedFurniture.forEach(f => {
                            const fAttrs = f.userData.attributes;
                            if (fAttrs.placeable) return;
                            const fFolder = (fAttrs.folder || fAttrs.category || '').toString().toLowerCase();
                            const isSurface = allowedFolders.some(sf => fFolder.includes(sf));
                            if (!isSurface) return;

                            const fBox = new THREE.Box3().setFromObject(f);
                            // compute closest point on box to the desired pos
                            const cx = Math.max(fBox.min.x, Math.min(posX, fBox.max.x));
                            const cz = Math.max(fBox.min.z, Math.min(posZ, fBox.max.z));
                            const dist = new THREE.Vector2(posX, posZ).distanceTo(new THREE.Vector2(cx, cz));
                            if (dist < bestDist) { bestDist = dist; fallback = f; }
                        });
                        if (fallback) {
                            bestSurface = fallback;
                            console.debug('[Placer] Using fallback surface for', asset.name, 'at distance', bestDist);
                        }
                    }

                    if (bestSurface) {
                        const sBox = new THREE.Box3().setFromObject(bestSurface);
                        const sCenter = sBox.getCenter(new THREE.Vector3());

                        targetY = sBox.max.y; // Snap to top mesh
                        
                        // Snap coordinates to a sensible point on the surface (center)
                        posX = sCenter.x;
                        posZ = sCenter.z;
                        
                        // Inherit rotation
                        model.rotation.y = bestSurface.rotation.y;
                    } else {
                        // No suitable surface found; log which surfaces are available
                        const availableSurfaces = spawnedFurniture
                            .filter(f => !f.userData.attributes.placeable)
                            .map(f => f.userData.attributes.name || 'Unknown')
                            .join(', ');
                        console.warn(`[Placer] No surface found for ${asset.name}. Available surfaces: ${availableSurfaces || 'none'}. Placing on floor.`);
                        targetY = 0;
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