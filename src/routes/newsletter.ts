import { Router, Request, Response } from 'express';
import { Newsletter } from '../models/Newsletter';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// POST /api/newsletter/subscribe
router.post('/subscribe', async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400).json({ error: 'A valid email address is required' });
            return;
        }

        // Check if already subscribed
        const existing = await Newsletter.findOne({ email: email.toLowerCase() });
        if (existing) {
            res.status(200).json({ message: 'Already subscribed', alreadySubscribed: true });
            return;
        }

        const subscription = new Newsletter({ email: email.toLowerCase() });
        await subscription.save();

        res.status(201).json({ message: 'Successfully subscribed', email: subscription.email });
    } catch (error) {
        console.error('Newsletter subscription error:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// GET /api/newsletter/subscribers (admin only)
router.get('/subscribers', authMiddleware, adminMiddleware, async (_req: Request, res: Response) => {
    try {
        const count = await Newsletter.countDocuments();
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get subscribers' });
    }
});

export default router;
