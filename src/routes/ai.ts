import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { AiAnswer } from '../models/AiAnswer';
import { User } from '../models/User';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;

const router = Router();

// Detect if document is exercise/exam type
function isExerciseDoc(documentTitle: string, lessonTitle: string): boolean {
    const combined = `${documentTitle} ${lessonTitle}`.toLowerCase();
    return /exercice|examen|devoir|test|td |travaux\s*dirig|exam|quiz|série|corrig|problème|problem|exercise|worksheet|tp |travaux\s*pratiq/i.test(combined);
}

const PROMPTS: Record<string, (lessonTitle: string, documentTitle: string, isExercise: boolean, docContent?: string) => string> = {
    fr: (lessonTitle, documentTitle, isExercise, docContent) => {
        const contentBlock = docContent ? `\n\nContenu extrait du document :\n"""\n${docContent}\n"""` : '';
        return isExercise
        ? `Tu es un assistant pédagogique expert pour les élèves marocains (lycée, collège, BAC).
Un élève consulte cet exercice / devoir et a besoin d'aide :

Cours / Leçon : ${lessonTitle || 'Non spécifié'}
Document : ${documentTitle}${contentBlock}

Fournis une aide structurée :
1. **Compréhension de l'exercice** : Explique ce qui est demandé et quels concepts sont mobilisés.
2. **Méthode de résolution** : Décris la démarche étape par étape.
3. **Correction détaillée** : Résous chaque question / partie en montrant les calculs et justifications.
4. **Points clés à retenir** : Résume les erreurs courantes à éviter et les astuces utiles.
5. **Application** : Propose un exercice similaire si utile.

Sois pédagogue, montre les étapes de raisonnement, et adapte ton niveau au lycée/collège marocain.`
        : `Tu es un assistant pédagogique expert pour les élèves marocains (lycée, collège, BAC).
Un élève vient de consulter ce document éducatif et veut une explication complète :

Cours / Leçon : ${lessonTitle || 'Non spécifié'}
Document : ${documentTitle}${contentBlock}

Fournis une explication pédagogique structurée couvrant :
1. **Introduction** : De quoi parle ce document ? À quoi sert-il ?
2. **Concepts clés** : Explique les notions fondamentales de manière claire.
3. **Points importants à retenir** : Résume les éléments essentiels (formules, méthodes, règles…).
4. **Exemples concrets** : Donne des exemples pratiques si applicable.
5. **Conseils pour l'examen** : Ce qu'il faut absolument maîtriser.

Utilise un langage clair et accessible, en français, adapté au niveau lycée/collège marocain. Sois précis, concis et pédagogue.`;
    },

    ar: (lessonTitle, documentTitle, isExercise, docContent) => {
        const contentBlock = docContent ? `\n\nمحتوى الوثيقة المستخرج :\n"""\n${docContent}\n"""` : '';
        return isExercise
        ? `أنت مساعد تربوي خبير للطلاب المغاربة (ثانوي، إعدادي، باكالوريا).
يطلب الطالب مساعدة في هذا التمرين/الاختبار:

الدرس : ${lessonTitle || 'غير محدد'}
الوثيقة : ${documentTitle}${contentBlock}

قدّم مساعدة منظمة تشمل:
1. **فهم التمرين** : اشرح ما هو مطلوب والمفاهيم المستخدمة.
2. **طريقة الحل** : صِف المنهجية خطوة بخطوة.
3. **التصحيح المفصّل** : أجب عن كل سؤال مع إظهار الحسابات والتبريرات.
4. **نقاط مهمة** : لخّص الأخطاء الشائعة والحيل المفيدة.
5. **تطبيق** : اقترح تمريناً مشابهاً إن أمكن.

كن تربوياً وأظهر خطوات التفكير بلغة عربية واضحة للمستوى الثانوي المغربي.`
        : `أنت مساعد تربوي خبير للطلاب المغاربة (ثانوي، إعدادي، باكالوريا).
يريد الطالب شرحاً وافياً لهذه الوثيقة التعليمية:

الدرس : ${lessonTitle || 'غير محدد'}
الوثيقة : ${documentTitle}${contentBlock}

قدّم شرحاً تربوياً منظماً يشمل:
1. **مقدمة** : عمَّ تتحدث هذه الوثيقة؟ ما أهميتها؟
2. **المفاهيم الأساسية** : اشرح المفاهيم الجوهرية بأسلوب واضح.
3. **النقاط المهمة للحفظ** : لخّص العناصر الأساسية (صيغ، طرق، قواعد…).
4. **أمثلة عملية** : أعطِ أمثلة تطبيقية عند الاقتضاء.
5. **نصائح للامتحان** : ما يجب إتقانه بالضرورة.

استخدم لغة عربية واضحة ومناسبة للمستوى الثانوي المغربي.`;
    },

    en: (lessonTitle, documentTitle, isExercise, docContent) => {
        const contentBlock = docContent ? `\n\nExtracted document content:\n"""\n${docContent}\n"""` : '';
        return isExercise
        ? `You are an expert educational assistant for Moroccan students (high school, middle school, BAC prep).
A student needs help with this exercise/exam:

Lesson: ${lessonTitle || 'Not specified'}
Document: ${documentTitle}${contentBlock}

Provide structured assistance:
1. **Understanding the exercise**: Explain what is asked and which concepts are used.
2. **Resolution method**: Describe the step-by-step approach.
3. **Detailed solution**: Solve each question/part showing calculations and justifications.
4. **Key takeaways**: Summarize common mistakes to avoid and useful tips.
5. **Practice**: Suggest a similar exercise if useful.

Be pedagogical, show reasoning steps, and adapt to Moroccan high school/middle school level.`
        : `You are an expert educational assistant for Moroccan students (high school, middle school, BAC prep).
A student just reviewed this educational document and wants a complete explanation:

Lesson: ${lessonTitle || 'Not specified'}
Document: ${documentTitle}${contentBlock}

Provide a structured pedagogical explanation covering:
1. **Introduction**: What is this document about? What is its purpose?
2. **Key concepts**: Explain the fundamental notions clearly.
3. **Important points to remember**: Summarize the essentials (formulas, methods, rules…).
4. **Practical examples**: Give concrete examples if applicable.
5. **Exam tips**: What you absolutely need to master.

Use clear, accessible language adapted to the Moroccan high school/middle school level.`;
    },
};

function extractGoogleDriveId(url: string): string | null {
    const m = url.match(/\/file\/d\/([^/?#]+)/) || url.match(/[?&]id=([^&]+)/);
    return m ? m[1] : null;
}

async function fetchDocumentText(url: string): Promise<string> {
    if (!url) return '';

    const driveId = url.includes('drive.google.com') ? extractGoogleDriveId(url) : null;
    const candidates = driveId
        ? [
            `https://drive.google.com/uc?export=download&id=${driveId}&confirm=t`,
            `https://drive.google.com/uc?export=pdf&id=${driveId}`,
          ]
        : [url];

    for (const fetchUrl of candidates) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(fetchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; UdarsyBot/1.0)',
                    'Accept': 'application/pdf,*/*',
                },
                redirect: 'follow',
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!response.ok) continue;
            const contentType = response.headers.get('content-type') || '';
            // Skip HTML responses (login pages, confirmation pages)
            if (contentType.includes('text/html')) continue;

            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length < 100) continue;

            const data = await pdfParse(buffer);
            const text = data.text.trim();
            if (text.length > 50) return text;
        } catch {
            // try next candidate
        }
    }
    return '';
}

// GET /api/ai/answer/:docId — return cached AI explanation (no auth required)
// Query param: ?lang=fr|ar|en (defaults to fr)
router.get('/answer/:docId', async (req, res: Response) => {
    try {
        const { docId } = req.params;
        const lang = (req.query.lang as string) || 'fr';
        const cached = await AiAnswer.findOne({ docId, language: lang }).lean();
        if (!cached) return res.status(404).json({ error: 'No cached answer' });
        return res.json({
            answer: cached.answer,
            language: cached.language,
            avgRating: cached.avgRating,
            ratingCount: cached.ratingCount,
            cached: true,
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/ai/explain — generate and cache an AI explanation (auth required)
// Body: { docId, documentTitle, lessonTitle, language? }
router.post('/explain', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

        const { docId, documentTitle, lessonTitle, documentUrl = '', language = 'fr', forceRegenerate = false } = req.body;
        if (!docId || !documentTitle) {
            return res.status(400).json({ error: 'docId and documentTitle are required' });
        }

        const user = await User.findById(req.userId).lean();
        if (!user) return res.status(401).json({ error: 'User not found' });

        // If not forcing regeneration, return cached answer
        if (!forceRegenerate) {
            const existing = await AiAnswer.findOne({ docId, language: language }).lean();
            if (existing) return res.json({
                answer: existing.answer,
                language: existing.language,
                avgRating: existing.avgRating,
                ratingCount: existing.ratingCount,
                cached: true,
            });
        }

        // Regeneration limit logic
        if (forceRegenerate) {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            let currentCount = user.aiRegenCountToday || 0;
            const lastRegen = user.aiLastRegenDate;
            
            // Reset count if last regen was before today
            if (!lastRegen || new Date(lastRegen) < todayStart) {
                currentCount = 0;
            }

            // Determine limit
            const plan = user.subscription?.plan || 'free';
            const limit = plan === 'premium' ? 70 : (plan === 'pro' ? 30 : 1);

            if (currentCount >= limit) {
                return res.status(429).json({ error: `You have reached your daily limit of ${limit} AI regenerations for your ${plan} plan. Please upgrade or try again tomorrow.` });
            }

            await User.findByIdAndUpdate(req.userId, { 
                aiLastRegenDate: new Date(),
                aiRegenCountToday: currentCount + 1
            });
        }

        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) return res.status(503).json({ error: 'AI service not configured' });

        // Fetch and extract PDF text so the AI can read the actual document
        const docText = documentUrl ? await fetchDocumentText(documentUrl) : '';

        // Auto-detect language from extracted content if not manually specified
        let resolvedLang = language;
        if (docText) {
            const arabicChars = (docText.match(/[؀-ۿ]/g) || []).length;
            const totalChars = docText.replace(/\s/g, '').length;
            if (arabicChars / totalChars > 0.3) resolvedLang = 'ar';
        }

        const promptFn = PROMPTS[resolvedLang] || PROMPTS['fr'];
        const prompt = promptFn(lessonTitle || '', documentTitle, isExerciseDoc(documentTitle, lessonTitle || ''), docText || undefined);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1800,
                temperature: 0.7,
            }),
        });

        const data = await response.json() as any;
        if (!response.ok) {
            console.error('OpenAI Explain Error:', data.error?.message || `OpenAI error ${response.status}`);
            return res.status(500).json({ error: "Something went wrong. Please try again later." });
        }

        const answer = data.choices?.[0]?.message?.content;
        if (!answer) return res.status(500).json({ error: 'Empty response from AI' });

        // Upsert: replace if regenerating, create if new
        await AiAnswer.findOneAndUpdate(
            { docId, language: resolvedLang },
            { docId, documentTitle, lessonTitle: lessonTitle || '', documentUrl, answer, language: resolvedLang, ratings: [], avgRating: 0, ratingCount: 0 },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.json({ answer, language: resolvedLang, avgRating: 0, ratingCount: 0, cached: false });
    } catch (err: any) {
        console.error('AI explain error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/ai/ask — ask the AI a question about a specific document (auth required)
// Body: { docId, documentTitle, lessonTitle, documentUrl?, question, language? }
router.post('/ask', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

        const { docId, documentTitle, lessonTitle, documentUrl = '', question, language = 'fr' } = req.body;
        if (!question?.trim()) return res.status(400).json({ error: 'Question is required' });
        if (!docId || !documentTitle) return res.status(400).json({ error: 'docId and documentTitle are required' });

        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) return res.status(503).json({ error: 'AI service not configured' });

        // Fetch document content (reuse existing helper)
        const docText = documentUrl ? await fetchDocumentText(documentUrl) : '';

        // Auto-detect language from content or title
        let resolvedLang = language;
        if (docText) {
            const arabicChars = (docText.match(/[؀-ۿ]/g) || []).length;
            const totalChars = docText.replace(/\s/g, '').length;
            if (arabicChars / totalChars > 0.3) resolvedLang = 'ar';
        } else if (/[؀-ۿ]/.test(documentTitle)) {
            resolvedLang = 'ar';
        }

        const contentBlock = docText
            ? (resolvedLang === 'ar'
                ? `\n\nمحتوى الوثيقة:\n"""\n${docText}\n"""`
                : resolvedLang === 'en'
                ? `\n\nDocument content:\n"""\n${docText}\n"""`
                : `\n\nContenu du document:\n"""\n${docText}\n"""`)
            : '';

        const systemPrompts: Record<string, string> = {
            fr: `Tu es un assistant pédagogique expert pour les élèves marocains (lycée, collège, BAC).
Tu aides un élève à comprendre un document éducatif spécifique.
Cours / Leçon : ${lessonTitle || 'Non spécifié'}
Document : ${documentTitle}${contentBlock}

Réponds uniquement à la question de l'élève en te basant sur ce document. Sois précis, pédagogue et adapté au niveau lycée/collège marocain. Si la question porte sur quelque chose qui n'est pas dans le document, dis-le clairement.`,
            ar: `أنت مساعد تربوي خبير للطلاب المغاربة (ثانوي، إعدادي، باكالوريا).
تساعد الطالب على فهم وثيقة تعليمية محددة.
الدرس: ${lessonTitle || 'غير محدد'}
الوثيقة: ${documentTitle}${contentBlock}

أجب فقط على سؤال الطالب بناءً على هذه الوثيقة. كن دقيقاً وتربوياً. إذا كان السؤال خارج نطاق الوثيقة، وضّح ذلك.`,
            en: `You are an expert educational assistant for Moroccan students (high school, middle school, BAC prep).
You are helping a student understand a specific educational document.
Lesson: ${lessonTitle || 'Not specified'}
Document: ${documentTitle}${contentBlock}

Answer only the student's question based on this document. Be precise and pedagogical. If the question is outside the document's scope, say so clearly.`,
        };

        const systemPrompt = systemPrompts[resolvedLang] || systemPrompts['fr'];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: question.trim() },
                ],
                max_tokens: 1200,
                temperature: 0.5,
            }),
        });

        const data = await response.json() as any;
        if (!response.ok) {
            console.error('OpenAI Ask Error:', data.error?.message || `OpenAI error ${response.status}`);
            return res.status(500).json({ error: "Something went wrong. Please try again later." });
        }

        const answer = data.choices?.[0]?.message?.content;
        if (!answer) return res.status(500).json({ error: 'Empty response from AI' });

        return res.json({ answer, language: resolvedLang });
    } catch (err: any) {
        console.error('AI ask error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/ai/contribution-hint — generate a short contribution description (auth required)
// Body: { resourceTitle, subjectTitle, lessonTitle?, language? }
router.post('/contribution-hint', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

        const { resourceTitle, subjectTitle, lessonTitle, language = 'fr' } = req.body;
        if (!resourceTitle?.trim()) return res.status(400).json({ error: 'resourceTitle is required' });

        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) return res.status(503).json({ error: 'AI service not configured' });

        const lessonPart = lessonTitle ? ` — ${lessonTitle}` : '';

        const prompts: Record<string, string> = {
            fr: `Un élève marocain partage une ressource éducative sur la plateforme Udarsy.
Matière : ${subjectTitle || 'Non spécifié'}
Leçon : ${lessonTitle || 'Non spécifié'}
Titre de la ressource : "${resourceTitle}"

Rédige une courte note (2-3 phrases max) que l'élève peut utiliser pour décrire sa contribution. Elle doit expliquer ce que contient la ressource et comment elle peut aider d'autres élèves. Parle à la première personne, de façon naturelle et simple. Ne commence pas par "Je partage".`,

            ar: `طالب مغربي يشارك موردًا تعليميًا على منصة أدرسي.
المادة : ${subjectTitle || 'غير محدد'}
الدرس : ${lessonTitle || 'غير محدد'}
عنوان المورد : "${resourceTitle}"

اكتب ملاحظة قصيرة (2-3 جمل كحد أقصى) يمكن للطالب استخدامها لوصف مساهمته. يجب أن تشرح ما تحتويه المورد وكيف يمكن أن تساعد الطلاب الآخرين. تحدث بضمير المتكلم بشكل طبيعي وبسيط.`,

            en: `A Moroccan student is sharing an educational resource on the Udarsy platform.
Subject: ${subjectTitle || 'Not specified'}
Lesson: ${lessonTitle || 'Not specified'}
Resource title: "${resourceTitle}"

Write a short note (2-3 sentences max) the student can use to describe their contribution. It should explain what the resource contains and how it can help other students. Write in first person, naturally and simply. Don't start with "I'm sharing".`,
        };

        const prompt = prompts[language] || prompts['fr'];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 200,
                temperature: 0.7,
            }),
        });

        const data = await response.json() as any;
        if (!response.ok) return res.status(500).json({ error: 'AI service error' });

        const hint = data.choices?.[0]?.message?.content?.trim();
        if (!hint) return res.status(500).json({ error: 'Empty response from AI' });

        return res.json({ hint });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/ai/rate/:docId — rate an AI explanation (auth required)
// Body: { rating: 1-5, language?: 'fr'|'ar'|'en' }
router.post('/rate/:docId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

        const { docId } = req.params;
        const { rating, language = 'fr' } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }

        const aiAnswer = await AiAnswer.findOne({ docId, language });
        if (!aiAnswer) return res.status(404).json({ error: 'No explanation found for this document' });

        // Update or add rating for this user
        const existingIdx = aiAnswer.ratings.findIndex(r => r.userId === req.userId);
        if (existingIdx >= 0) {
            aiAnswer.ratings[existingIdx].rating = rating;
        } else {
            aiAnswer.ratings.push({ userId: req.userId!, rating, createdAt: new Date() });
        }

        // Recalculate avg
        const total = aiAnswer.ratings.reduce((sum, r) => sum + r.rating, 0);
        aiAnswer.avgRating = Math.round((total / aiAnswer.ratings.length) * 10) / 10;
        aiAnswer.ratingCount = aiAnswer.ratings.length;

        await aiAnswer.save();

        return res.json({
            avgRating: aiAnswer.avgRating,
            ratingCount: aiAnswer.ratingCount,
            userRating: rating,
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/ai/all — list all AI answers (admin)
router.get('/all', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.userId) return res.status(401).json({ error: 'Authentication required' });
        const user = await User.findById(req.userId).lean();
        if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [answers, total] = await Promise.all([
            AiAnswer.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            AiAnswer.countDocuments(),
        ]);

        return res.json({ answers, total, page, pages: Math.ceil(total / limit) });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/ai/:docId — delete AI answer (admin)
router.delete('/:docId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.userId) return res.status(401).json({ error: 'Authentication required' });
        const user = await User.findById(req.userId).lean();
        if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

        const { docId } = req.params;
        const lang = (req.query.lang as string) || undefined;
        const query = lang ? { docId, language: lang } : { docId };
        await AiAnswer.deleteMany(query);
        return res.json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
