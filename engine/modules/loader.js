/**
 * Loads and parses the furniture attributes JSON.
 * @param {string} [jsonPath='../models/furniture_attributes.json']
 * @returns {Promise<{ furnitureLibrary: Array, assetMap: Object }>}
 */
export async function loadFurnitureLibrary(jsonPath = '../models/furniture_attributes.json') {
    const resp = await fetch(jsonPath);
    if (!resp.ok) throw new Error(`Failed to fetch furniture library: ${resp.status} ${resp.statusText}`);

    const data           = await resp.json();
    const furnitureLibrary = data.furniture_library ?? [];
    // make sure each entry has a folder; this helps path building later
    furnitureLibrary.forEach(a => {
        if (!a.folder) a.folder = a.category; // fallback when not provided
        // precompute a URL-safe path for quick model loading
        a.url = `../models/${encodeURIComponent(a.folder)}/${encodeURIComponent(a.file)}`;
        // convenience keys to accelerate searches
        a._fileKey = (a.file || '').toLowerCase();
        a._nameKey = (a.name || '').toLowerCase();
    });

    // Build asset map with multiple lookup keys for tolerance (filename, lowercase, and asset name)
    const assetMap = furnitureLibrary.reduce((m, a) => {
        m[a.file] = a;
        m[a._fileKey] = a;
        m[a._nameKey] = a;
        return m;
    }, {});

    // helper: tolerant finder for AI-generated or user-provided keys
    assetMap.find = (key) => {
        if (!key) return null;
        // direct exact match
        if (assetMap[key]) return assetMap[key];
        const lk = String(key).toLowerCase().trim();
        if (assetMap[lk]) return assetMap[lk];
        // strip common suffixes like .fbx
        const base = lk.replace(/\.fbx$/, '').trim();
        // try by filename with extension
        if (assetMap[base + '.fbx']) return assetMap[base + '.fbx'];
        // scan through library for name match
        for (const k in assetMap) {
            const a = assetMap[k];
            if (!a || !a._nameKey) continue;
            if (a._nameKey === base) return a;
        }
        return null;
    };

    return { furnitureLibrary, assetMap };
}
