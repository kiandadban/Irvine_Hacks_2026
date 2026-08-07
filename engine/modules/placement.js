import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { SpatialRules } from './spatialRules.js';

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

        // Helper: compute placement for a loaded model (sets userData.targetY/_posX/_posZ/_baseSurface)
        function computePlacementForModel(model) {
            model.userData.attributes = asset;
            // 1. PHYSICAL SCALING & ROTATION
            const rawBox = new THREE.Box3().setFromObject(model);
            const rawSize = rawBox.getSize(new THREE.Vector3());
            const targetW = asset.dimensions?.width ?? 1.0;
            const scaleMultiplier = asset.scale ?? 1.0;
            if (rawSize.x > 0) model.scale.setScalar((targetW / rawSize.x) * scaleMultiplier);
            model.rotation.y = itemConfig.rotate ?? 0;

            // 2. WALL SNAPPING FOR SHELVES & CUPBOARDS
            let posX = (typeof itemConfig.x === 'number') ? itemConfig.x : 0;
            let posZ = (typeof itemConfig.z === 'number') ? itemConfig.z : 0;
            const isWallFurniture = (asset.file || '').toLowerCase().includes('shelf') || 
                                    (asset.file || '').toLowerCase().includes('cupboard');
            
            if (isWallFurniture) {
                const rw = roomManager.roomWidth || 10;
                const rd = roomManager.roomDepth || 10;
                const hw = rw / 2;
                const hd = rd / 2;
                const absX = Math.abs(posX);
                const absZ = Math.abs(posZ);
                
                // Snap to nearest wall
                if (absX > absZ) {
                    // Snap to left or right wall
                    posX = posX < 0 ? -hw : hw;
                } else {
                    // Snap to front or back wall
                    posZ = posZ < 0 ? -hd : hd;
                }
            }

            // 3. SURFACE DETECTION FOR PLACEABLES
            let targetY = 0;
            model.userData._baseSurface = null;

            // Windows and doors should NEVER snap to surfaces; they stay on floor against walls
            const isWindowOrDoor = (asset.file || '').toLowerCase().includes('window') || 
                                   (asset.file || '').toLowerCase().includes('door');

            if (asset.placeable && !isWindowOrDoor) {
                const allowedKeywords = ['table', 'tables', 'desk', 'desks', 'drawer', 'drawers', 'console', 'cabinet', 'cupboard', 'counter'];
                const SNAP_TOLERANCE = 3.0; // meters
                const MAX_FALLBACK_DISTANCE = 6.0;

                // prefer surfaces that already contain the desired x,z
                let candidateSurface = null;
                let candidateDist = SNAP_TOLERANCE;

                for (const f of spawnedFurniture) {
                    const fAttrs = f.userData.attributes || {};
                    if (fAttrs.placeable) continue;
                    const key = (fAttrs.folder || fAttrs.category || fAttrs.name || '').toString().toLowerCase();
                    const isSurface = allowedKeywords.some(k => key.includes(k));
                    if (!isSurface) continue;

                    const fBox = new THREE.Box3().setFromObject(f);
                    // if desired point lies over the surface bounds, choose it immediately
                    if (posX >= fBox.min.x && posX <= fBox.max.x && posZ >= fBox.min.z && posZ <= fBox.max.z) {
                        candidateSurface = f;
                        candidateDist = 0;
                        break;
                    }

                    // otherwise consider center distance
                    const fCenter = fBox.getCenter(new THREE.Vector3());
                    const dist = new THREE.Vector2(posX, posZ).distanceTo(new THREE.Vector2(fCenter.x, fCenter.z));
                    if (dist < candidateDist) { candidateDist = dist; candidateSurface = f; }
                }

                // fallback: choose nearest surface by box distance
                if (!candidateSurface) {
                    let best = null; let bestD = MAX_FALLBACK_DISTANCE;
                    for (const f of spawnedFurniture) {
                        const fAttrs = f.userData.attributes || {};
                        if (fAttrs.placeable) continue;
                        const key = (fAttrs.folder || fAttrs.category || fAttrs.name || '').toString().toLowerCase();
                        const isSurface = allowedKeywords.some(k => key.includes(k));
                        if (!isSurface) continue;
                        const fBox = new THREE.Box3().setFromObject(f);
                        const cx = Math.max(fBox.min.x, Math.min(posX, fBox.max.x));
                        const cz = Math.max(fBox.min.z, Math.min(posZ, fBox.max.z));
                        const dist = new THREE.Vector2(posX, posZ).distanceTo(new THREE.Vector2(cx, cz));
                        if (dist < bestD) { bestD = dist; best = f; }
                    }
                    if (best) { 
                        candidateSurface = best; 
                        console.debug('[Placer] fallback surface chosen for', asset.name, '@ distance', bestD.toFixed(2), 'surface:', best.userData.attributes?.name);
                    } else {
                        console.debug('[Placer] NO surfaces found for', asset.name, '— available furniture:', spawnedFurniture.map(f => f.userData.attributes?.name || 'unknown').join(', '));
                    }
                }

                if (candidateSurface) {
                    const sBox = new THREE.Box3().setFromObject(candidateSurface);
                    // snap onto surface top; choose a point inside surface box (clamp desired position)
                    const cx = Math.max(sBox.min.x + 0.05, Math.min(posX, sBox.max.x - 0.05));
                    const cz = Math.max(sBox.min.z + 0.05, Math.min(posZ, sBox.max.z - 0.05));
                    posX = cx; posZ = cz;
                    targetY = sBox.max.y;
                    model.rotation.y = candidateSurface.rotation.y;
                    model.userData._baseSurface = candidateSurface;
                    console.debug('[Placer] snapped', asset.name, 'onto', candidateSurface.userData.attributes?.name, '@ height', targetY.toFixed(2));
                } else {
                    console.warn('[Placer] No surface found for', asset.name, '— placing on floor');
                    targetY = 0;
                }
            }

            // 4. CUPBOARD HEIGHT ADJUSTMENT
            if ((asset.file || '').toLowerCase().includes('cupboard')) {
                // Cupboards snap to wall at their natural height (not on floor)
                targetY = asset.dimensions?.height ?? 0.9;
            }

            model.userData.targetY = targetY;
            model.userData._posX = posX;
            model.userData._posZ = posZ;
        }

        return new Promise((resolve) => {
            // If we've loaded this model before, clone and compute placement then finalize
            if (modelCache.has(asset.file)) {
                try {
                    const cached = modelCache.get(asset.file);
                    const clone = cached.clone(true);
                    clone.userData = { ...cached.userData };
                    clone.userData.attributes = asset;
                    computePlacementForModel(clone);
                    finalizeAndAdd(clone, asset, itemConfig, resolve);
                    return;
                } catch (err) {
                    console.warn('[Placer] failed to clone cached model', asset.file, err);
                }
            }

            loader.load(path, (model) => {
                // cache a deep clone (original loaded root) for reuse
                try { modelCache.set(asset.file, model.clone(true)); } catch (e) { /* cache best-effort */ }
                computePlacementForModel(model);
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

        // For accessories, allow collision with the base surface we snapped to
        if (asset.placeable && isBlocked) {
            const hitObj = check.collider;
            if (hitObj && model.userData && model.userData._baseSurface && hitObj === model.userData._baseSurface) {
                isBlocked = false;
            }
        }

        // For non-placeable items (surfaces), allow minor overlaps if collision is with other non-placeable items
        if (!asset.placeable && isBlocked) {
            const hitObj = check.collider;
            if (hitObj?.userData?.attributes && !hitObj.userData.attributes.placeable) {
                // Both are surfaces; allow overlap (they're probably on the floor together)
                isBlocked = false;
                console.debug('[Placer] allowing surface-on-surface overlap for', asset.name, 'and', hitObj.userData.attributes.name);
            }
        }

        if (!isBlocked) {
            scene.add(model);
            spawnedFurniture.push(model);
            collisionEngine.updateObstacles();
            // DO NOT call updateCollisionVisuals() here — only update when user selects/moves
            selectObject(model);
            console.debug('[Placer] successfully placed', asset.name);
            resolve(model);
        } else {
            // Try random offset placement as fallback
            const hitObj = check.collider;
            console.warn('[Placer] placement blocked for', asset.name, '— collision with:', hitObj?.userData?.attributes?.name || 'unknown');
            
            // Attempt smart random repositioning
            const rw = roomManager.roomWidth || 10;
            const rd = roomManager.roomDepth || 10;
            const maxAttempts = 5;
            let placed = false;

            for (let attempt = 0; attempt < maxAttempts && !placed; attempt++) {
                const randX = (Math.random() - 0.5) * rw * 0.8;
                const randZ = (Math.random() - 0.5) * rd * 0.8;
                model.position.x = randX;
                model.position.z = randZ;
                model.updateMatrixWorld(true);

                const recheck = collisionEngine.checkCollision(model);
                if (!recheck.isColliding) {
                    scene.add(model);
                    spawnedFurniture.push(model);
                    collisionEngine.updateObstacles();
                    selectObject(model);
                    console.debug('[Placer] successfully placed (random offset)', asset.name, `at (${randX.toFixed(1)}, ${randZ.toFixed(1)})`);
                    placed = true;
                    resolve(model);
                    return;
                }
            }

            console.warn('[Placer] could not find placement for', asset.name, 'after random attempts');
            resolve(null);
        }
    }

    return { placeModel };
}