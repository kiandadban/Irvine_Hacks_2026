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

    async function runGeneration(userText, { useRoomContext = true, roomType = null, onStatus } = {}) {
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
            `- ${a.file} [PlaceableOnFurniture: ${a.placeable}, H: ${a.dimensions.height}m]`
        ).join('\n');

        // Keeping your specific room logic intact but cleaning it for the prompt
        const roomRequirements = {
            "bedroom": "- Must include at least one bed from the list (Bed Single, Bed Double, Bunk Bed or Triple Bunk Bed). Exactly one bed is preferred. Two Nightstands should flank the bed with Lamps on them. Wardrobe against a wall.",
            "living room": "- Sofas face Media Console. Rug in center with Coffee Table on top. TV/Speakers on Console.",
            "kitchen": "- Counter units edge-to-edge. One Fridge, one Oven, one Sink. Small items on Countertop (Y=0.9).",
            "office": "- Desk faces window/door. Desk MUST have Monitor, Keyboard, and PC. Shelves against walls.",
            "bathroom": "- Exactly one Toilet, Sink, and Shower. Toilet Roll holder next to toilet."
        };

        const currentRequirements = roomRequirements[roomType?.toLowerCase()] || "Apply general professional standards.";

        const prompt = `
ROLE: Master Interior Architect.
TASK: Generate a valid JSON array of furniture placement objects.

ROOM CONTEXT:
- Type: ${roomType || 'General'}
- Size: ${rw}m x ${rd}m. 
- Bounds: X(-${hw} to ${hw}), Z(-${hd} to ${hd}).

ASSET LIBRARY:
${fileList}

MANDATORY SPATIAL RULES:
1. GROUNDING: All items with [PlaceableOnFurniture: false] MUST be at Y=0.
2. STACKING: All items with [PlaceableOnFurniture: true] MUST share the EXACT (X, Z) coordinates as a base item (Desk, Table, Console) and set Y to that base item's Height (H).
3. AESTHETICS: ${currentRequirements}
4. CLEARANCE: Maintain 1.2m walking paths. No clipping.
5. ORIENTATION: TVs face the center. Seats face the TV. Backs of large furniture touch the walls.
6. MANDATORY BEDROOM PIECE: if room type is bedroom, ensure the layout includes a bed item (Single, Double, Bunk or Triple Bunk) before returning results.

USER REQUEST: "${userText}"

OUTPUT FORMAT (JSON ARRAY ONLY):
[{"file":"filename.fbx", "x":0.0, "y":0.0, "z":0.0, "rotate":0.0}]`;

        try {
            const result = await callWithRetry(prompt);

            // Be robust: response might be available as JSON, text, or wrapped.
            let raw = null;
            try {
                if (result && result.response) {
                    const resp = result.response;
                    if (typeof resp.json === 'function') {
                        try { raw = await resp.json(); } catch (_) { /* ignore */ }
                    }
                    if (raw == null && typeof resp.text === 'function') {
                        try { raw = await resp.text(); } catch (_) { /* ignore */ }
                    }
                }
            } catch (innerErr) {
                console.warn('[AI] response read failed, falling back:', innerErr);
            }

            if (raw == null) raw = result;

            let layout = null;

            if (typeof raw === 'string') {
                // Try direct parse first
                try {
                    layout = JSON.parse(raw);
                } catch (parseErr) {
                    // Some models wrap JSON in code fences or extra text — attempt to extract
                    const s = raw;
                    const si = s.indexOf('[');
                    const ei = s.lastIndexOf(']');
                    if (si !== -1 && ei !== -1 && ei > si) {
                        const candidate = s.substring(si, ei + 1);
                        layout = JSON.parse(candidate);
                    } else {
                        throw parseErr;
                    }
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