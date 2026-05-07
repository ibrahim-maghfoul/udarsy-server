import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User';
import { TeacherApplication } from '../models/TeacherApplication';
import { TeacherProfile } from '../models/TeacherProfile';
import { TeacherRoom } from '../models/TeacherRoom';
import { TeacherVerification } from '../models/TeacherVerification';
import { Notification } from '../models/Notification';
import fs from 'fs';

// Slugify a teacher display-name for the invite URL
function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '')
        .substring(0, 40) || 'teacher';
}

export class TeacherController {
    // ─── APPLICATION SYSTEM ───

    static applyValidation = [
        body('fullName').notEmpty().trim().isLength({ max: 100 }),
        body('email').isEmail().normalizeEmail(),
        body('age').isInt({ min: 16, max: 80 }),
        body('studyBranch').notEmpty().trim(),
        body('studyLevel').notEmpty().trim(),
        body('specialist').notEmpty().trim(),
        body('currentStand').notEmpty().trim(),
        body('targetLevelId').notEmpty().trim(),
        body('targetGuidanceId').notEmpty().trim(),
        body('targetSubjectId').notEmpty().trim(),
    ];

    /** Submit a teacher application with demo video */
    static async submitApplication(req: AuthRequest, res: Response): Promise<void> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
            if (!req.file) { res.status(400).json({ error: 'Demo video is required' }); return; }

            const existing = await TeacherApplication.findOne({ userId: req.userId, status: 'pending' });
            if (existing) {
                fs.unlink(req.file.path, () => {});
                res.status(400).json({ error: 'You already have a pending application' });
                return;
            }

            const application = await TeacherApplication.create({
                userId: req.userId,
                fullName: req.body.fullName,
                email: req.body.email,
                age: req.body.age,
                studyBranch: req.body.studyBranch,
                studyLevel: req.body.studyLevel,
                specialist: req.body.specialist,
                currentStand: req.body.currentStand,
                targetLevelId: req.body.targetLevelId,
                targetGuidanceId: req.body.targetGuidanceId,
                targetSubjectId: req.body.targetSubjectId,
                videoUrl: req.file.filename,
            });

            res.status(201).json({ message: 'Application submitted successfully', applicationId: application._id });
        } catch (error) {
            console.error('Submit application error:', error);
            res.status(500).json({ error: 'Failed to submit application' });
        }
    }

    static async getMyApplications(req: AuthRequest, res: Response): Promise<void> {
        try {
            const applications = await TeacherApplication.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
            res.json(applications);
        } catch { res.status(500).json({ error: 'Failed to fetch applications' }); }
    }

    static async listApplications(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { status } = req.query;
            const filter: any = {};
            if (status && ['pending', 'approved', 'rejected'].includes(status as string)) filter.status = status;
            const applications = await TeacherApplication.find(filter)
                .populate('userId', 'displayName email photoURL')
                .sort({ createdAt: -1 }).lean();
            res.json(applications);
        } catch { res.status(500).json({ error: 'Failed to fetch applications' }); }
    }

    static async reviewApplication(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { status, reviewNote } = req.body;
            if (!['approved', 'rejected'].includes(status)) { res.status(400).json({ error: 'Status must be approved or rejected' }); return; }

            const application = await TeacherApplication.findById(id);
            if (!application) { res.status(404).json({ error: 'Application not found' }); return; }

            application.status = status;
            application.reviewNote = reviewNote;
            application.reviewedBy = req.userId as any;
            application.reviewedAt = new Date();
            await application.save();

            if (status === 'approved') {
                await User.findByIdAndUpdate(application.userId, { role: 'instructor' });
                const user = await User.findById(application.userId);
                const existingProfile = await TeacherProfile.findOne({ userId: application.userId });
                if (!existingProfile) {
                    await TeacherProfile.create({
                        userId: application.userId,
                        fullName: application.fullName,
                        specialist: application.specialist,
                        schoolName: '',
                        guidanceId: application.targetGuidanceId,
                        subjectId: application.targetSubjectId,
                        photoURL: user?.photoURL,
                        isVerified: true,
                    });
                }
            }

            res.json({ message: `Application ${status}`, application });
        } catch { res.status(500).json({ error: 'Failed to review application' }); }
    }

    static async deleteApplication(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const application = await TeacherApplication.findByIdAndDelete(id);
            if (!application) { res.status(404).json({ error: 'Application not found' }); return; }
            res.json({ message: 'Application deleted' });
        } catch { res.status(500).json({ error: 'Failed to delete application' }); }
    }

    // ─── TEACHER PROFILE SYSTEM ───

    static profileValidation = [
        body('fullName').notEmpty().trim().isLength({ max: 100 }),
        body('specialist').notEmpty().trim(),
        body('schoolName').notEmpty().trim(),
        body('guidanceId').notEmpty().trim(),
        body('subjectId').notEmpty().trim(),
    ];

    static async createOrUpdateProfile(req: AuthRequest, res: Response): Promise<void> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

            const user = await User.findById(req.userId);
            if (!user || (user.role !== 'instructor' && user.role !== 'teacher' && user.role !== 'admin')) {
                res.status(403).json({ error: 'Teacher access required' }); return;
            }

            const profileData = {
                userId: req.userId,
                fullName: req.body.fullName,
                bio: req.body.bio,
                specialist: req.body.specialist,
                schoolName: req.body.schoolName,
                guidanceId: req.body.guidanceId,
                subjectId: req.body.subjectId,
                photoURL: user.photoURL,
            };

            const profile = await TeacherProfile.findOneAndUpdate(
                { userId: req.userId },
                { $set: profileData },
                { upsert: true, new: true, runValidators: true }
            );

            res.json(profile);
        } catch { res.status(500).json({ error: 'Failed to save teacher profile' }); }
    }

    static async getProfile(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const profile = await TeacherProfile.findById(id)
                .populate('userId', 'displayName email photoURL coverPhotoURL')
                .populate('ratings.userId', 'displayName photoURL')
                .lean();
            if (!profile) { res.status(404).json({ error: 'Teacher profile not found' }); return; }
            res.json(profile);
        } catch { res.status(500).json({ error: 'Failed to fetch profile' }); }
    }

    static async getMyProfile(req: AuthRequest, res: Response): Promise<void> {
        try {
            const profile = await TeacherProfile.findOne({ userId: req.userId })
                .populate('userId', 'displayName photoURL coverPhotoURL')
                .populate('ratings.userId', 'displayName photoURL').lean();
            if (!profile) { res.status(404).json({ error: 'No teacher profile found' }); return; }
            res.json(profile);
        } catch { res.status(500).json({ error: 'Failed to fetch profile' }); }
    }

    static async listProfiles(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { guidanceId, subjectId } = req.query;
            const filter: any = { isActive: true };
            if (guidanceId) filter.guidanceId = guidanceId;
            if (subjectId) filter.subjectId = subjectId;
            const profiles = await TeacherProfile.find(filter)
                .populate('userId', 'displayName photoURL')
                .sort({ averageRating: -1 }).lean();
            res.json(profiles);
        } catch { res.status(500).json({ error: 'Failed to fetch profiles' }); }
    }

    static async rateTeacher(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { rating, comment } = req.body;
            if (!rating || rating < 1 || rating > 5) { res.status(400).json({ error: 'Rating must be between 1 and 5' }); return; }

            const profile = await TeacherProfile.findById(id);
            if (!profile) { res.status(404).json({ error: 'Teacher profile not found' }); return; }
            if (profile.userId.toString() === req.userId) { res.status(400).json({ error: 'You cannot rate yourself' }); return; }

            profile.ratings = profile.ratings.filter(r => r.userId.toString() !== req.userId);
            profile.ratings.push({ userId: req.userId as any, rating, comment, createdAt: new Date() });

            const total = profile.ratings.reduce((sum, r) => sum + r.rating, 0);
            profile.averageRating = Math.round((total / profile.ratings.length) * 10) / 10;
            profile.totalRatings = profile.ratings.length;
            await profile.save();

            res.json({ message: 'Rating submitted', averageRating: profile.averageRating, totalRatings: profile.totalRatings });
        } catch { res.status(500).json({ error: 'Failed to rate teacher' }); }
    }

    // ─── TEACHER ROOMS ───

    static roomValidation = [
        body('name').notEmpty().trim().isLength({ max: 100 }),
        body('guidanceId').notEmpty().trim(),
        body('subjectId').notEmpty().trim(),
    ];

    /** Create a teacher room with URL-friendly invite: /room/:teacherSlug/:roomCode */
    static async createRoom(req: AuthRequest, res: Response): Promise<void> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

            const user = await User.findById(req.userId);
            if (!user || (user.role !== 'teacher' && user.role !== 'instructor' && user.role !== 'admin')) {
                res.status(403).json({ error: 'Teacher access required' }); return;
            }

            const teacherProfile = await TeacherProfile.findOne({ userId: req.userId });
            if (!teacherProfile) { res.status(400).json({ error: 'Create a teacher profile first' }); return; }

            const teacherSlug = slugify(user.displayName);

            const room = await TeacherRoom.create({
                teacherId: req.userId,
                teacherProfileId: teacherProfile._id,
                teacherSlug,
                name: req.body.name,
                description: req.body.description,
                guidanceId: req.body.guidanceId,
                subjectId: req.body.subjectId,
                members: [req.userId],
            });

            // Build the share link (frontend will handle the actual URL)
            const inviteLink = `/room/${teacherSlug}/${room.roomCode}`;

            res.status(201).json({ room, roomCode: room.roomCode, inviteLink });
        } catch (error) {
            console.error('Create room error:', error);
            res.status(500).json({ error: 'Failed to create room' });
        }
    }

    /** Student: request to join a teacher room via invite link */
    static async requestJoin(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { teacherSlug, roomCode } = req.params;
            const room = await TeacherRoom.findOne({
                teacherSlug,
                roomCode: roomCode.toUpperCase(),
                isActive: true,
            });

            if (!room) { res.status(404).json({ error: 'Room not found or inactive' }); return; }
            if (room.members.length >= room.maxMembers) { res.status(400).json({ error: 'Room is full' }); return; }

            const userId = req.userId as any;
            if (room.members.includes(userId)) {
                res.json({ message: 'Already a member', room }); return;
            }

            // Check if already requested
            const existing = room.joinRequests.find(r => r.userId.toString() === userId?.toString());
            if (existing?.status === 'pending') {
                res.json({ message: 'Join request already sent, awaiting teacher approval' }); return;
            }
            if (existing?.status === 'accepted') {
                // Add to members if somehow missed
                room.members.push(userId);
                await room.save();
                res.json({ message: 'Joined room', room }); return;
            }

            const user = await User.findById(req.userId);
            room.joinRequests.push({
                userId,
                displayName: user?.displayName ?? 'Student',
                photoURL: user?.photoURL,
                requestedAt: new Date(),
                status: 'pending',
            });
            await room.save();

            // Notify the teacher
            await Notification.create({
                userId: room.teacherId,
                type: 'join_request',
                title: 'New join request',
                body: `${user?.displayName ?? 'A student'} wants to join "${room.name}"`,
                data: { roomId: room._id.toString(), roomName: room.name },
            });

            res.status(201).json({ message: 'Join request sent. Waiting for teacher approval.' });
        } catch (error) {
            console.error('Request join error:', error);
            res.status(500).json({ error: 'Failed to request join' });
        }
    }

    /** Teacher: get all join requests for a room */
    static async getJoinRequests(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const room = await TeacherRoom.findOne({ _id: id, teacherId: req.userId });
            if (!room) { res.status(404).json({ error: 'Room not found or not owned by you' }); return; }

            const pending = room.joinRequests.filter(r => r.status === 'pending');
            res.json(pending);
        } catch { res.status(500).json({ error: 'Failed to fetch join requests' }); }
    }

    /** Teacher: accept or reject a join request */
    static async reviewJoinRequest(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id, userId } = req.params;
            const { action } = req.body; // 'accept' | 'reject'

            if (!['accept', 'reject'].includes(action)) {
                res.status(400).json({ error: 'action must be accept or reject' }); return;
            }

            const room = await TeacherRoom.findOne({ _id: id, teacherId: req.userId });
            if (!room) { res.status(404).json({ error: 'Room not found' }); return; }

            const request = room.joinRequests.find(r => r.userId.toString() === userId);
            if (!request) { res.status(404).json({ error: 'Join request not found' }); return; }

            if (action === 'accept') {
                request.status = 'accepted';
                if (!room.members.includes(userId as any)) {
                    room.members.push(userId as any);
                    await TeacherProfile.findByIdAndUpdate(room.teacherProfileId, { $inc: { totalStudents: 1 } });
                    // Notify the student they were accepted
                    await Notification.create({
                        userId,
                        type: 'room_accepted',
                        title: 'Join request accepted',
                        body: `You've been accepted into "${room.name}"`,
                        data: { roomId: room._id.toString(), roomName: room.name },
                    });
                }
            } else {
                request.status = 'rejected';
                await Notification.create({
                    userId,
                    type: 'room_rejected',
                    title: 'Join request declined',
                    body: `Your request to join "${room.name}" was not accepted.`,
                    data: { roomId: room._id.toString(), roomName: room.name },
                });
            }

            await room.save();
            res.json({ message: `Request ${action}ed`, room });
        } catch (error) {
            console.error('Review join request error:', error);
            res.status(500).json({ error: 'Failed to review join request' });
        }
    }

    /** Legacy: join room via invite code (kept for backward compatibility) */
    static async joinRoom(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { inviteCode } = req.params;
            const room = await TeacherRoom.findOne({ roomCode: inviteCode.toUpperCase(), isActive: true });
            if (!room) { res.status(404).json({ error: 'Room not found or inactive' }); return; }

            const userId = req.userId as any;
            if (room.members.includes(userId)) {
                res.json({ message: 'Already a member', room }); return;
            }

            const user = await User.findById(req.userId);
            room.joinRequests.push({
                userId,
                displayName: user?.displayName ?? 'Student',
                photoURL: user?.photoURL,
                requestedAt: new Date(),
                status: 'pending',
            });
            await room.save();

            // Notify the teacher
            await Notification.create({
                userId: room.teacherId,
                type: 'join_request',
                title: 'New join request',
                body: `${user?.displayName ?? 'A student'} wants to join "${room.name}"`,
                data: { roomId: room._id.toString(), roomName: room.name },
            });

            res.status(201).json({ message: 'Join request sent. Waiting for teacher approval.' });
        } catch { res.status(500).json({ error: 'Failed to join room' }); }
    }

    static async getMyRooms(req: AuthRequest, res: Response): Promise<void> {
        try {
            const rooms = await TeacherRoom.find({ teacherId: req.userId, isActive: true })
                .populate('members', 'displayName photoURL')
                .sort({ createdAt: -1 }).lean();
            res.json(rooms);
        } catch { res.status(500).json({ error: 'Failed to fetch rooms' }); }
    }

    static async getJoinedRooms(req: AuthRequest, res: Response): Promise<void> {
        try {
            const rooms = await TeacherRoom.find({ members: req.userId, isActive: true })
                .populate('teacherId', 'displayName photoURL')
                .populate('teacherProfileId', 'fullName specialist averageRating')
                .sort({ lastMessageAt: -1 }).lean();
            res.json(rooms);
        } catch { res.status(500).json({ error: 'Failed to fetch joined rooms' }); }
    }

    static async getRoom(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const room = await TeacherRoom.findById(id)
                .populate('teacherId', 'displayName photoURL role')
                .populate('teacherProfileId', 'fullName specialist averageRating')
                .populate('members', 'displayName photoURL')
                .lean();
            if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
            res.json(room);
        } catch { res.status(500).json({ error: 'Failed to fetch room' }); }
    }

    /** Resolve room by roomCode only (used by /teacher/join/:code share links) */
    static async getRoomByCode(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { roomCode } = req.params;
            const room = await TeacherRoom.findOne({
                roomCode: roomCode.toUpperCase(),
                isActive: true,
            })
                .populate('teacherId', 'displayName photoURL role')
                .populate('teacherProfileId', 'fullName specialist')
                .lean();
            if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
            res.json(room);
        } catch { res.status(500).json({ error: 'Failed to fetch room' }); }
    }

    /** Resolve room by teacherSlug + roomCode (used when opening share link) */
    static async getRoomByLink(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { teacherSlug, roomCode } = req.params;
            const room = await TeacherRoom.findOne({
                teacherSlug,
                roomCode: roomCode.toUpperCase(),
                isActive: true,
            })
                .populate('teacherId', 'displayName photoURL role')
                .populate('teacherProfileId', 'fullName specialist')
                .lean();
            if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
            res.json(room);
        } catch { res.status(500).json({ error: 'Failed to fetch room' }); }
    }

    static async deleteRoom(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const room = await TeacherRoom.findOne({ _id: id, teacherId: req.userId });
            if (!room) { res.status(404).json({ error: 'Room not found or not owned by you' }); return; }
            room.isActive = false;
            await room.save();
            res.json({ message: 'Room deactivated' });
        } catch { res.status(500).json({ error: 'Failed to delete room' }); }
    }

    // ─── TEACHER VERIFICATION ───

    static async submitVerification(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user) {
                if (req.file) fs.unlink(req.file.path, () => {});
                res.status(404).json({ error: 'User not found' }); return;
            }
            if (!req.file) { res.status(400).json({ error: 'Verification document is required' }); return; }

            const { schoolName, city, classLevel, className, subject, contactInfo, position, documentType } = req.body;
            if (!schoolName || !city || !classLevel || !subject || !contactInfo || !position || !documentType) {
                fs.unlink(req.file.path, () => {});
                res.status(400).json({ error: 'schoolName, city, classLevel, position, and documentType are required' }); return;
            }

            const allowed = ['id_card', 'certificate', 'school_letter', 'other'];
            if (!allowed.includes(documentType)) {
                fs.unlink(req.file.path, () => {});
                res.status(400).json({ error: 'Invalid documentType' }); return;
            }

            const existing = await TeacherVerification.findOne({ userId: req.userId });
            const cwdNorm = process.cwd().replace(/\\/g, '/');
            const fullNorm = req.file.path.replace(/\\/g, '/');
            const dataIdx = fullNorm.indexOf('/data/');
            const relativePath = dataIdx >= 0 ? fullNorm.slice(dataIdx + 1) : fullNorm.replace(cwdNorm + '/', '');

            if (existing) {
                if (existing.status === 'pending') {
                    fs.unlink(req.file.path, () => {});
                    res.status(409).json({ error: 'You already have a pending verification request' }); return;
                }
                if (existing.status === 'approved') {
                    fs.unlink(req.file.path, () => {});
                    res.status(409).json({ error: 'Already verified' }); return;
                }
                if (existing.documentUrl) fs.unlink(existing.documentUrl, () => {});
                existing.schoolName = schoolName.trim();
                existing.city = city.trim();
                existing.classLevel = classLevel.trim();
                existing.className = className?.trim();
                existing.subject = subject.trim();
                existing.contactInfo = contactInfo.trim();
                existing.position = position.trim();
                existing.documentUrl = relativePath;
                existing.documentType = documentType;
                existing.status = 'pending';
                existing.reviewNote = undefined;
                await existing.save();
                res.json({ message: 'Verification resubmitted', verification: existing }); return;
            }

            const verification = await TeacherVerification.create({
                userId: req.userId,
                schoolName: schoolName.trim(),
                city: city.trim(),
                classLevel: classLevel.trim(),
                className: className?.trim(),
                position: position.trim(),
                subject: subject.trim(),
                contactInfo: contactInfo.trim(),
                documentUrl: relativePath,
                documentType,
            });

            res.status(201).json({ message: 'Verification submitted', verification });
        } catch (error) {
            if (req.file) fs.unlink(req.file.path, () => {});
            res.status(500).json({ error: 'Failed to submit verification' });
        }
    }

    static async getMyVerification(req: AuthRequest, res: Response): Promise<void> {
        try {
            const verification = await TeacherVerification.findOne({ userId: req.userId }).lean();
            res.json(verification || null);
        } catch { res.status(500).json({ error: 'Failed to fetch verification' }); }
    }

    static async listVerifications(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { status } = req.query;
            const filter: any = {};
            if (status && ['pending', 'approved', 'rejected'].includes(status as string)) filter.status = status;
            const verifications = await TeacherVerification.find(filter)
                .populate('userId', 'displayName email photoURL')
                .sort({ createdAt: -1 }).lean();
            res.json(verifications);
        } catch { res.status(500).json({ error: 'Failed to fetch verifications' }); }
    }

    static async reviewVerification(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { status, reviewNote } = req.body;
            if (!['approved', 'rejected'].includes(status)) { res.status(400).json({ error: 'Status must be approved or rejected' }); return; }

            const verification = await TeacherVerification.findById(id);
            if (!verification) { res.status(404).json({ error: 'Verification not found' }); return; }

            verification.status = status;
            verification.reviewNote = reviewNote;
            verification.reviewedBy = req.userId as any;
            verification.reviewedAt = new Date();
            await verification.save();

            if (status === 'approved') {
                const user = await User.findById(verification.userId);
                if (user && user.role !== 'instructor') { user.role = 'teacher'; await user.save(); }

                try {
                    const existingProfile = await TeacherProfile.findOne({ userId: verification.userId });
                    if (!existingProfile) {
                        await TeacherProfile.create({
                            userId: verification.userId,
                            fullName: user?.displayName || '',
                            specialist: verification.subject,
                            schoolName: verification.schoolName,
                            guidanceId: 'unassigned',
                            subjectId: 'unassigned',
                            isVerified: true,
                        });
                    }
                } catch (profileErr) {
                    console.error('Teacher profile creation failed (non-critical):', profileErr);
                }
            }

            res.json({ message: `Verification ${status}`, verification });
        } catch (error) {
            console.error('Review verification error:', error);
            res.status(500).json({ error: 'Failed to review verification' });
        }
    }

    static async listAllTeacherRooms(_req: AuthRequest, res: Response): Promise<void> {
        try {
            const rooms = await TeacherRoom.find({})
                .populate('teacherId', 'displayName email photoURL')
                .sort({ createdAt: -1 })
                .lean();
            res.json(rooms);
        } catch { res.status(500).json({ error: 'Failed to fetch teacher rooms' }); }
    }

    static async deleteTeacherRoom(req: AuthRequest, res: Response): Promise<void> {
        try {
            const room = await TeacherRoom.findByIdAndDelete(req.params.id);
            if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
            res.json({ message: 'Room deleted' });
        } catch { res.status(500).json({ error: 'Failed to delete room' }); }
    }

    static async deleteVerification(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const verification = await TeacherVerification.findByIdAndDelete(id);
            if (!verification) { res.status(404).json({ error: 'Verification not found' }); return; }
            res.json({ message: 'Verification deleted' });
        } catch { res.status(500).json({ error: 'Failed to delete verification' }); }
    }
}
