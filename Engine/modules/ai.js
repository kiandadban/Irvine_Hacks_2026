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

        const rw = roomManager.roomWidth;
        const rd = roomManager.roomDepth;
        const hw = (rw / 2).toFixed(2);
        const hd = (rd / 2).toFixed(2);

        // Include roomType in cache key to distinguish between bedroom/office layouts of same prompt
        const cacheKey = `${userText.trim().toLowerCase()}::${rw}x${rd}::${roomType || 'general'}`;
        const cached = getCached(cacheKey);
        if (cached) return cached;

        if (onStatus) onStatus('Architecting...');

        const filteredLibrary = furnitureLibrary.filter(a => !a.file.toLowerCase().includes('door'));
        const fileList = filteredLibrary.map(a => 
            `${a.file} [PlaceableOnFurniture: ${a.placeable}, H: ${a.dimensions.height}m]`
        ).join('\n');

        // --- ROOM SPECIFIC REQUIREMENTS ---
        const roomRequirements = {
            "bedroom": `
                - PRIMARY PIECE: Exactly one Bed (Double or Single). Centered against a wall.
                - SYMMETRY: Place two Nightstands/Side Tables flanking the bed.
                - LIGHTING: Place two Lamps on the Nightstands.
                - STORAGE: Include at least one Wardrobe or Dresser flush against a perimeter wall.
                - SEATING: Use only an Office Chair if a Desk is present.`,
            
            "living room": `
                - FOCAL POINT: Arrange seating (Sofas) to face a Media Console or TV.
                - CONVERSATION ZONE: Place a Rug in the center with a Coffee Table on top.
                - ACCESSORIES: Place a TV and Speakers on the Console.
                - AMBIANCE: Include at least two Plants and one Floor Lamp in corners.`,
            
            "kitchen": `
                - SNAPPING: Lower units (Cupboard, Oven, Dishwasher, Sink) MUST be placed edge-to-edge (0m gap with no other objects in between). 
                - ALIGNMENT: All lower units MUST share the same Z-coordinate (if on a North/South wall) or X-coordinate (if on an East/West wall) to form a straight line.
                - WALL UNITS: If a file name contains 'Upper' or 'Wall', set its Y-value to 1.5m. 
                - FLAT ROTATION: All Cupboards and Appliances MUST have a rotation of 0, 90, 180, or 270 degrees only—keep them perfectly flush against the walls.
                - APPLIANCES: One Fridge (Floor), one Oven (Built-in to line), and one Sink (Built-in to line).
                - SURFACES: Small items (Toaster, Kettle) must sit on the Countertop (Y = 0.9m).`,
            
            "office": `
                - WORKSTATION: Position the Desk to face the door or a window.
                - ERGONOMICS: Use exactly one Office Chair.
                - TECH: The Desk MUST have a Monitor, Keyboard, and PC/Laptop.
                - ORGANIZATION: Place at least two Shelves or Bookshelves against the walls.`,
            
            "bathroom": `
                - SANITATION: Must include exactly one Toilet, one Sink/Vanity, and one Shower or Bath.
                - ACCESSORIES: Place a Toilet Roll Holder next to the Toilet.
                - STORAGE: Place a Towel Holder near the Shower/Bath.
                - SCALE: Keep 1.2m of clear floor space in front of the Sink.`
        };

        const currentRequirements = roomRequirements[roomType?.toLowerCase()] || "Apply general professional interior design standards.";

        const prompt = `ACT AS: Master Interior Architect & CAD Expert.
ROOM SIZE: ${rw}m x ${rd}m. Bounds: X(-${hw} to ${hw}), Z(-${hd} to ${hd}).
ROOM TYPE: ${roomType || 'General'}

--- ASSET LIBRARY ---
${fileList}

--- SPECIFIC ROOM REQUIREMENTS (MANDATORY) ---
${currentRequirements}

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

--- SURFACE & STACKING LOGIC (No Overlaps) ---
1. NO STACKING: Multiple accessories on the same surface MUST have different (X, Z) coordinates. 
2. SURFACE JITTER: For every additional item on a surface, offset the X or Z by 0.2m to 0.4m from the center to prevent z-fighting/clipping.
3. BOUNDS CHECK: Ensure the accessory's (X, Z) remains within the physical footprint of the base furniture.

--- GRAVITY & ANCHORING (No Floating) ---
1. ANCHORING: A TV, Monitor, or Lamp CANNOT exist without a supporting "Surface" item (Stand, Desk, Table) at the same location.
2. Y-PRECISION: The Y-value of an accessory MUST match the Height (H) of the item directly beneath it. 
3. FLOOR FALLBACK: If an item is NOT an accessory (placeable: false), its Y-value MUST be 0.0 (Floor Level).

--- MISCELLANEOUS ---
1. If a TV is placed, make sure that it is on top of a table and facing towards the center of the room
2. Make sure nothing is blocking the TV's view 

OUTPUT: Return a JSON array ONLY.
Format: [{"file":"name.fbx", "x":0.0, "y":0.0, "z":0.0, "rotate":0.0}]

USER REQUEST: "${userText}"`;

try {
    const result = await callWithRetry(prompt);
    let rawText = result.response.text();
    
    // 1. Find the boundaries of the JSON array
    const jsonStart = rawText.indexOf('[');
    const jsonEnd = rawText.lastIndexOf(']') + 1;
    
    if (jsonStart === -1) throw new Error("No JSON layout found in AI response");
    
    let jsonString = rawText.substring(jsonStart, jsonEnd);

    // 2. THE FIX: Remove Javascript-style comments (// or /* */) 
    // which the AI sometimes includes, breaking JSON.parse
    jsonString = jsonString.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");

    const layout = JSON.parse(jsonString);
    setCache(cacheKey, layout);
    return layout;
} catch (e) {
    console.error('[AI] Parsing Error. Raw Response:', e);
    throw new Error("The AI returned an invalid format. Please try again.");
}
    }

    return { runGeneration };
}