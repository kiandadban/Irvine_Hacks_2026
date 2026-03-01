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
        if (!a.folder) {
            a.folder = a.category; // fallback when not provided
        }
    });
    const assetMap       = furnitureLibrary.reduce((m, a) => { m[a.file] = a; return m; }, {});

    return { furnitureLibrary, assetMap };
}
