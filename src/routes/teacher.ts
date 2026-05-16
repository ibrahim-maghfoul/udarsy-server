import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { TeacherController } from '../controllers/teacherController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { videoUpload, verificationUpload, processVerificationDoc, roomFileUpload } from '../middleware/upload';
import { TeacherRoomMessage } from '../models/TeacherRoomMessage';
import { TeacherRoom } from '../models/TeacherRoom';
import { deleteFromR2, r2Url } from '../config/r2';

const router = Router();

// ─── APPLICATION SYSTEM ───
router.post('/apply', authMiddleware, videoUpload.single('video'),
    TeacherController.applyValidation, TeacherController.submitApplication);
router.get('/applications/me', authMiddleware, TeacherController.getMyApplications);
router.get('/applications', authMiddleware, adminMiddleware, TeacherController.listApplications);
router.patch('/applications/:id/review', authMiddleware, adminMiddleware, TeacherController.reviewApplication);
router.delete('/applications/:id', authMiddleware, adminMiddleware, TeacherController.deleteApplication);

// ─── TEACHER VERIFICATION ───
router.post('/verify', authMiddleware, verificationUpload.single('document'), processVerificationDoc, TeacherController.submitVerification);
router.get('/verify/me', authMiddleware, TeacherController.getMyVerification);
router.get('/verifications', authMiddleware, adminMiddleware, TeacherController.listVerifications);
router.patch('/verifications/:id/review', authMiddleware, adminMiddleware, TeacherController.reviewVerification);
router.delete('/verifications/:id', authMiddleware, adminMiddleware, TeacherController.deleteVerification);

// ─── ADMIN ───
router.get('/rooms/admin/all', authMiddleware, adminMiddleware, TeacherController.listAllTeacherRooms);
router.delete('/rooms/admin/:id', authMiddleware, adminMiddleware, TeacherController.deleteTeacherRoom);

// ─── TEACHER PROFILES ───
router.get('/profiles', TeacherController.listProfiles);
router.get('/profiles/:id', TeacherController.getProfile);
router.get('/profile/me', authMiddleware, TeacherController.getMyProfile);
router.put('/profile', authMiddleware, TeacherController.profileValidation, TeacherController.createOrUpdateProfile);
router.post('/profiles/:id/rate', authMiddleware, TeacherController.rateTeacher);

// ─── TEACHER ROOMS ───
// Teacher: create a room
router.post('/rooms', authMiddleware, TeacherController.roomValidation, TeacherController.createRoom);

// Teacher: get my rooms
router.get('/rooms/me', authMiddleware, TeacherController.getMyRooms);

// Student: get rooms I'm a member of
router.get('/rooms/joined', authMiddleware, TeacherController.getJoinedRooms);

// Resolve room by code only  (GET /api/teacher/rooms/code/:roomCode)
router.get('/rooms/code/:roomCode', TeacherController.getRoomByCode);

// Resolve room by invite link slug + code  (GET /api/teacher/rooms/link/:teacherSlug/:roomCode)
router.get('/rooms/link/:teacherSlug/:roomCode', authMiddleware, TeacherController.getRoomByLink);

// Get specific room by ID
router.get('/rooms/:id', authMiddleware, TeacherController.getRoom);

// Teacher: deactivate room
router.delete('/rooms/:id', authMiddleware, TeacherController.deleteRoom);

// ─── JOIN REQUEST SYSTEM ───
// Student: request to join via link  (POST /api/teacher/rooms/join/:teacherSlug/:roomCode)
router.post('/rooms/join/:teacherSlug/:roomCode', authMiddleware, TeacherController.requestJoin);

// Legacy: join by invite code only
router.post('/rooms/join-code/:inviteCode', authMiddleware, TeacherController.joinRoom);

// Teacher: list pending join requests for a room
router.get('/rooms/:id/requests', authMiddleware, TeacherController.getJoinRequests);

// Teacher: accept or reject a join request
router.patch('/rooms/:id/requests/:userId', authMiddleware, TeacherController.reviewJoinRequest);

// ─── ROOM RATINGS ────────────────────────────────────────────────────────────

// Public: get rooms for a teacher profile (for public profile page)
router.get('/profiles/:id/rooms', async (req: any, res: Response): Promise<void> => {
    try {
        const rooms = await TeacherRoom.find({ teacherProfileId: req.params.id, isActive: true })
            .select('name description guidanceId subjectId members averageRating totalRatings roomCode teacherSlug')
            .lean();
        res.json(rooms);
    } catch { res.status(500).json({ error: 'Failed to fetch rooms' }); }
});

// Member: rate a teacher room (1-5 stars)
router.post('/rooms/:id/rate', authMiddleware, async (req: any, res: Response): Promise<void> => {
    try {
        const { rating } = req.body;
        if (!rating || rating < 1 || rating > 5) { res.status(400).json({ error: 'Rating must be 1–5' }); return; }

        const room = await TeacherRoom.findById(req.params.id);
        if (!room) { res.status(404).json({ error: 'Room not found' }); return; }

        const isMember = room.members.some((m: any) => m.toString() === req.userId);
        if (!isMember) { res.status(403).json({ error: 'Only room members can rate' }); return; }
        if (room.teacherId.toString() === req.userId) { res.status(400).json({ error: 'Cannot rate your own room' }); return; }

        room.ratings = room.ratings.filter((r: any) => r.userId.toString() !== req.userId) as any;
        room.ratings.push({ userId: req.userId as any, rating, createdAt: new Date() } as any);

        const total = room.ratings.reduce((s: number, r: any) => s + r.rating, 0);
        room.averageRating = Math.round((total / room.ratings.length) * 10) / 10;
        room.totalRatings = room.ratings.length;
        await room.save();

        res.json({ averageRating: room.averageRating, totalRatings: room.totalRatings });
    } catch (err) {
        res.status(500).json({ error: 'Failed to rate room' });
    }
});

// ─── TEACHER ROOM MESSAGES ────────────────────────────────────────────────────

// Get message history for a teacher room
router.get('/rooms/:id/messages', authMiddleware, async (req: any, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const room = await TeacherRoom.findById(id);
        if (!room) { res.status(404).json({ error: 'Room not found' }); return; }

        // Check membership
        const isMember = room.members.some((m: any) => m.toString() === req.userId?.toString());
        const isTeacher = room.teacherId.toString() === req.userId?.toString();
        if (!isMember && !isTeacher) {
            res.status(403).json({ error: 'Not a member of this room' }); return;
        }

        // Single aggregation pipeline replaces N+1 populate() calls
        const messages = await TeacherRoomMessage.aggregate([
            { $match: { roomId: new mongoose.Types.ObjectId(id) } },
            { $sort: { createdAt: -1 } },
            { $limit: 50 },
            { $lookup: {
                from: 'users', localField: 'sender', foreignField: '_id', as: '_sender',
                pipeline: [{ $project: { displayName: 1, photoURL: 1, role: 1, 'subscription.plan': 1 } }],
            }},
            { $addFields: { sender: { $arrayElemAt: ['$_sender', 0] } } },
            { $lookup: {
                from: 'teacherroommessages', localField: 'replyTo', foreignField: '_id', as: '_replyTo',
                pipeline: [
                    { $lookup: {
                        from: 'users', localField: 'sender', foreignField: '_id', as: '_s',
                        pipeline: [{ $project: { _id: 1, displayName: 1 } }],
                    }},
                    { $addFields: { sender: { $arrayElemAt: ['$_s', 0] } } },
                    { $project: { text: 1, sender: 1 } },
                ],
            }},
            { $addFields: { replyTo: { $arrayElemAt: ['$_replyTo', 0] } } },
            { $project: { _sender: 0, _replyTo: 0 } },
        ]);

        res.json(messages.reverse());
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Teacher: upload file to a room
router.post('/rooms/:id/upload', authMiddleware, roomFileUpload.single('file'), async (req: any, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const room = await TeacherRoom.findById(id);
        if (!room) { res.status(404).json({ error: 'Room not found' }); return; }

        // Only teacher of this room can upload
        if (room.teacherId.toString() !== req.userId?.toString()) {
            if (req.file) await deleteFromR2((req.file as any).key);
            res.status(403).json({ error: 'Only the room teacher can upload files' }); return;
        }

        if (!req.file) { res.status(400).json({ error: 'File is required' }); return; }

        const msg = await TeacherRoomMessage.create({
            roomId: id,
            sender: req.userId,
            messageType: 'file',
            fileUrl: r2Url((req.file as any).key),
            fileName: req.file.originalname,
            fileSize: req.file.size,
        });

        room.lastMessagePreview = `📎 ${req.file.originalname}`;
        room.lastMessageAt = new Date();
        await room.save();

        const populated = await TeacherRoomMessage.findById(msg._id)
            .populate('sender', 'displayName photoURL role');

        res.status(201).json(populated);
    } catch (err) {
        if (req.file) await deleteFromR2((req.file as any).key);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

export default router;

