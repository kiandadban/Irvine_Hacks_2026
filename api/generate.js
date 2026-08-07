/**
 * Vercel Serverless Function — proxies layout requests to the Gemini API.
 *
 * The key lives in the GEMINI_API_KEY environment variable (Vercel →
 * Project Settings → Environment Variables) so it is never shipped to the
 * browser. Uses plain fetch so the function needs no dependencies installed.
 */

const MODEL = 'gemini-2.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({
            error: 'GEMINI_API_KEY is not configured on the server.',
        });
    }

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = null; }
    }
    const prompt = body?.prompt;
    if (!prompt) {
        return res.status(400).json({ error: 'Missing "prompt" in request body.' });
    }

    try {
        const upstream = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json' },
            }),
        });

        const data = await upstream.json();

        if (!upstream.ok) {
            return res.status(upstream.status).json({
                error: data?.error?.message || `Gemini request failed (${upstream.status})`,
            });
        }

        const text = (data?.candidates?.[0]?.content?.parts ?? [])
            .map(p => p.text ?? '')
            .join('');

        if (!text) {
            return res.status(502).json({ error: 'Gemini returned an empty response.' });
        }

        return res.status(200).json({ text });
    } catch (e) {
        return res.status(502).json({ error: `Could not reach Gemini: ${e.message}` });
    }
}
