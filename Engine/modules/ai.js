import { GoogleGenerativeAI } from '@google/generative-ai';

const CACHE_KEY = 'roomai_layout_cache';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

function getCached(key) {
    try {
        const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        const entry = cache[key];
        if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.layout;
    } catch { return null; }
}

function setCache(key, layout) {
    try {
        const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        cache[key] = { layout, ts: Date.now() };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch { /* ignore */ }
}

export function createAI(apiKey, furnitureLibrary, roomManager) {
    if (!apiKey) return { runGeneration: async () => null };

    const genAI = new GoogleGenerativeAI(apiKey);
    const aiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    async function callWithRetry(prompt, retries = 3) {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                return await aiModel.generateContent(prompt);
            } catch (e) {
                if (e?.message?.includes('429') && attempt < retries - 1) {
                    await new Promise(r => setTimeout(r, 2500));
                } else throw e;
            }
        }
    }

    async function runGeneration(userText, { useRoomContext = true, roomType = null, onStatus } = {}) {
        if (!userText?.trim()) return null;

        const cacheKey = `${userText.trim().toLowerCase()}::${roomManager.roomWidth}x${roomManager.roomDepth}`;
        const cached = getCached(cacheKey);
        if (cached) return cached;

        if (onStatus) onStatus('Architecting...');

        const filteredLibrary = furnitureLibrary.filter(a => !a.file.toLowerCase().includes('door'));
        const fileList = filteredLibrary.map(a => 
            `${a.file} [PlaceableOnFurniture: ${a.placeable}, H: ${a.dimensions.height}m]`
        ).join('\n');

        const rw = roomManager.roomWidth;
        const rd = roomManager.roomDepth;
        const hw = (rw / 2).toFixed(2);
        const hd = (rd / 2).toFixed(2);
        const prompt = `ACT AS: Senior Interior Architect & CAD Expert.
ROOM SIZE: ${rw}m x ${rd}m. Bounds: X(-${hw} to ${hw}), Z(-${hd} to ${hd}).
ROOM TYPE: ${roomType || 'General'}

--- ASSET LIBRARY ---
${fileList}

--- STRICT PLACEMENT & STACKING RULES ---
1. NO DOORS: Never place door assets. Doors are already part of the room structure.

2. GROUNDING (Y=0): 
   - Items with "placeable": false (Beds, Desks, Sofas, Tables, TV Stands) MUST have Y=0.
   - These are your "Base Furniture."

3. SURFACE STACKING (Y > 0):
   - Items with "placeable": true (Keyboards, Laptops, Monitors, Speakers, Lamps, Books) MUST be placed on a Base item.
   - Set the accessory's (X, Z) to overlap with the Base item's coordinates.
   - Set the accessory's Y value to the EXACT Height (H) of the furniture it is sitting on.
   - Example: If a Desk (H: 0.75m) is at (X: 2, Z: 3), then a Keyboard MUST be at (X: 2.2, Y: 0.75, Z: 3).

4. COMMON SENSE LOGIC:
   - Televisions go on TV Stands or Media Consoles.
   - Monitors, Keyboards, and Mice go on Desks.
   - Lamps and Alarm Clocks go on Nightstands or Side Tables.
   - Do not place random items in the center of the floor.

5. SOCIAL & VISUAL ORIENTATION:
   - Seating (Chairs, Sofas) and Televisions MUST face each other.
   - Rotate items using Radians (0 to 6.28). Point the "front" of chairs toward the "front" of desks or TVs.

6. SPATIAL AESTHETICS:
   - Keep a 1.2m clear path for walking. 
   - Snap large furniture backs against walls (coordinates near the Bounds).

OUTPUT: Return a JSON array ONLY. No markdown, no prose.
Format: [{"file":"name.fbx", "x":0.0, "y":0.0, "z":0.0, "rotate":0.0}]

USER REQUEST: "${userText}"`;

        try {
            const result = await callWithRetry(prompt);
            const rawText = result.response.text();
            const jsonStart = rawText.indexOf('[');
            const jsonEnd = rawText.lastIndexOf(']') + 1;
            const layout = JSON.parse(rawText.substring(jsonStart, jsonEnd));
            setCache(cacheKey, layout);
            return layout;
        } catch (e) {
            console.error('[AI] Error:', e);
            throw e;
        }
    }

    return { runGeneration };
}