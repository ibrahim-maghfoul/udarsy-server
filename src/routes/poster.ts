import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// ─── API Key Management ───────────────────────────────────────────────────────

const getApiKeys = (): string[] => {
    const hardcoded = [
        "infip-5350e2b6", "infip-744117e5", "infip-b005d12c", "infip-e6ac682a",
        "infip-ac628e9f", "infip-2fcc7019", "infip-b058c62b", "infip-d1302957",
        "infip-3642c084", "infip-523fda1b", "infip-c0e6a9b5", "infip-ed3aaacb",
        "infip-9aa99cdb", "infip-17379f55", "infip-6b4a3ab4", "infip-5bdc6d7d",
        "infip-a32b9b2f", "infip-9d05a08f", "infip-be7dd422", "infip-9ff0efaa",
        "infip-fa216627", "infip-41cbfaa9", "infip-3b87ee6f", "infip-e609470f",
        "infip-86dc3b16", "infip-d112da9a", "infip-527ccd05", "infip-dc0cef3f",
        "infip-2bb032bd", "infip-4afc2039", "infip-c322704f", "infip-3dd59b1f",
        "infip-d8cdc10b", "infip-1e3f796f", "infip-77c9ba18", "infip-f1bf735d",
        "infip-c8e39b24", "infip-8a98801e", "infip-2b40ba53", "infip-5b95d2b3",
        "infip-e30fc0ea", "infip-ef0a0c21", "infip-68e9200d", "infip-6a801c65",
        "infip-55c92743", "infip-36fd29ab", "infip-b98ee253", "infip-abb8260d",
        "infip-94140f27", "infip-9db76de0", "infip-ee8c4b91", "infip-38e7bcc4",
        "infip-6d86d5f6", "infip-8357e5dc", "infip-6cf39dfc", "infip-04bf8c3a",
        "infip-c488dc9d", "infip-129aefd5", "infip-91900813", "infip-88f277db",
        "infip-6c14913e", "infip-1f0bd602", "infip-684ea20b", "infip-6136f84f",
        "infip-4c61ec7c", "infip-19abf69e", "infip-8343b6af", "infip-1e8e52a1",
        "infip-7d20457f", "infip-ff1377b4"
    ];
    try {
        const keysPath = path.join(__dirname, '../../keys.json');
        if (fs.existsSync(keysPath)) {
            const parsed = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
            const keys = Array.isArray(parsed) ? parsed : (parsed.api_keys || []);
            if (keys.length > 0) return keys;
        }
    } catch {
        console.warn('⚠️ Failed to parse keys.json, using hardcoded keys');
    }
    return hardcoded;
};

let currentKeyIndex = 0;

// ─── GET /trends ──────────────────────────────────────────────────────────────
// Fetch daily trending searches in Morocco from Google Trends RSS

// GET /trends?topic=education   → filtered Google News search RSS
// GET /trends                   → general Morocco top news (same as n8n workflow)
router.get('/trends', async (req: Request, res: Response) => {
    const topic = (req.query.topic as string || '').trim();

    // When a topic is given, use Google News search RSS with Morocco + topic keywords
    // Otherwise fall back to the general Morocco top headlines (n8n workflow approach)
    const url = topic
        ? `https://news.google.com/rss/search?q=${encodeURIComponent(topic + ' Maroc')}&hl=ar&gl=MA&ceid=MA:ar`
        : 'https://news.google.com/rss?hl=ar&gl=MA&ceid=MA:ar';

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            }
        });

        const xml = await response.text();
        if (!xml || xml.length < 100) throw new Error('Empty RSS response');

        // Extract <item> blocks first (avoids matching the feed-level <title>)
        const itemRegex = /<item[\s\S]*?<\/item>/g;
        const items = [...xml.matchAll(itemRegex)].map(m => m[0]);
        if (items.length === 0) throw new Error('No <item> elements in RSS');

        const titleRegex = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/;
        const sourceRegex = /<source[^>]*>(.*?)<\/source>/;

        const trends = items.slice(0, 15).map((item, i) => {
            const title  = item.match(titleRegex)?.[1]?.trim() || '';
            const source = item.match(sourceRegex)?.[1]?.trim() || '';
            return { rank: i + 1, title, source };
        }).filter(n => n.title.length > 0);

        if (trends.length === 0) throw new Error('No titles extracted from RSS items');

        res.json({ trends: trends.map(t => t.title), full: trends });
    } catch (error: any) {
        console.warn('⚠️ Google News RSS fetch failed:', error.message);
        res.json({
            trends: [
                'BAC 2025 résultats', 'Concours médecine Maroc', 'ENSA admission',
                'CPGE Maroc', 'Bourse étudiant Maroc', 'Atlas Lions Maroc',
                'Ramadan Maroc', 'Brevet collège résultats', 'Emploi Maroc 2025',
                'Darija apprentissage'
            ],
            full: []
        });
    }
});

// ─── GET /proxy ───────────────────────────────────────────────────────────────
// Proxy an external image with CORS headers (used for canvas compositing)

router.get('/proxy', async (req: Request, res: Response) => {
    try {
        const url = req.query.url as string;
        if (!url) return res.status(400).json({ error: 'url query param required' });

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Upstream ${response.status}`);

        const buffer = Buffer.from(await response.arrayBuffer());
        res.set('Content-Type', response.headers.get('content-type') || 'image/png');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'no-store');
        return res.send(buffer);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── POST /generate-poster-image ─────────────────────────────────────────────
// provider: 'ghost' (default, uses infip) | 'openai' (uses DALL-E 3)

router.post('/generate-poster-image', async (req: Request, res: Response) => {
    try {
        const { prompt, size = '1024x1024', n = 1, model = 'ghost' } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const numImages = Math.min(parseInt(n as any) || 1, 4);

        // ── OpenAI models ──
        if (model === 'dall-e-2' || model === 'dall-e-3' || model === 'gpt-image-1' || model === 'gpt-image-2') {
            const openaiKey = process.env.OPENAI_API_KEY;
            if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set in backend .env' });

            // dall-e-3 only supports n=1 per call; others support batches
            const batchSize = model === 'dall-e-3' ? 1 : numImages;
            const calls = model === 'dall-e-3' ? numImages : 1;

            const results: { url: string }[] = [];

            for (let i = 0; i < calls; i++) {
                const finalPrompt = prompt;

                const body: Record<string, any> = {
                    model,
                    prompt: finalPrompt,
                    n: batchSize,
                    size: '1024x1024',
                };

                if (model === 'dall-e-3') {
                    body.quality = 'hd';
                    body.style = 'natural';
                    body.response_format = 'url';
                } else if (model === 'dall-e-2') {
                    body.response_format = 'url';
                } else if (model === 'gpt-image-2') {
                    // gpt-image-2: returns base64, supports flexible sizes up to 3840px, quality: low/medium/high/auto
                    body.quality = 'auto';
                    body.size = '1024x1024';
                    body.output_format = 'png';
                } else {
                    // gpt-image-1: returns base64
                    body.quality = 'high';
                }

                const response = await fetch('https://api.openai.com/v1/images/generations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiKey}`
                    },
                    body: JSON.stringify(body)
                });
                const data = await response.json() as any;
                if (!response.ok) {
                    const msg = data.error?.message || `OpenAI HTTP ${response.status}`;
                    return res.status(500).json({ error: msg });
                }

                for (const img of data.data) {
                    if (img.url) {
                        results.push({ url: img.url });
                    } else if (img.b64_json) {
                        // gpt-image-1 returns base64 — convert to data URL
                        results.push({ url: `data:image/png;base64,${img.b64_json}` });
                    }
                }
            }

            return res.json({ data: results });
        }

        // ── Ghost API (infip) ──
        const generatedImageData: { url: string }[] = [];
        let allKeysExhausted = false;
        let globalLastError: any = null;

        for (let i = 0; i < numImages; i++) {
            if (allKeysExhausted) break;

            const activeApiKeys = getApiKeys();
            if (currentKeyIndex >= activeApiKeys.length) currentKeyIndex = 0;
            let localKeyIndex = currentKeyIndex;
            currentKeyIndex = (currentKeyIndex + 1) % activeApiKeys.length;

            let attempts = 0;
            let imageSuccess = false;
            let consecutiveJsonErrors = 0;

            while (attempts < activeApiKeys.length) {
                const apiKey = activeApiKeys[localKeyIndex];
                try {
                    console.log(`🔄 Attempt ${attempts + 1}/${activeApiKeys.length} key ${apiKey} — image ${i + 1}/${numImages}`);

                    const response = await fetch('https://api.infip.pro/v1/images/generations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({ model: 'img4', prompt, n: 1, size, response_format: 'url' })
                    });

                    let data: any;
                    try { data = await response.json(); consecutiveJsonErrors = 0; }
                    catch {
                        consecutiveJsonErrors++;
                        // If the API returns non-JSON 3 times in a row, the service is down — skip to fallback
                        if (consecutiveJsonErrors >= 3) {
                            console.warn('⚠️ infip API returning non-JSON repeatedly — service appears down, skipping to fallback');
                            allKeysExhausted = true;
                            break;
                        }
                        throw new Error('Invalid JSON from infip API');
                    }

                    if (!response.ok) {
                        const errMsg = data.detail || data.error?.message || data.message || `HTTP ${response.status}`;
                        throw new Error(`API Error ${response.status}: ${errMsg}`);
                    }

                    // Async polling
                    if (data.status === 'pending' && data.task_id) {
                        const pollUrl = data.poll_url || `https://api.infip.pro/v1/tasks/${data.task_id}`;
                        let pollAttempts = 0;
                        let taskFinished = false;

                        while (pollAttempts < 60 && !taskFinished) {
                            pollAttempts++;
                            await new Promise(r => setTimeout(r, 2000));
                            const pollRes = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
                            const pollData = await pollRes.json() as any;
                            const status = (pollData.status || pollData.state || '').toLowerCase();

                            if (pollRes.ok && (status === 'finished' || status === 'success' || status === 'completed' || pollData.data || pollData.url)) {
                                data = pollData;
                                taskFinished = true;
                            } else if (!pollRes.ok || status === 'failed' || status === 'error') {
                                throw new Error(`Task failed: ${status}`);
                            }
                        }
                        if (!taskFinished) throw new Error('Task polling timed out');
                    }

                    // Normalize output
                    if (data.url && !data.data?.[0]) generatedImageData.push({ url: data.url });
                    else if (data.result?.url) generatedImageData.push({ url: data.result.url });
                    else if (data.results?.[0]?.url) generatedImageData.push({ url: data.results[0].url });
                    else if (data.data?.[0]?.url) generatedImageData.push({ url: data.data[0].url });

                    console.log(`✅ Image ${i + 1} success with key ${localKeyIndex}`);
                    imageSuccess = true;
                    break;

                } catch (error: any) {
                    console.warn(`⚠️ Key ${localKeyIndex} failed: ${error.message}`);
                    globalLastError = error;
                    localKeyIndex = (localKeyIndex + 1) % activeApiKeys.length;
                    attempts++;
                }
            }

            if (!imageSuccess) allKeysExhausted = true;
        }

        if (generatedImageData.length === numImages) {
            return res.json({ data: generatedImageData });
        }

        // Pollinations fallback for missing images
        const missing = numImages - generatedImageData.length;
        console.log(`❌ ${missing}/${numImages} failed all keys. Falling back to Pollinations... (${globalLastError?.message})`);

        const [w, h] = size.split('x');
        const neg = 'frame,border,margin,mockup,centered,drop shadow,vignette,grey edges';
        const fallback = Array.from({ length: missing }).map(() => ({
            url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&seed=${Math.floor(Math.random() * 1000000)}&negative=${encodeURIComponent(neg)}`
        }));

        return res.json({ data: [...generatedImageData, ...fallback] });

    } catch (error: any) {
        console.error('Poster generation fatal error:', error);
        return res.status(500).json({ error: error.message });
    }
});

// ─── POST /save-session ───────────────────────────────────────────────────────
// Saves one poster image + upserts session.json metadata under data/content-sessions/{topicId}/

router.post('/save-session', async (req: Request, res: Response) => {
    try {
        const { topicId, topic, title, headline, subline, designPrompt, socialCaption, theme, model, language, imageUrl } = req.body;
        if (!topicId || !imageUrl) return res.status(400).json({ error: 'topicId and imageUrl are required' });

        const sessionDir = path.join(process.cwd(), '../udarsy-admin/public/data', 'content-sessions', topicId);
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

        // Count existing images to get next index
        const existingImages = fs.readdirSync(sessionDir).filter(f => f.endsWith('.png'));
        const imageIndex = existingImages.length + 1;
        const imageName = `poster_${theme}_${imageIndex}.png`;

        // Download image (data URL or remote URL)
        let imageBuffer: Buffer;
        if (imageUrl.startsWith('data:image/')) {
            const base64Data = imageUrl.split(',')[1];
            imageBuffer = Buffer.from(base64Data, 'base64');
        } else {
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) throw new Error(`Failed to fetch image: HTTP ${imgRes.status}`);
            imageBuffer = Buffer.from(await imgRes.arrayBuffer());
        }
        fs.writeFileSync(path.join(sessionDir, imageName), imageBuffer);

        // Upsert session.json
        const metaPath = path.join(sessionDir, 'session.json');
        const meta = fs.existsSync(metaPath)
            ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
            : { topicId, topic, title, headline, subline, designPrompt, model, language, createdAt: new Date().toISOString(), images: [] };

        meta.images.push({ filename: imageName, theme, savedAt: new Date().toISOString() });

        console.log(`[save-session] Topic: ${topicId} | socialCaption received:`, typeof socialCaption, socialCaption ? '(has content)' : '(empty)');
        meta.socialCaption = socialCaption || '';

        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

        return res.json({ success: true, folder: `/data/content-sessions/${topicId}`, imageName });
    } catch (error: any) {
        console.error('Save session error:', error);
        return res.status(500).json({ error: error.message });
    }
});

// ─── GET /sessions ───────────────────────────────────────────────────────────
// Returns all saved content sessions sorted by newest first

router.get('/sessions', (_req: Request, res: Response) => {
    try {
        const sessionsDir = path.join(process.cwd(), '../udarsy-admin/public/data', 'content-sessions');
        if (!fs.existsSync(sessionsDir)) return res.json({ sessions: [] });

        const folders = fs.readdirSync(sessionsDir).filter(f =>
            fs.statSync(path.join(sessionsDir, f)).isDirectory()
        );

        const sessions = folders
            .map(folder => {
                const metaPath = path.join(sessionsDir, folder, 'session.json');
                if (!fs.existsSync(metaPath)) return null;
                try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
                catch { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return res.json({ sessions });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── DELETE /sessions/:topicId ────────────────────────────────────────────────
// Deletes a session folder and all its contents

router.delete('/sessions/:topicId', (req: Request, res: Response) => {
    try {
        const { topicId } = req.params;
        if (!topicId) return res.status(400).json({ error: 'topicId is required' });

        const sessionDir = path.join(process.cwd(), '../udarsy-admin/public/data', 'content-sessions', topicId);
        if (!fs.existsSync(sessionDir)) return res.status(404).json({ error: 'Session not found' });

        fs.rmSync(sessionDir, { recursive: true, force: true });
        return res.json({ success: true });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── PATCH /sessions/:topicId ─────────────────────────────────────────────────
// Update mutable session fields (caption, etc.)

router.patch('/sessions/:topicId', (req: Request, res: Response) => {
    try {
        const { topicId } = req.params;
        if (!topicId) return res.status(400).json({ error: 'topicId is required' });

        const sessionDir = path.join(process.cwd(), '../udarsy-admin/public/data', 'content-sessions', topicId);
        const metaPath = path.join(sessionDir, 'session.json');
        if (!fs.existsSync(metaPath)) return res.status(404).json({ error: 'Session not found' });

        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const allowed = ['socialCaption', 'caption', 'headline', 'subline', 'topic'];
        for (const key of allowed) {
            if (req.body[key] !== undefined) meta[key] = req.body[key];
        }
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

        return res.json({ success: true });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

// ─── POST /save-poster-image ──────────────────────────────────────────────────

router.post('/save-poster-image', async (req: Request, res: Response) => {
    try {
        const { imageUrl, filename } = req.body;
        if (!imageUrl || !filename) return res.status(400).json({ error: 'imageUrl and filename are required' });

        const postersDir = path.join(process.cwd(), '../udarsy-admin/public/data', 'posters');
        if (!fs.existsSync(postersDir)) fs.mkdirSync(postersDir, { recursive: true });

        const imgResponse = await fetch(imageUrl);
        const buffer = Buffer.from(await imgResponse.arrayBuffer());

        const safeFilename = filename.replace(/[^a-z0-9_\-\.]/gi, '_') + '.png';
        fs.writeFileSync(path.join(postersDir, safeFilename), buffer);

        return res.json({ filename: safeFilename, path: `/data/posters/${safeFilename}` });
    } catch (error: any) {
        console.error('Poster save error:', error);
        return res.status(500).json({ error: error.message });
    }
});

// ─── POST /save-logo-overlay ──────────────────────────────────────────────────
// Saves a composited poster (with logo) to udarsy-admin/public/assets/Added logo/

router.post('/save-logo-overlay', async (req: Request, res: Response) => {
    try {
        const { imageUrl, filename } = req.body;
        if (!imageUrl || !filename) return res.status(400).json({ error: 'imageUrl and filename are required' });

        const outputDir = path.join(process.cwd(), '../udarsy-admin/public/assets/Added logo');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        const safeFilename = filename.replace(/[^a-z0-9_\-\.]/gi, '_');
        const finalName = safeFilename.endsWith('.png') ? safeFilename : safeFilename + '.png';
        fs.writeFileSync(path.join(outputDir, finalName), imageBuffer);

        return res.json({ success: true, filename: finalName, folder: 'public/assets/Added logo' });
    } catch (error: any) {
        console.error('Save logo overlay error:', error);
        return res.status(500).json({ error: error.message });
    }
});

export default router;
