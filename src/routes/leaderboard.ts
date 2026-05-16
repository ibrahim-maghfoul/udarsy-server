import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { User } from '../models/User';
import { MonthlyRank } from '../models/MonthlyRank';
import { cache } from '../utils/cache';

const router = express.Router();

// ── Score weights ──────────────────────────────────────────────────────────────
const W_POINTS         = 1.0;   // each point
const W_LEARNING_TIME  = 0.5;   // per minute of learning
const W_CONTRIBUTION   = 15;    // per contribution
const W_NEWS_INTERACT  = 3;     // per news interaction (save / question)

/**
 * GET /api/leaderboard/monthly?month=2026-04
 * Returns the stored monthly rank snapshot (or computes it on-the-fly if missing).
 */
router.get('/monthly', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
        const month = (req.query.month as string) ||
            new Date().toISOString().slice(0, 7); // "YYYY-MM"

        // In-memory cache for the current month's leaderboard (5 min)
        const cacheKey = `leaderboard:monthly:${month}`;
        const cached = cache.get<any>(cacheKey);
        if (cached) { res.json(cached); return; }

        let rank = await MonthlyRank.findOne({ month }).lean();

        if (!rank) {
            rank = await computeAndSaveRank(month);
        }

        cache.set(cacheKey, rank, 5 * 60_000);
        res.json(rank);
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

/**
 * GET /api/leaderboard/history
 * Returns a list of month keys that have stored snapshots.
 */
router.get('/history', authMiddleware, async (_req: Request, res: Response): Promise<void> => {
    try {
        const months = await MonthlyRank.find({}, { month: 1, computedAt: 1 })
            .sort({ month: -1 })
            .limit(12)
            .lean();
        res.json(months);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

/**
 * POST /api/leaderboard/compute?month=2026-04  (admin only)
 * Forces a re-computation of the leaderboard for the given month.
 */
router.post('/compute', authMiddleware, async (req: any, res: Response): Promise<void> => {
    if (req.user?.role !== 'admin') {
        res.status(403).json({ error: 'Admin only' });
        return;
    }
    const month = (req.query.month as string) ||
        new Date().toISOString().slice(0, 7);
    const rank = await computeAndSaveRank(month, true);
    res.json(rank);
});

// ── Core computation ──────────────────────────────────────────────────────────

async function computeAndSaveRank(month: string, force = false): Promise<any> {
    // Fetch all non-admin users with relevant fields
    const users = await User.find(
        { role: { $in: ['user', 'teacher', 'instructor'] } },
        {
            displayName: 1,
            photoURL: 1,
            points: 1,
            'progress.learningTime': 1,
            'progress.savedNews': 1,
            contributionCount: 1,
            'selectedPath.guidanceId': 1,
            'level.guidance': 1,
        }
    ).lean();

    const scored = users.map((u: any) => {
        const points         = u.points ?? 0;
        const learningTime   = u.progress?.learningTime ?? 0;
        const contributions  = u.contributionCount?.count ?? 0;
        const newsInteract   = (u.progress?.savedNews?.length ?? 0);

        const score = Math.round(
            points * W_POINTS +
            learningTime * W_LEARNING_TIME +
            contributions * W_CONTRIBUTION +
            newsInteract * W_NEWS_INTERACT
        );

        return {
            userId:            u._id,
            displayName:       u.displayName ?? 'Student',
            photoURL:          u.photoURL,
            guidanceId:        u.level?.guidance ?? u.selectedPath?.guidanceId,
            score,
            points,
            learningTime,
            contributionCount: contributions,
            newsInteractions:  newsInteract,
            chatMessages:      0,   // socket-layer data not stored per user; kept for future
            rank:              0,   // filled below
        };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((e, i) => { e.rank = i + 1; });

    // Top 100 only stored
    const top100 = scored.slice(0, 100);

    if (force) {
        await MonthlyRank.findOneAndUpdate(
            { month },
            { month, entries: top100, computedAt: new Date() },
            { upsert: true, new: true }
        );
    } else {
        // Only create if missing
        const existing = await MonthlyRank.findOne({ month });
        if (!existing) {
            await MonthlyRank.create({ month, entries: top100 });
        }
    }

    return { month, entries: top100, computedAt: new Date() };
}

export default router;
