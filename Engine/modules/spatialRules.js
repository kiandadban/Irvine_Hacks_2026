import * as THREE from 'three';

export const SpatialRules = {
    // 1. Define Zones: Groups of items that MUST stay together
    ZONES: {
        WORK_RIG: ['Monitor', 'Keyboard', 'Laptop', 'Pc', 'Mouse', 'Lamp A'],
        MEDIA_CENTER: ['TV A', 'TV B', 'Speaker', 'Console A', 'Console B', 'Console C'],
        BEDSIDE: ['Alarm Clock', 'Lamp C', 'Phone', 'Tablet', 'Mug'],
        DINING: ['Plate', 'Glass', 'Pan', 'Bowl', 'Kettle']
    },

    // 2. Define Valid Surfaces: Where can these zones live?
    SURFACE_MAP: {
        'Tables': ['WORK_RIG', 'MEDIA_CENTER', 'DINING', 'BEDSIDE'],
        'Drawers': ['BEDSIDE', 'MEDIA_CENTER'],
        'Shelves': ['MEDIA_CENTER', 'DINING'],
        'Electronics': ['MEDIA_CENTER'] // e.g., placing a console on a TV stand
    },

    /**
     * Liberal Search: Finds a logical surface within a radius.
     */
    findLogicalSurface(itemX, itemZ, asset, spawnedFurniture) {
        const itemCategory = asset.name;
        // Determine which zone this item belongs to
        const itemZone = Object.keys(this.ZONES).find(zone => this.ZONES[zone].includes(itemCategory));
        
        let bestSurface = null;
        let minDistance = 1.2; // Liberal search radius (1.2 meters)

        spawnedFurniture.forEach(f => {
            const fAttrs = f.userData.attributes;
            if (fAttrs.placeable) return; // Can't place on another accessory

            // Check if this surface is allowed to host this item's zone
            const allowedZones = this.SURFACE_MAP[fAttrs.category] || [];
            if (itemZone && !allowedZones.includes(itemZone)) return;

            const fBox = new THREE.Box3().setFromObject(f);
            const center = fBox.getCenter(new THREE.Vector3());
            const dist = new THREE.Vector2(itemX, itemZ).distanceTo(new THREE.Vector2(center.x, center.z));

            if (dist < minDistance) {
                minDistance = dist;
                bestSurface = f;
            }
        });

        return bestSurface;
    },

    /**
     * Grouping Logic: Prevents everything from stacking in the exact center.
     * It offsets items based on their type to look "arranged."
     */
    applyZonalOffset(model, surface, assetName) {
        const sBox = new THREE.Box3().setFromObject(surface);
        const sSize = sBox.getSize(new THREE.Vector3());
        
        // Horizontal Offsets (liberal grouping)
        // Instead of exact center, we nudge items based on common desk layouts
        if (assetName === 'Monitor' || assetName.includes('TV')) {
            // Keep centered but at the back of the surface
            model.position.z -= sSize.z * 0.25; 
        } else if (assetName === 'Keyboard' || assetName === 'Laptop') {
            // Move toward the front of the surface
            model.position.z += sSize.z * 0.2;
        } else if (assetName === 'Mouse' || assetName === 'Phone') {
            // Move to the right
            model.position.x += sSize.x * 0.3;
        } else if (assetName.includes('Lamp')) {
            // Move to the back corner
            model.position.x -= sSize.x * 0.35;
            model.position.z -= sSize.z * 0.3;
        }

        // Inherit surface rotation so it's aligned with the furniture
        model.rotation.y = surface.rotation.y;
    }
};