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
    const aiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

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
        const roomTypeLine = (useRoomContext && roomType)
            ? `ROOM TYPE: ${roomType}`
            : '';
        const budgetValue = useRoomContext
            ? Number(document.getElementById('budgetSlider')?.value ?? 0)
            : null;
        const budgetLine = budgetValue
            ? `BUDGET: $${budgetValue.toLocaleString()}. Only select furniture appropriate for this price range.`
            : '';

const prompt = `ACT AS: Master Interior Architect & CAD Expert.
ROOM SIZE: ${rw}m x ${rd}m. Bounds: X(-${hw} to ${hw}), Z(-${hd} to ${hd}).
${roomTypeLine}
${budgetLine}

--- ASSET LIBRARY ---
${fileList}

--- DESIGN PHILOSOPHY: SIMPLE & ELEGANT ---
1. INTENTIONALITY: Every object must serve a purpose. Avoid clutter. If an item doesn't add to the function or elegance of the room, exclude it.
2. ZONING: Divide the room into logical zones (e.g., Workspace, Relaxation, Sleeping). Do not mix unrelated furniture (e.g., don't put a Desk next to a Toilet).
3. PROPORTION: Ensure large items (Sofa, Bed) have enough breathing room.

--- ROOM CATEGORY RULES ---
* kitchen: only one stove and dishwasher; one of each appliance type; keep appliances on counter tops; stove must sit adjacent to dishwasher; maintain at least 0.4 m spacing between appliances.
* living room: layout must include seating and a rug; every seat/sofa should face the TV; center major seating groups on a carpet; keep design balanced.
* bedroom: make the space cozy, avoid clipping furniture; beds should abut a wall; leave a clear buffer around all items.
* bathroom: keep fixtures organized and tidy; enforce min clearance 0.3 m around components; follow adjacency pairs and wall‑mount rules from object groups.
* office: workspace should remain neat; chairs belong with desks; do not scatter random objects on the floor.


--- STRICT RELATIONSHIP LOGIC (Surface Pairing) ---
Only place accessories on logical surfaces. If a required surface is missing, do not place the accessory.
1. DESK/OFFICE: Monitor, Keyboard, Mouse, Laptop, Pc, Desk Lamps.
2. TV STANDS/CONSOLES: TV A, TV B, Speakers, Game Consoles.
3. NIGHTSTANDS/SIDE TABLES: Alarm Clocks, Small Lamps, Tablets, Mugs.
4. SHELVES: Books, Vases, small Plants.
5. DINING TABLES: Plates, Glasses, Pans.
6. PROHIBITED: NEVER place Electronics/Lamps on Beds, Sofas, or the Floor. NEVER stack heavy furniture.

--- COORDINATE PRECISION (10cm Tolerance) ---
1. PARENT-CHILD ALIGNMENT: accessories (placeable: true) MUST use the EXACT same (X, Z) as their base furniture to ensure successful snapping.
2. Y-VALUE: Must equal the exact Height (H) of the base item.
3. WALL SNAPPING: Large furniture (Beds, Wardrobes, Desks) backs must be flush against walls (X or Z near room bounds).

--- ORIENTATION & FLOW ---
1. SOCIAL FOCUS: Seating and Media MUST face each other. Point the "front" of chairs toward the focal point (TV or Desk).
2. CLEARANCE: Maintain at least a 1.2m clear walking path through the center. No "islands" of furniture blocking movement.
3. SYMMETRY: Aim for balanced layouts (e.g., centered beds, paired nightstands).

OUTPUT: Return a JSON array ONLY.
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