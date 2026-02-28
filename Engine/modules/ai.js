import { GoogleGenerativeAI } from '@google/generative-ai';

const CACHE_KEY    = 'roomai_layout_cache';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

function getCached(key) {
    try {
        const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        const entry = cache[key];
        if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.layout;
    } catch { /* ignore */ }
    return null;
}

function setCache(key, layout) {
    try {
        const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        cache[key] = { layout, ts: Date.now() };
        const keys = Object.keys(cache);
        if (keys.length > 50) delete cache[keys[0]];
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch { /* ignore */ }
}

export function createAI(apiKey, furnitureLibrary, roomManager) {
    if (!apiKey) {
        console.warn('[AI] No API key provided.');
        return { runGeneration: async () => null };
    }

    const genAI   = new GoogleGenerativeAI(apiKey);
    // Suggesting Gemini 1.5 Flash or higher for better spatial reasoning
    const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    async function callWithRetry(prompt, retries = 3) {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                return await aiModel.generateContent(prompt);
            } catch (e) {
                const is429 = e?.message?.includes('429');
                if (is429 && attempt < retries - 1) {
                    const match = e.message.match(/(\d+\.?\d*)s/);
                    const delay = match ? parseFloat(match[1]) * 1000 + 200 : 2000;
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    throw e;
                }
            }
        }
    }

    async function runGeneration(userText, { useRoomContext = true, roomType = null, onStatus } = {}) {
        if (!userText?.trim()) return null;

        const cacheKey = `${userText.trim().toLowerCase()}::${roomManager.roomWidth}x${roomManager.roomDepth}`;
        const cached   = getCached(cacheKey);
        if (cached) {
            if (onStatus) onStatus('Loading cached layout...');
            return cached;
        }

        if (onStatus) onStatus('Architecting...');

        // --- IMPROVEMENT: Include dimensions in the manifest ---
        // This allows the AI to calculate stacking heights (Y values)
        const fileList = furnitureLibrary.map(a => 
            `${a.file} [Size: ${a.dimensions.width}x${a.dimensions.height}x${a.dimensions.depth}m]`
        ).join('\n');

        const rw = roomManager.roomWidth;
        const rd = roomManager.roomDepth;
        const hw = (rw / 2).toFixed(2);
        const hd = (rd / 2).toFixed(2);

        const roomLine = useRoomContext
            ? `ROOM: ${rw}m x ${rd}m. Bounds: X(-${hw} to ${hw}), Z(-${hd} to ${hd}).`
            : `ROOM: 10m x 10m. Bounds: X(-5 to 5), Z(-5 to 5).`;

        const roomTypeLine = (useRoomContext && roomType)
            ? `ROOM TYPE: ${roomType}. Only place furniture appropriate for this room type.`
            : '';

        const prompt = `ACT AS: Senior Interior Architect.
${roomLine}
${roomTypeLine}

STRICT FILENAME MANIFEST (use exact names):
${fileList}

PLACEMENT & STACKING RULES:
1. COORDINATES: X and Z are horizontal. Y is vertical (height).
2. FLOOR ITEMS: Large items (Beds, Desks, Sofas) MUST be at Y=0.
3. SURFACE STACKING: Small items (Computers, Laptops, Lamps, Books) MUST be placed on top of surfaces. 
   - Set the small item's Y value to EXACTLY the height of the item it sits on.
   - Example: If a Desk is 0.75m high, the Laptop's Y must be 0.75.
4. AESTHETICS: Space items out to create walking paths. Do not cluster everything in the center.
5. SNAPPING: Large furniture should have its back against a wall (near X=${hw}/-${hw} or Z=${hd}/-${hd}).
6. LOGIC: Pair items (e.g., Desk Chair at a Desk).
7. PROHIBITION: No overlapping bounding boxes. Maximum 15 items.

OUTPUT: Return a JSON array ONLY.
Example: [{"file":"Desk.fbx","x":2.0,"z":0.0,"y":0,"rotate":0}, {"file":"Laptop.fbx","x":2.0,"z":0.0,"y":0.75,"rotate":0}]

USER REQUEST: "${userText}"`;

        try {
            const result  = await callWithRetry(prompt);
            const rawText = result.response.text();
            
            // Robust parsing: extract content between [ and ] in case AI adds prose
            const jsonStart = rawText.indexOf('[');
            const jsonEnd = rawText.lastIndexOf(']') + 1;
            const jsonStr = rawText.substring(jsonStart, jsonEnd);
            
            const layout = JSON.parse(jsonStr);
            setCache(cacheKey, layout);
            return layout;
        } catch (e) {
            console.error('[AI] Error:', e);
            throw e;
        }
    }

    return { runGeneration };
}