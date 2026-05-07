import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { Notification } from '../models/Notification';

const router = Router();

// GET /api/notifications — user's notifications (unread first, last 50)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const notifications = await Notification.find({ userId: req.userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        res.json(notifications);
    } catch {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch('/:id/read', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Notification.updateOne({ _id: req.params.id, userId: req.userId }, { read: true });
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        await Notification.updateMany({ userId: req.userId, read: false }, { read: true });
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

export default router;
