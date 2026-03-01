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
    
    // FORCED JSON MODE: This eliminates the need for regex parsing or cleaning comments
    const aiModel = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash-lite',
        generationConfig: {
            responseMimeType: "application/json",
        }
    });

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

    async function runGeneration(userText, { useRoomContext = true, roomType = null, budget = null, onStatus } = {}) {
        if (!userText?.trim()) return null;

        const rw = roomManager.roomWidth;
        const rd = roomManager.roomDepth;
        const hw = (rw / 2).toFixed(2);
        const hd = (rd / 2).toFixed(2);

        const cacheKey = `${userText.trim().toLowerCase()}::${rw}x${rd}::${roomType || 'general'}`;
        const cached = getCached(cacheKey);
        if (cached) return cached;

        if (onStatus) onStatus('Architecting...');

        const filteredLibrary = furnitureLibrary.filter(a => !a.file.toLowerCase().includes('door'));
        const fileList = filteredLibrary.map(a => 
            `- ${a.file} [PlaceableOnFurniture: ${a.placeable && !a.file.toLowerCase().includes('shelf')}, H: ${a.dimensions.height}m]`
        ).join('\n');

        const roomRequirements = {
            "living room": "- Backs of Sofas or Chairs should be against walls or facing a central Table. Must include a Carpet in the center. Place a Media Console or Table with a TV and Speakers on top (X, Z alignment).",
            "bedroom": "- MANDATORY: Must include exactly one item from the 'Beds' folder (Bed Single, Bed Double, etc.). Place two Tables (Nightstands) flanking the bed. Place Lamps on top of the Nightstands at Y=Height.",
            "kitchen": "- Use 'Kitchen' folder assets. Counter units must be edge-to-edge (90-degree rotations). Place one Fridge, one Oven, and one Sink. Place small accessories (Microwave, Toaster) on the Kitchen counters.",
            "home office": "- Include a Desk from the 'Tables' folder. Desk MUST have a Monitor, Keyboard, and PC from the 'Electronics' folder placed on top (matching X, Z). Include one Office Chair facing the desk.",
            "bathroom": "- Use 'Bathroom' folder. Exactly one Toilet, one Sink, and one Shower/Bathtub. Use 'Miscellaneous' for small items like Toilet Roll holders placed near the Toilet.",
            "dining room": "- Center a large Dining Table from the 'Tables' folder. Surround it with at least four items from the 'Chairs' folder, all rotated 90 degrees to face the table center. Place a Vase or Bowl on the table."
        }

        const currentRequirements = roomRequirements[roomType?.toLowerCase()] || "Apply general professional standards.";

        const budgetClause = budget != null && budget !== '' ? `BUDGET: items should cost no more than $${budget}. Prioritize lower-cost items when possible.\n\n` : '';
        const prompt = `
ROLE: Master Interior Architect.
TASK: Generate a valid JSON array of furniture placement objects.

${budgetClause}ROOM CONTEXT:
- Type: ${roomType || 'General'}
- Size: ${rw}m x ${rd}m. 
- Bounds: X(-${hw} to ${hw}), Z(-${hd} to ${hd}).

ASSET LIBRARY:
${fileList}

MANDATORY SPATIAL RULES:
1. GROUNDING: All items with [PlaceableOnFurniture: false] MUST be at Y=0.
2. STACKING: All items with [PlaceableOnFurniture: true] MUST share the EXACT (X, Z) coordinates as a base item (Desk, Table, Console) and set Y to that base item's Height (H). SHELVES are NOT valid base items—NOTHING can be placed on top of a shelf.
3. SPACING: Distribute furniture across the room. Avoid clustering everything at (0, 0). Use the full room bounds.
4. CLEARANCE: Maintain 1.2m walking paths. No clipping.
5. SEATING: Desks must have a Chair E.fbx paired with it. Position chair directly in front of desk, facing the desk center.
6. ORIENTATION: 
   - TVs MUST rotate to face the CENTER of the room (0, 0). Calculate rotation based on TV position: if TV X < 0 (left side), rotate = 1.5708; if TV X > 0 (right side), rotate = 4.71239; if TV Z < 0 (front), rotate = 0.0; if TV Z > 0 (back), rotate = 3.14159.
   - Beds MUST rotate to face the center of the room (rotate: 0.0 if against the left wall, 3.14159 if against the right wall, etc.).
   - Sofas face the TV. Backs of large furniture touch the walls.
   - If there is no TV, sofas face the center.
   - Chairs face towards tables.
7. ROTATION PRECISION: 
   - All "rotate" values MUST be multiples of 1.5708 (90 degrees). 
   - Use ONLY these values: 0.0, 1.5708 (90°), 3.14159 (180°), or 4.71239 (270°). 
   - Ensure furniture backs are perfectly perpendicular to the room bounds.
9. PERPENDICULAR: Shelves and cupboards have to be flat and perpendicular against the wall, there must be 0 space between them and the wall.

USER REQUEST: "${userText}"

OUTPUT FORMAT (JSON ARRAY ONLY):
- Return ONLY a valid JSON array.
- No comments, no markdown blocks, no text explanations.
- The "rotate" value MUST be one of: [0.0, 1.5708, 3.14159, 4.71239].
- Spread items across the room horizontally (X and Z axes vary widely).

Format: [{"file":"filename.fbx", "x":0.0, "y":0.0, "z":0.0, "rotate":1.5708}]`;

        try {
            const result = await callWithRetry(prompt);

            // Be robust: response might be available as JSON, text, or wrapped.
            let raw = null;
            try {
                if (result && result.response) {
                    const resp = result.response;
                    if (typeof resp.json === 'function') {
                        try { raw = await resp.json(); } catch (e) { console.warn('[AI] resp.json() failed', e); }
                    }
                    if (raw == null && typeof resp.text === 'function') {
                        try { raw = await resp.text(); } catch (e) { console.warn('[AI] resp.text() failed', e); }
                    }
                }
            } catch (innerErr) {
                console.warn('[AI] response read failed, falling back:', innerErr);
            }

            if (raw == null) raw = result;

            let layout = null;

            if (typeof raw === 'string') {
                // Try multiple parsing strategies on a string.
                function attemptParse(str) {
                    // attempt to fix common minor formatting issues before parsing
                    const normalize = (s) => {
                        // insert missing colon between key and quoted string value
                        s = s.replace(/([\{\[,]\s*)([a-zA-Z0-9_]+)\s+"/g, '$1"$2":"');
                        // remove trailing commas
                        s = s.replace(/,\s*([}\]])/g, '$1');
                        return s;
                    };

                    // first try strict JSON (normalize string first)
                    try { return JSON.parse(normalize(str)); } catch (e) {
                        console.warn('[AI] JSON.parse failed on raw string', e);
                    }
                    // strip code fences/markdown and grab bracketed JSON
                    const si = str.indexOf('[');
                    const ei = str.lastIndexOf(']');
                    if (si !== -1 && ei !== -1 && ei > si) {
                        let candidate = str.substring(si, ei + 1);
                        candidate = normalize(candidate);
                        try {
                            return JSON.parse(candidate);
                        } catch (e) {
                            console.warn('[AI] JSON.parse failed on extracted candidate', e, candidate);
                            // try evaluating as JS
                            try { return (new Function('return ' + candidate))(); } catch (e2) {
                                console.warn('[AI] eval failed on candidate', e2);
                            }
                        }
                    }
                    // as a last resort try to eval the whole string as JS (might handle unquoted keys)
                    try { return (new Function('return ' + normalize(str)))(); } catch (e) {
                        console.warn('[AI] eval failed on raw string', e);
                    }
                    return null;
                }

                layout = attemptParse(raw);
                if (layout == null) {
                    // parsing failed entirely; throw to be caught below
                    throw new Error('Unable to parse AI string response');
                }
            } else if (Array.isArray(raw)) {
                layout = raw;
            } else if (raw && typeof raw === 'object') {
                // Common provider shapes: { outputs: [...] } or top-level array under a key
                if (Array.isArray(raw.outputs)) {
                    // try to pull textual content from outputs
                    const outText = raw.outputs.map(o => (o.text || (o.content && o.content[0] && o.content[0].text) || '')).join('\n');
                    if (outText) {
                        try { layout = JSON.parse(outText); } catch (_) { /* ignore */ }
                    }
                }

                if (!layout) {
                    // look for first array value in object
                    for (const v of Object.values(raw)) {
                        if (Array.isArray(v)) { layout = v; break; }
                    }
                }
            }

            if (!Array.isArray(layout)) {
                console.error('[AI] Unable to parse layout. Raw response:', raw);
                throw new Error('Unrecognized AI response format');
            }

            setCache(cacheKey, layout);
            return layout;
        } catch (e) {
            console.error('[AI] Generation Error:', e);
            throw new Error("Failed to parse layout. Please try a different request. See console for details.");
        }
    }

    return { runGeneration };
}