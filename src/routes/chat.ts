import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import Message from '../models/Message';
import ChatRoom from '../models/ChatRoom';
import { UserReport } from '../models/UserReport';
import { User } from '../models/User';

const router = express.Router();

// Admin: Get all chat rooms
router.get('/rooms', authMiddleware, adminMiddleware, async (_req: express.Request, res: express.Response): Promise<void> => {
    try {
        const rooms = await ChatRoom.find({}).sort({ lastMessageAt: -1, createdAt: -1 });
        const withCounts = await Promise.all(rooms.map(async (room) => {
            const messageCount = await Message.countDocuments({ chatRoomId: room._id });
            return { ...room.toObject(), messageCount };
        }));
        res.json(withCounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get rooms' });
    }
});

// Admin: Delete a chat room and its messages
router.delete('/rooms/:id', authMiddleware, adminMiddleware, async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const room = await ChatRoom.findByIdAndDelete(req.params.id);
        if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
        await Message.deleteMany({ chatRoomId: req.params.id });
        res.json({ message: 'Room deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete room' });
    }
});

// Get chat history for a specific room (resolved by guidance + level)
router.get('/history', authMiddleware, async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { guidance, level } = req.query;

        if (!guidance || !level) {
            res.status(400).json({ error: 'Guidance and level are required' });
            return;
        }

        const roomKey = `${guidance}_${level}`;

        // Find or create the ChatRoom metadata document
        let chatRoom = await ChatRoom.findOne({ roomKey });
        if (!chatRoom) {
            chatRoom = await ChatRoom.create({
                guidance,
                level,
                roomKey: roomKey,
                participants: []
            });
        }

        const messages = await Message.find({ chatRoomId: chatRoom._id })
            .sort({ createdAt: -1 }) // Get newest first
            .limit(50)
            .populate('sender', 'displayName photoURL subscription.plan')
            .populate({
                path: 'replyTo',
                select: 'text sender',
                populate: { path: 'sender', select: '_id displayName subscription.plan' }
            });

        // Reverse to send oldest first (chronological order for the UI)
        res.json(messages.reverse());
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ error: 'Server error fetching chat history' });
    }
});

// Admin: Get all user reports (with optional status filter)
router.get('/reports', authMiddleware, adminMiddleware, async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const status = req.query.status as string | undefined;
        const query: any = {};
        if (status && ['pending', 'resolved', 'dismissed'].includes(status)) query.status = status;
        const reports = await UserReport.find(query)
            .sort({ createdAt: -1 })
            .populate('reporterId', 'displayName email photoURL')
            .populate('reportedUserId', 'displayName email photoURL chatMutedUntil')
            .populate({
                path: 'messageId',
                select: 'text createdAt chatRoomId',
                populate: { path: 'chatRoomId', select: 'guidance level roomKey' }
            })
            .lean();

        // Attach per-message report count
        const messageIds = reports.map((r: any) => r.messageId?._id).filter(Boolean);
        const counts = await UserReport.aggregate([
            { $match: { messageId: { $in: messageIds } } },
            { $group: { _id: '$messageId', count: { $sum: 1 } } }
        ]);
        const countMap = new Map(counts.map((c: any) => [c._id.toString(), c.count]));
        const result = reports.map((r: any) => ({
            ...r,
            messageReportCount: r.messageId?._id ? (countMap.get(r.messageId._id.toString()) ?? 1) : 1,
        }));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get reports' });
    }
});

// Admin: Update report status
router.patch('/reports/:id/status', authMiddleware, adminMiddleware, async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { status } = req.body;
        if (!['pending', 'resolved', 'dismissed'].includes(status)) {
            res.status(400).json({ error: 'Invalid status' }); return;
        }
        const report = await UserReport.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!report) { res.status(404).json({ error: 'Report not found' }); return; }
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update report' });
    }
});

// Admin: Delete a report
router.delete('/reports/:id', authMiddleware, adminMiddleware, async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const report = await UserReport.findByIdAndDelete(req.params.id);
        if (!report) { res.status(404).json({ error: 'Report not found' }); return; }
        res.json({ message: 'Report deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

// Report a user/message in chat
router.post('/report', authMiddleware, async (req: any, res: express.Response): Promise<void> => {
    try {
        const { reportedUserId, messageId, reason, details } = req.body;
        const reporterId = req.userId;

        if (!reportedUserId || !reason || !details) {
            res.status(400).json({ error: 'Reported user, reason, and details are required' });
            return;
        }

        const report = await UserReport.create({
            reporterId,
            reportedUserId,
            messageId,
            reason,
            details,
            status: 'pending'
        });

        res.status(201).json({ message: 'Report submitted successfully', reportId: report._id });
    } catch (error) {
        console.error('Error submitting report:', error);
        res.status(500).json({ error: 'Server error submitting report' });
    }
});

// Admin: Mute a user from chat for N hours
router.post('/mute/:userId', authMiddleware, adminMiddleware, async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { hours } = req.body;
        if (!hours || typeof hours !== 'number' || hours <= 0) {
            res.status(400).json({ error: 'hours must be a positive number' }); return;
        }
        const until = new Date(Date.now() + hours * 60 * 60 * 1000);
        const user = await User.findByIdAndUpdate(req.params.userId, { chatMutedUntil: until }, { new: true }).select('displayName chatMutedUntil');
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }
        res.json({ message: 'User muted', until, user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mute user' });
    }
});

// Admin: Unmute a user
router.delete('/mute/:userId', authMiddleware, adminMiddleware, async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const user = await User.findByIdAndUpdate(req.params.userId, { $unset: { chatMutedUntil: 1 } }, { new: true }).select('displayName chatMutedUntil');
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }
        res.json({ message: 'User unmuted', user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unmute user' });
    }
});

export default router;
