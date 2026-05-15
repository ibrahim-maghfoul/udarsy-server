// @ts-nocheck
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { Lesson } from '../models/Lesson';
import { Subject } from '../models/Subject';

// In-memory cache for lesson resource counts — avoids repeated DB hits
const resourceCountCache = new Map<string, { count: number; expiresAt: number }>();
const RESOURCE_COUNT_TTL = 10 * 60_000; // 10 minutes

const DEFAULT_PROGRESS = { totalLessons: 0, completedLessons: 0, learningTime: 0, documentsOpened: 0, videosWatched: 0, usageTime: 0, savedNews: [], lessons: [] };

function ensureProgress(user: any) {
    if (!user.progress) user.progress = { ...DEFAULT_PROGRESS };
    if (!user.progress.lessons) user.progress.lessons = [];
}

export class ProgressController {
    private static async getLessonTotalResources(lessonId: string): Promise<number> {
        // Check cache first
        const cached = resourceCountCache.get(lessonId);
        if (cached && cached.expiresAt > Date.now()) return cached.count;

        try {
            // Only fetch the array lengths we need, use lean() to skip hydration
            const lesson = await Lesson.findById(lessonId, 'coursesPdf videos exercices exams resourses').lean();
            if (!lesson) return 0;
            const count = (lesson.coursesPdf?.length || 0) +
                (lesson.videos?.length || 0) +
                (lesson.exercices?.length || 0) +
                (lesson.exams?.length || 0) +
                (lesson.resourses?.length || 0);
            resourceCountCache.set(lessonId, { count, expiresAt: Date.now() + RESOURCE_COUNT_TTL });
            return count;
        } catch {
            return 0;
        }
    }

    // Track resource view
    static async trackResourceView(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { lessonId, subjectId, resourceId, resourceType } = req.body;

            // Use select() to only fetch fields we need
            const user = await User.findById(req.userId).select('progress points subscription pointsPremiumGrantedAt');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }

            ensureProgress(user);

            let lessonIndex = user.progress.lessons.findIndex(l => l.lessonId === lessonId);

            if (lessonIndex === -1) {
                user.progress.lessons.push({
                    lessonId, subjectId, isFavorite: false,
                    lastAccessed: new Date(), totalTimeSpent: 0,
                    completedResources: [],
                    totalResourcesCount: await ProgressController.getLessonTotalResources(lessonId),
                });
            } else {
                user.progress.lessons[lessonIndex].lastAccessed = new Date();
            }

            if (['pdf', 'exercise', 'exam', 'resource', 'coursesPdf', 'exercices', 'exams', 'resourses'].includes(resourceType)) {
                user.progress.documentsOpened = (user.progress.documentsOpened || 0) + 1;
                // Track per-day filesOpened for the profile chart
                const today = new Date().toISOString().split('T')[0];
                if (!user.progress.timeSpentHistory) user.progress.timeSpentHistory = [];
                const todayIdx = user.progress.timeSpentHistory.findIndex((h: any) => h.date === today);
                if (todayIdx >= 0) {
                    user.progress.timeSpentHistory[todayIdx].filesOpened = (user.progress.timeSpentHistory[todayIdx].filesOpened || 0) + 1;
                } else {
                    user.progress.timeSpentHistory.push({ date: today, minutes: 0, filesOpened: 1 });
                }
                // Keep only last 90 days
                if (user.progress.timeSpentHistory.length > 90) {
                    user.progress.timeSpentHistory = user.progress.timeSpentHistory.slice(-90);
                }
            } else if (resourceType === 'video') user.progress.videosWatched = (user.progress.videosWatched || 0) + 1;

            user.points = (user.points || 0) + 2;
            ProgressController.maybeGrantPointsPremium(user);

            user.markModified('progress');
            await user.save();

            res.json({ success: true });
        } catch (error) {
            console.error('Track resource view error:', error);
            res.status(500).json({ error: 'Failed to track resource view' });
        }
    }

    private static maybeGrantPointsPremium(user: any): void {
        if ((user.points || 0) >= 1000 && user.subscription?.plan === 'free') {
            const now = new Date();
            const lastGrant = user.pointsPremiumGrantedAt;
            const alreadyGrantedThisMonth = lastGrant &&
                lastGrant.getFullYear() === now.getFullYear() &&
                lastGrant.getMonth() === now.getMonth();
            if (!alreadyGrantedThisMonth) {
                user.subscription = { plan: 'premium', billingCycle: 'none', expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) };
                user.pointsPremiumGrantedAt = now;
            }
        }
    }

    // Update resource progress
    static async updateResourceProgress(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { lessonId, resourceId, additionalTimeSpent, completionPercentage } = req.body;

            if (!lessonId || !resourceId) {
                res.status(400).json({ error: 'lessonId and resourceId are required' });
                return;
            }

            const user = await User.findById(req.userId).select('progress');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }

            ensureProgress(user);

            const lessonIndex = user.progress.lessons.findIndex(l => l.lessonId === lessonId);

            if (lessonIndex === -1) {
                let subjectId = req.body.subjectId || '';
                if (!subjectId) {
                    const lessonDoc = await Lesson.findById(lessonId, 'subjectId').lean();
                    subjectId = lessonDoc?.subjectId || '';
                }
                user.progress.lessons.push({
                    lessonId, subjectId, isFavorite: false,
                    lastAccessed: new Date(), totalTimeSpent: additionalTimeSpent || 0,
                    completedResources: [],
                    totalResourcesCount: await ProgressController.getLessonTotalResources(lessonId),
                });
            } else {
                const lp = user.progress.lessons[lessonIndex];
                lp.totalTimeSpent = (lp.totalTimeSpent || 0) + additionalTimeSpent;
                lp.lastAccessed = new Date();
            }

            // Compute totals in one pass
            let totalUsageSeconds = 0;
            for (const lp of user.progress.lessons) {
                totalUsageSeconds += lp.totalTimeSpent || 0;
            }
            user.progress.usageTime = Math.round(totalUsageSeconds / 60);
            user.progress.learningTime = user.progress.usageTime;

            // Append today's minutes to timeSpentHistory
            const addedMinutes = Math.round((additionalTimeSpent || 0) / 60);
            if (addedMinutes > 0) {
                const today = new Date().toISOString().split('T')[0];
                if (!user.progress.timeSpentHistory) user.progress.timeSpentHistory = [];
                const todayIdx = user.progress.timeSpentHistory.findIndex((h: any) => h.date === today);
                if (todayIdx >= 0) {
                    user.progress.timeSpentHistory[todayIdx].minutes += addedMinutes;
                } else {
                    user.progress.timeSpentHistory.push({ date: today, minutes: addedMinutes });
                }
                // Keep only last 90 days
                if (user.progress.timeSpentHistory.length > 90) {
                    user.progress.timeSpentHistory = user.progress.timeSpentHistory.slice(-90);
                }
            }

            user.markModified('progress');
            await user.save();

            res.json({ success: true });
        } catch (error) {
            console.error('Update resource progress error:', error);
            res.status(500).json({ error: 'Failed to update resource progress' });
        }
    }

    // Mark resource complete
    static async markResourceComplete(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { lessonId, subjectId, resourceId, resourceType, isCompleted } = req.body;

            const user = await User.findById(req.userId).select('progress points');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }

            ensureProgress(user);

            let lessonIndex = user.progress.lessons.findIndex(l => l.lessonId === lessonId);

            if (lessonIndex === -1) {
                user.progress.lessons.push({
                    lessonId, subjectId, isFavorite: false,
                    lastAccessed: new Date(), totalTimeSpent: 0,
                    completedResources: [],
                    totalResourcesCount: await ProgressController.getLessonTotalResources(lessonId),
                });
                lessonIndex = user.progress.lessons.length - 1;
            }

            const lessonProgress = user.progress.lessons[lessonIndex];
            const wasCompleted = lessonProgress.completedResources.includes(resourceId);

            if (isCompleted && !wasCompleted) {
                lessonProgress.completedResources.push(resourceId);
                if (resourceType === 'pdf') user.progress.documentsOpened = (user.progress.documentsOpened || 0) + 1;
                else if (resourceType === 'video') user.progress.videosWatched = (user.progress.videosWatched || 0) + 1;
                user.points = (user.points || 0) + 10;
            } else if (!isCompleted && wasCompleted) {
                lessonProgress.completedResources = lessonProgress.completedResources.filter(id => id !== resourceId);
                user.points = Math.max(0, (user.points || 0) - 10);
            }

            lessonProgress.lastAccessed = new Date();

            let totalUsageSeconds = 0;
            for (const lp of user.progress.lessons) {
                totalUsageSeconds += lp.totalTimeSpent || 0;
            }
            user.progress.usageTime = Math.round(totalUsageSeconds / 60);
            user.progress.learningTime = user.progress.usageTime;

            user.markModified('progress');
            await user.save();

            res.json({ success: true });
        } catch (error) {
            console.error('Mark resource complete error:', error);
            res.status(500).json({ error: 'Failed to mark resource complete' });
        }
    }

    // Toggle lesson favorite
    static async toggleLessonFavorite(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { lessonId, subjectId } = req.body;

            const user = await User.findById(req.userId).select('progress');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }

            ensureProgress(user);

            let lessonIndex = user.progress.lessons.findIndex(l => l.lessonId === lessonId);

            if (lessonIndex === -1) {
                user.progress.lessons.push({
                    lessonId, subjectId, isFavorite: true,
                    lastAccessed: new Date(), totalTimeSpent: 0,
                    completedResources: [],
                    totalResourcesCount: await ProgressController.getLessonTotalResources(lessonId),
                });
                user.markModified('progress');
                await user.save();
                res.json({ isFavorite: true });
                return;
            }

            user.progress.lessons[lessonIndex].isFavorite = !user.progress.lessons[lessonIndex].isFavorite;

            user.markModified('progress');
            await user.save();

            res.json({ isFavorite: user.progress.lessons[lessonIndex].isFavorite });
        } catch (error) {
            console.error('Toggle lesson favorite error:', error);
            res.status(500).json({ error: 'Failed to toggle favorite' });
        }
    }

    // Get favorite lessons — parallel queries for enrichment
    static async getFavoriteLessons(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId).select('progress.lessons').lean();
            if (!user?.progress?.lessons) { res.json([]); return; }

            const favorites = user.progress.lessons
                .filter(lesson => lesson.isFavorite)
                .sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());

            if (favorites.length === 0) { res.json([]); return; }

            const lessonIds = favorites.map(f => f.lessonId);
            const subjectIds = [...new Set(favorites.map(f => f.subjectId))]; // deduplicate

            // Parallel queries
            const [lessonsInfo, subjectsInfo] = await Promise.all([
                Lesson.find({ _id: { $in: lessonIds } }, '_id title').lean(),
                Subject.find({ _id: { $in: subjectIds } }, '_id title').lean(),
            ]);

            const lessonMap = new Map(lessonsInfo.map(l => [l._id, l.title]));
            const subjectMap = new Map(subjectsInfo.map(s => [s._id, s.title]));

            const enrichedFavorites = favorites.map(f => ({
                lessonId: f.lessonId,
                subjectId: f.subjectId,
                isFavorite: f.isFavorite,
                lastAccessed: f.lastAccessed,
                totalTimeSpent: f.totalTimeSpent,
                completedResources: f.completedResources,
                totalResourcesCount: f.totalResourcesCount,
                lessonTitle: lessonMap.get(f.lessonId) || 'Unknown Lesson',
                subjectTitle: subjectMap.get(f.subjectId) || 'Unknown Subject'
            }));

            res.json(enrichedFavorites);
        } catch (error) {
            console.error('Get favorite lessons error:', error);
            res.status(500).json({ error: 'Failed to get favorite lessons' });
        }
    }

    // Get subject progress — use lean() since we only read
    static async getSubjectProgress(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { subjectId } = req.params;

            // Get true total from Lesson collection (not user progress, which only covers visited lessons)
            const lessons = await Lesson.find({ subjectId }, 'coursesPdf videos exercices exams resourses').lean();
            let totalResources = 0;
            for (const lesson of lessons) {
                totalResources += (lesson.coursesPdf?.length || 0) +
                    (lesson.videos?.length || 0) +
                    (lesson.exercices?.length || 0) +
                    (lesson.exams?.length || 0) +
                    (lesson.resourses?.length || 0);
            }

            const user = await User.findById(req.userId).select('progress.lessons').lean();
            let completedResources = 0;
            if (user?.progress?.lessons) {
                for (const lp of user.progress.lessons) {
                    if (lp.subjectId === subjectId) {
                        completedResources += lp.completedResources.length;
                    }
                }
            }

            const progressPercentage = totalResources > 0 ? Math.round((completedResources / totalResources) * 100) : 0;

            res.json({ completedResources, totalResources, progressPercentage, lessonCount: lessons.length });
        } catch (error) {
            console.error('Get subject progress error:', error);
            res.status(500).json({ error: 'Failed to get subject progress' });
        }
    }

    // Update lesson resource count
    static async updateLessonResourceCount(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { lessonId, subjectId, totalCount } = req.body;

            const user = await User.findById(req.userId).select('progress');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }

            ensureProgress(user);

            let lessonIndex = user.progress.lessons.findIndex(l => l.lessonId === lessonId);

            if (lessonIndex === -1) {
                user.progress.lessons.push({
                    lessonId, subjectId, isFavorite: false,
                    lastAccessed: new Date(), totalTimeSpent: 0,
                    completedResources: [],
                    totalResourcesCount: totalCount || await ProgressController.getLessonTotalResources(lessonId),
                });
            } else {
                user.progress.lessons[lessonIndex].totalResourcesCount = totalCount;
            }

            // Update resource count cache
            if (totalCount) resourceCountCache.set(lessonId, { count: totalCount, expiresAt: Date.now() + RESOURCE_COUNT_TTL });

            user.markModified('progress');
            await user.save();

            res.json({ success: true, totalResourcesCount: totalCount });
        } catch (error) {
            console.error('Update lesson resource count error:', error);
            res.status(500).json({ error: 'Failed to update lesson resource count' });
        }
    }

    // Get specific lesson progress — lean read
    static async getLessonProgressById(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { lessonId } = req.params;

            const user = await User.findById(req.userId).select('progress.lessons').lean();
            if (!user?.progress?.lessons) { res.json(null); return; }

            const progress = user.progress.lessons.find(l => l.lessonId === lessonId);
            res.json(progress || null);
        } catch (error) {
            console.error('Get lesson progress by ID error:', error);
            res.status(500).json({ error: 'Failed to get lesson progress' });
        }
    }
    static async trackSessionTime(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { minutes = 1 } = req.body;
            const addedMinutes = Math.max(1, Math.round(Number(minutes)));

            const user = await User.findById(req.userId).select('progress');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }

            ensureProgress(user);

            // Increment usage and learning time
            user.progress.usageTime = (user.progress.usageTime || 0) + addedMinutes;
            user.progress.learningTime = user.progress.usageTime;

            // Update today's history
            const today = new Date().toISOString().split('T')[0];
            if (!user.progress.timeSpentHistory) user.progress.timeSpentHistory = [];
            const todayIdx = user.progress.timeSpentHistory.findIndex((h: any) => h.date === today);
            if (todayIdx >= 0) {
                user.progress.timeSpentHistory[todayIdx].minutes += addedMinutes;
            } else {
                user.progress.timeSpentHistory.push({ date: today, minutes: addedMinutes });
            }

            // Keep only last 90 days
            if (user.progress.timeSpentHistory.length > 90) {
                user.progress.timeSpentHistory = user.progress.timeSpentHistory.slice(-90);
            }

            user.markModified('progress');
            await user.save();

            res.json({ success: true, learningTime: user.progress.learningTime });
        } catch (error) {
            console.error('Track session time error:', error);
            res.status(500).json({ error: 'Failed to track session time' });
        }
    }
}
