import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User';
import { TeacherApplication } from '../models/TeacherApplication';
import { InstructorCourse } from '../models/InstructorCourse';
import { InstructorRating } from '../models/InstructorRating';
import path from 'path';
import { deleteFromR2, r2Url } from '../config/r2';

export class InstructorController {
    // ─── COURSE MANAGEMENT ───

    static courseValidation = [
        body('title').notEmpty().trim().isLength({ min: 3, max: 200 }),
        body('description').optional().trim().isLength({ max: 1000 }),
        body('guidanceId').notEmpty().trim(),
        body('subjectId').notEmpty().trim(),
    ];

    /** Upload a course (video or PDF) for instructor */
    static async uploadCourse(req: AuthRequest, res: Response): Promise<void> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ errors: errors.array() });
                return;
            }

            const user = await User.findById(req.userId);
            if (!user || user.role !== 'instructor') {
                res.status(403).json({ error: 'Instructor access required' });
                return;
            }

            if (!req.file) {
                res.status(400).json({ error: 'Course file (video or PDF) is required' });
                return;
            }

            const courseData: any = {
                instructorId: req.userId,
                title: req.body.title,
                description: req.body.description,
                guidanceId: req.body.guidanceId,
                subjectId: req.body.subjectId,
            };

            const ext = path.extname(req.file.originalname).toLowerCase();
            const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext);
            const isPdf = ext === '.pdf';
            const fileUrl = r2Url((req.file as any).key);

            if (isVideo) {
                courseData.videoUrl = fileUrl;
            } else if (isPdf) {
                courseData.pdfUrl = fileUrl;
            } else {
                await deleteFromR2((req.file as any).key);
                res.status(400).json({ error: 'Invalid file type. Use video (MP4, WebM, MOV, AVI, MKV) or PDF' });
                return;
            }

            const course = await InstructorCourse.create(courseData);
            res.status(201).json({ message: 'Course uploaded successfully', course });
        } catch (error) {
            if (req.file) await deleteFromR2((req.file as any).key);
            res.status(500).json({ error: 'Failed to upload course' });
        }
    }

    /** Get all courses for an instructor (by instructor user ID) */
    static async getInstructorCourses(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { instructorId } = req.params;
            const { guidanceId, subjectId } = req.query;

            const filter: any = { instructorId };
            if (guidanceId) filter.guidanceId = guidanceId;
            if (subjectId) filter.subjectId = subjectId;

            const courses = await InstructorCourse.find(filter)
                .sort({ createdAt: -1 })
                .lean();

            res.json(courses);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch courses' });
        }
    }

    /** Get my courses */
    static async getMyCourses(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user || user.role !== 'instructor') {
                res.status(403).json({ error: 'Instructor access required' });
                return;
            }

            const courses = await InstructorCourse.find({ instructorId: req.userId })
                .sort({ createdAt: -1 })
                .lean();

            res.json(courses);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch courses' });
        }
    }

    /** Get a single course */
    static async getCourse(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const course = await InstructorCourse.findById(id).lean();

            if (!course) {
                res.status(404).json({ error: 'Course not found' });
                return;
            }

            res.json(course);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch course' });
        }
    }

    /** Delete a course (instructor only) */
    static async deleteCourse(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const course = await InstructorCourse.findOne({ _id: id, instructorId: req.userId });

            if (!course) {
                res.status(404).json({ error: 'Course not found or not owned by you' });
                return;
            }

            if (course.videoUrl) await deleteFromR2(course.videoUrl);
            if (course.pdfUrl) await deleteFromR2(course.pdfUrl);

            await InstructorCourse.findByIdAndDelete(id);
            res.json({ message: 'Course deleted' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete course' });
        }
    }

    // ─── ADMIN COURSE MANAGEMENT ───

    /** Admin: get all instructor courses with instructor info, filterable */
    static async adminGetAllCourses(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { guidanceId, subjectId } = req.query as { guidanceId?: string; subjectId?: string };
            const filter: any = {};
            if (guidanceId) filter.guidanceId = guidanceId;
            if (subjectId) filter.subjectId = subjectId;

            const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 500);
            const courses = await InstructorCourse.find(filter)
                .populate('instructorId', 'displayName email photoURL')
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();

            res.json(courses);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch courses' });
        }
    }

    /** Admin: update any course title/description */
    static async adminUpdateCourse(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { title, description, guidanceId, subjectId } = req.body;
            const course = await InstructorCourse.findByIdAndUpdate(
                req.params.id,
                { ...(title && { title }), ...(description !== undefined && { description }), ...(guidanceId && { guidanceId }), ...(subjectId && { subjectId }) },
                { new: true }
            ).populate('instructorId', 'displayName email photoURL');
            if (!course) { res.status(404).json({ error: 'Course not found' }); return; }
            res.json(course);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update course' });
        }
    }

    /** Admin: delete any course */
    static async adminDeleteCourse(req: AuthRequest, res: Response): Promise<void> {
        try {
            const course = await InstructorCourse.findByIdAndDelete(req.params.id);
            if (!course) { res.status(404).json({ error: 'Course not found' }); return; }
            if (course.videoUrl) await deleteFromR2(course.videoUrl);
            if (course.pdfUrl) await deleteFromR2(course.pdfUrl);
            res.json({ message: 'Course deleted' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete course' });
        }
    }

    /** Increment view count on a course */
    static async trackView(req: AuthRequest, res: Response): Promise<void> {
        try {
            await InstructorCourse.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
            res.json({ ok: true });
        } catch {
            res.status(500).json({ error: 'Failed to track view' });
        }
    }

    /** Increment download count on a course */
    static async trackDownload(req: AuthRequest, res: Response): Promise<void> {
        try {
            await InstructorCourse.findByIdAndUpdate(req.params.id, { $inc: { downloadCount: 1 } });
            res.json({ ok: true });
        } catch {
            res.status(500).json({ error: 'Failed to track download' });
        }
    }

    // ─── PROFILE PHOTOS ───

    /** Update instructor profile photo */
    static async updateProfilePhoto(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user || user.role !== 'instructor') {
                if (req.file) await deleteFromR2((req.file as any).key);
                res.status(403).json({ error: 'Instructor access required' });
                return;
            }
            if (!req.file) {
                res.status(400).json({ error: 'Photo file is required' });
                return;
            }

            if (user.photoURL) await deleteFromR2(user.photoURL);
            if (user.photoURLOriginal) await deleteFromR2(user.photoURLOriginal);

            user.photoURL         = r2Url((req.file as any).key);
            user.photoURLOriginal = r2Url((req.file as any).originalKey);
            await user.save();
            res.json({ photoURL: user.photoURL, photoURLOriginal: user.photoURLOriginal });
        } catch (error) {
            if (req.file) await deleteFromR2((req.file as any).key);
            res.status(500).json({ error: 'Failed to update profile photo' });
        }
    }

    /** Update instructor cover photo */
    static async updateCoverPhoto(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user || user.role !== 'instructor') {
                if (req.file) await deleteFromR2((req.file as any).key);
                res.status(403).json({ error: 'Instructor access required' });
                return;
            }
            if (!req.file) {
                res.status(400).json({ error: 'Cover photo file is required' });
                return;
            }

            if (user.coverPhotoURL) await deleteFromR2(user.coverPhotoURL);
            if (user.coverPhotoURLOriginal) await deleteFromR2(user.coverPhotoURLOriginal);

            user.coverPhotoURL         = r2Url((req.file as any).key);
            user.coverPhotoURLOriginal = r2Url((req.file as any).originalKey);
            await user.save();
            res.json({ coverPhotoURL: user.coverPhotoURL, coverPhotoURLOriginal: user.coverPhotoURLOriginal });
        } catch (error) {
            if (req.file) await deleteFromR2((req.file as any).key);
            res.status(500).json({ error: 'Failed to update cover photo' });
        }
    }

    // ─── RATINGS ───

    /** Submit or update a rating (pro users only, one per user per instructor) */
    static async submitRating(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { instructorId } = req.params;
            const { rating, feedback } = req.body;

            if (!rating || Number(rating) < 1 || Number(rating) > 5) {
                res.status(400).json({ error: 'Rating must be between 1 and 5' });
                return;
            }

            const reviewer = await User.findById(req.userId);
            if (!reviewer) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            const instructor = await User.findById(instructorId);
            if (!instructor || instructor.role !== 'instructor') {
                res.status(404).json({ error: 'Instructor not found' });
                return;
            }

            if (req.userId?.toString() === instructorId) {
                res.status(400).json({ error: 'You cannot rate yourself' });
                return;
            }

            const result = await InstructorRating.findOneAndUpdate(
                { userId: req.userId, instructorId },
                { rating: Number(rating), feedback: feedback?.trim() || undefined },
                { upsert: true, new: true }
            );

            res.json({ message: 'Rating submitted', rating: result });
        } catch (error) {
            res.status(500).json({ error: 'Failed to submit rating' });
        }
    }

    /** Get all ratings for an instructor (public, paginated) */
    static async getRatings(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { instructorId } = req.params;
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
            const skip = (page - 1) * limit;

            // Get aggregate stats in parallel with paginated ratings
            const [ratings, statsResult] = await Promise.all([
                InstructorRating.find({ instructorId })
                    .populate('userId', 'displayName photoURL')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                InstructorRating.aggregate([
                    { $match: { instructorId: new mongoose.Types.ObjectId(instructorId) } },
                    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
                ]),
            ]);

            const stats = statsResult[0];
            const total = stats?.count || 0;
            const avg = stats ? Math.round(stats.avg * 10) / 10 : 0;

            res.json({ ratings, averageRating: avg, totalRatings: total, page, pages: Math.ceil(total / limit) });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch ratings' });
        }
    }

    // ─── INSTRUCTOR PROFILES & BROWSE ───

    /** List all approved instructors (public browse) — single aggregation, no N+1 */
    static async listInstructors(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { guidanceId, subjectId } = req.query;

            // Build course match filter
            const courseMatch: any = {};
            if (guidanceId) courseMatch.guidanceId = guidanceId as string;
            if (subjectId) courseMatch.subjectId = subjectId as string;

            const users = await User.find({ role: 'instructor' })
                .select('_id displayName photoURL coverPhotoURL')
                .lean();

            if (users.length === 0) { res.json([]); return; }

            const userIds = users.map(u => u._id);

            // Batch: count courses per instructor
            const [courseCounts, ratingStats] = await Promise.all([
                InstructorCourse.aggregate([
                    { $match: { instructorId: { $in: userIds }, ...courseMatch } },
                    { $group: { _id: '$instructorId', count: { $sum: 1 } } },
                ]),
                InstructorRating.aggregate([
                    { $match: { instructorId: { $in: userIds } } },
                    { $group: { _id: '$instructorId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
                ]),
            ]);

            const courseMap = new Map(courseCounts.map((c: any) => [String(c._id), c.count]));
            const ratingMap = new Map(ratingStats.map((r: any) => [String(r._id), r]));

            const result = users.map(user => {
                const r = ratingMap.get(String(user._id));
                return {
                    ...user,
                    courseCount: courseMap.get(String(user._id)) || 0,
                    averageRating: r ? Math.round(r.avg * 10) / 10 : 0,
                    totalRatings: r?.count || 0,
                };
            });

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch instructors' });
        }
    }

    /** Get instructor profile with courses and rating summary */
    static async getInstructorProfile(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { instructorId } = req.params;

            const user = await User.findById(instructorId)
                .select('_id displayName photoURL coverPhotoURL role')
                .lean();

            if (!user || user.role !== 'instructor') {
                res.status(404).json({ error: 'Instructor not found' });
                return;
            }

            const [application, courses, ratingData] = await Promise.all([
                TeacherApplication.findOne({ userId: instructorId })
                    .select('fullName specialist targetGuidanceId targetSubjectId')
                    .lean(),
                InstructorCourse.find({ instructorId })
                    .sort({ createdAt: -1 })
                    .lean(),
                InstructorRating.aggregate([
                    { $match: { instructorId: user._id } },
                    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
                ]),
            ]);

            res.json({
                user,
                profile: application,
                courses,
                courseCount: courses.length,
                averageRating: ratingData[0] ? Math.round(ratingData[0].avg * 10) / 10 : 0,
                totalRatings: ratingData[0]?.count || 0,
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch instructor profile' });
        }
    }
}
