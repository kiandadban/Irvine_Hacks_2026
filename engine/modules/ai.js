const CACHE_KEY = 'spatial_ai_layout_cache';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

const MODEL = 'gemini-2.5-flash-lite';
const PROXY_ENDPOINT = '/api/generate';

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

/**
 * @param {string} apiKey - Optional local dev key (engine/config.js). When empty,
 *                          requests go through the /api/generate serverless proxy,
 *                          which holds the key in GEMINI_API_KEY server-side.
 */
export function createAI(apiKey, furnitureLibrary, roomManager) {

    // FORCED JSON MODE: This eliminates the need for regex parsing or cleaning comments
    const generationConfig = { responseMimeType: 'application/json' };

    async function callDirect(prompt) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig,
            }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const err = new Error(data?.error?.message || `Gemini request failed (${resp.status})`);
            err.status = resp.status;
            throw err;
        }
        return (data?.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('');
    }

    async function callProxy(prompt) {
        const resp = await fetch(PROXY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });

        let data;
        try {
            data = await resp.json();
        } catch {
            // A plain static server has no /api route, so it answers with HTML.
            const err = new Error(
                `AI backend unavailable: ${PROXY_ENDPOINT} returned ${resp.status} (not JSON). ` +
                `Run the site on Vercel, or set a key in engine/config.js for local use.`
            );
            err.status = resp.status;
            throw err;
        }

        if (!resp.ok) {
            const err = new Error(data?.error || `AI request failed (${resp.status})`);
            err.status = resp.status;
            throw err;
        }
        return data.text ?? '';
    }

    const callModel = (prompt) => (apiKey ? callDirect(prompt) : callProxy(prompt));

    async function callWithRetry(prompt, retries = 3) {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                return await callModel(prompt);
            } catch (e) {
                const rateLimited = e?.status === 429 || e?.message?.includes('429');
                if (rateLimited && attempt < retries - 1) {
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

        let raw;
        try {
            raw = await callWithRetry(prompt);
        } catch (e) {
            console.error('[AI] Request failed:', e);
            throw new Error(e.message || 'The AI request failed.');
        }

        try {
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

                const parsed = attemptParse(raw);
                if (parsed == null) {
                    // parsing failed entirely; throw to be caught below
                    throw new Error('Unable to parse AI string response');
                }

                if (Array.isArray(parsed)) {
                    layout = parsed;
                } else if (typeof parsed === 'object') {
                    // The model occasionally wraps the array, e.g. { "layout": [...] }
                    for (const v of Object.values(parsed)) {
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
            console.error('[AI] Generation Error:', e, '\nRaw response:', raw);
            throw new Error('Failed to parse the layout the AI returned. Please try a different request. See console for details.');
        }
    }

    return { runGeneration };
}