import { GoogleGenerativeAI } from '@google/generative-ai';

const CACHE_KEY    = 'roomai_layout_cache';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

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

/**
 * Builds the AI generation system.
 *
 * @param {string}   apiKey
 * @param {Array}    furnitureLibrary  - array of asset records from furniture_attributes.json
 * @param {Object}   roomManager       - { roomWidth, roomDepth }
 * @returns {{ runGeneration(userText, opts?): Promise<Array|null> }}
 */
export function createAI(apiKey, furnitureLibrary, roomManager) {
    if (!apiKey) {
        console.warn('[AI] No API key provided.');
        return { runGeneration: async () => null };
    }

    const genAI   = new GoogleGenerativeAI(apiKey);
    const aiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    async function callWithRetry(prompt, retries = 3) {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                return await aiModel.generateContent(prompt);
            } catch (e) {
                const is429 = e?.message?.includes('429');
                if (is429 && attempt < retries - 1) {
                    const match = e.message.match(/(\d+\.?\d*)s/);
                    const delay = match ? parseFloat(match[1]) * 1000 + 200 : 2000;
                    console.warn(`[AI] Rate limited — retrying in ${Math.ceil(delay / 1000)}s`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    throw e;
                }
            }
        }
    }

    /**
     * @param {string}  userText
     * @param {object}  [opts]
     * @param {boolean} [opts.useRoomContext=true]  - include live room dimensions in prompt
     * @param {string}  [opts.statusCallback]       - fn(statusText) for UI feedback
     * @returns {Promise<Array|null>} parsed layout array, or null on failure
     */
    async function runGeneration(userText, { useRoomContext = true, onStatus } = {}) {
        if (!userText?.trim()) return null;

        const cacheKey = `${userText.trim().toLowerCase()}::${roomManager.roomWidth}x${roomManager.roomDepth}`;
        const cached   = getCached(cacheKey);
        if (cached) {
            console.log('[AI] Cache hit');
            if (onStatus) onStatus('Loading cached layout...');
            return cached;
        }

        if (onStatus) onStatus('Architecting...');

        const fileList = furnitureLibrary.map(a => a.file).join(', ');
        const rw = roomManager.roomWidth;
        const rd = roomManager.roomDepth;
        const hw = (rw / 2).toFixed(2);
        const hd = (rd / 2).toFixed(2);

        const roomLine = useRoomContext
            ? `ROOM: ${rw}m x ${rd}m. Bounds: X(-${hw} to ${hw}), Z(-${hd} to ${hd}).`
            : `ROOM: 10m x 10m. Bounds: X(-5 to 5), Z(-5 to 5).`;

        const prompt = `ACT AS: Senior Interior Architect.
${roomLine}

STRICT FILENAME MANIFEST — use ONLY these exact filenames (case-sensitive):
${fileList}

PLACEMENT RULES (all must be followed):
1. No overlap: bounding boxes must not intersect.
2. Minimum 2.0m separation between items.
3. All items within room bounds above.
4. Doors: place flush against room edge, Y=0.
5. Desk + chair within 1m of each other.
6. Beds: headboard against a wall.
7. No item at exactly (0,0).
8. All objects sit on floor (Y=0); no stacking.
9. Maximum 12 items total.

OUTPUT: Return a JSON array ONLY — no markdown, no prose.
Example: [{"file":"Bed Double.fbx","x":2.0,"z":-4.0,"rotate":0}]

USER REQUEST: "${userText}"`;

        try {
            const result  = await callWithRetry(prompt);
            const rawText = result.response.text();
            console.log('[AI] Raw response:', rawText);
            const layout = JSON.parse(rawText.replace(/```json|```/g, '').trim());
            setCache(cacheKey, layout);
            return layout;
        } catch (e) {
            console.error('[AI] Error:', e);
            const msg = e?.message || String(e);
            if (msg.includes('403') || msg.includes('401') || msg.includes('API key')) {
                throw new Error(`API key error: ${msg}`);
            }
            if (msg.includes('JSON') || msg.includes('parse') || msg.includes('SyntaxError')) {
                throw new Error(`Failed to parse AI response as JSON. Check console for raw output.\n${msg}`);
            }
            throw e;
        }
    }

    return { runGeneration };
}
