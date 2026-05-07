import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { News } from '../models/News';
import { Feedback } from '../models/Feedback';
import { RewardRequest } from '../models/RewardRequest';
import { Subject } from '../models/Subject';
import { Lesson } from '../models/Lesson';
import { config } from '../config';
import { hashPassword, comparePassword, generateAffiliateCode } from '../utils/auth';
import path from 'path';
import fs from 'fs/promises';

export class UserController {
    // Admin: Get all users (paginated)
    static async getAllUsers(req: AuthRequest, res: Response): Promise<void> {
        try {
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100));
            const skip = (page - 1) * limit;

            const [users, total] = await Promise.all([
                User.find({})
                    .select('-password -refreshToken -calendar')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                User.countDocuments(),
            ]);

            res.json({ users, total, page, pages: Math.ceil(total / limit) });
        } catch (error) {
            console.error('Get all users error:', error);
            res.status(500).json({ error: 'Failed to get users' });
        }
    }

    // Admin: set user role
    static async setUserRole(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { role } = req.body;
            if (!['user', 'admin', 'instructor', 'teacher'].includes(role)) { res.status(400).json({ error: 'Invalid role' }); return; }
            const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password -refreshToken');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }
            res.json(user);
        } catch (error) { res.status(500).json({ error: 'Failed to update role' }); }
    }

    // Admin: set user subscription
    static async setUserSubscription(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { plan, billingCycle, expiresAt } = req.body;
            if (!['free', 'premium', 'pro'].includes(plan)) { res.status(400).json({ error: 'Invalid plan' }); return; }
            const user = await User.findByIdAndUpdate(req.params.id, { subscription: { plan, billingCycle: billingCycle || 'none', expiresAt } }, { new: true }).select('-password -refreshToken');
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }
            res.json(user);
        } catch (error) { res.status(500).json({ error: 'Failed to update subscription' }); }
    }

    // Admin: delete any user
    static async deleteUserAdmin(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (req.params.id === req.userId) { res.status(400).json({ error: 'Cannot delete yourself' }); return; }
            const user = await User.findByIdAndDelete(req.params.id);
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }
            res.json({ message: 'User deleted' });
        } catch (error) { res.status(500).json({ error: 'Failed to delete user' }); }
    }

    // Get user profile
    static async getProfile(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);

            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            let totalGuidanceResources = 0;
            if (user.selectedPath && user.selectedPath.guidanceId) {
                try {
                    const subjects = await Subject.find({ guidanceId: user.selectedPath.guidanceId }, '_id').lean();
                    const subjectIds = subjects.map(s => s._id);

                    if (subjectIds.length > 0) {
                        const countResult = await Lesson.aggregate([
                            { $match: { subjectId: { $in: subjectIds } } },
                            { $project: {
                                totalRes: {
                                    $add: [
                                        { $size: { $ifNull: ["$coursesPdf", []] } },
                                        { $size: { $ifNull: ["$videos", []] } },
                                        { $size: { $ifNull: ["$exercices", []] } },
                                        { $size: { $ifNull: ["$exams", []] } },
                                        { $size: { $ifNull: ["$resourses", []] } }
                                    ]
                                }
                            }},
                            { $group: { _id: null, total: { $sum: "$totalRes" } } }
                        ]);
                        if (countResult && countResult.length > 0) {
                            totalGuidanceResources = countResult[0].total;
                        }
                    }
                } catch (err) {
                    console.error('Failed to compute guidance total resources', err);
                }
            }

            res.json({
                id: user._id,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                isPremium: user.isPremium,
                level: user.level,
                subscription: user.subscription,
                progress: user.progress,
                settings: user.settings,
                selectedPath: user.selectedPath,
                phone: user.phone,
                nickname: user.nickname,
                city: user.city,
                age: user.age,
                birthday: user.birthday,
                gender: user.gender,
                schoolName: user.schoolName,
                studyLocation: user.studyLocation,
                role: user.role,
                points: user.points,
                coverPhotoURL: user.coverPhotoURL,
                totalGuidanceResources,
            });
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({ error: 'Failed to get profile' });
        }
    }

    // Update user profile
    static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
        try {
            const updates = req.body;
            const allowedUpdates = [
                'displayName',
                'phone',
                'nickname',
                'city',
                'age',
                'birthday',
                'gender',
                'schoolName',
                'studyLocation',
                'settings',
                'level',
                'selectedPath'
            ];

            const filteredUpdates: any = {};
            Object.keys(updates).forEach(key => {
                if (allowedUpdates.includes(key)) {
                    const value = updates[key];
                    // Don't update with empty string for fields that have specific types or constraints
                    if (value === "" && (key === 'age' || key === 'gender')) {
                        return;
                    }
                    filteredUpdates[key] = value;
                }
            });

            // Convert age to number if present
            if (filteredUpdates.age !== undefined) {
                filteredUpdates.age = parseInt(filteredUpdates.age);
            }
            
            // Parse birthday if present
            if (filteredUpdates.birthday) {
                const bday = new Date(filteredUpdates.birthday);
                filteredUpdates.birthday = bday;
                
                // If age wasn't explicitly provided, calculate it from birthday natively
                if (filteredUpdates.age === undefined) {
                    const monthDiff = new Date().getMonth() - bday.getMonth();
                    let age = new Date().getFullYear() - bday.getFullYear();
                    // subtract 1 if the current month is before the birth month, or if it's the birth month but the day is earlier
                    if (monthDiff < 0 || (monthDiff === 0 && new Date().getDate() < bday.getDate())) {
                        age--;
                    }
                    filteredUpdates.age = age;
                }
            }

            // Phone validation
            if (filteredUpdates.phone) {
                const phoneRegex = /^\+?[0-9]{10,15}$/;
                if (!phoneRegex.test(filteredUpdates.phone)) {
                    res.status(400).json({ error: 'Invalid phone number format' });
                    return;
                }
            }

            const user = await User.findByIdAndUpdate(
                req.userId,
                { $set: filteredUpdates },
                { new: true, runValidators: true }
            );

            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.json({
                id: user._id,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                isPremium: user.isPremium,
                level: user.level,
                subscription: user.subscription,
                progress: user.progress,
                settings: user.settings,
                selectedPath: user.selectedPath,
                phone: user.phone,
                nickname: user.nickname,
                city: user.city,
                age: user.age,
                birthday: user.birthday,
                gender: user.gender,
                schoolName: user.schoolName,
                studyLocation: user.studyLocation,
                role: user.role,
                points: user.points,
            });
        } catch (error: any) {
            console.error('Update profile error:', error);
            if (error.name === 'ValidationError') {
                res.status(400).json({ error: error.message });
                return;
            }
            if (error.code === 11000) {
                res.status(400).json({ error: 'Email already in use' });
                return;
            }
            res.status(500).json({ error: 'Failed to update profile' });
        }
    }

    // Change password
    static async changePassword(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                res.status(400).json({ error: 'Current and new passwords are required' });
                return;
            }

            if (newPassword.length < 8) {
                res.status(400).json({ error: 'New password must be at least 8 characters long' });
                return;
            }

            const user = await User.findById(req.userId).select('+password');
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            const isMatch = await comparePassword(currentPassword, user.password);
            if (!isMatch) {
                res.status(400).json({ error: 'Incorrect current password' });
                return;
            }

            user.password = await hashPassword(newPassword);
            await user.save();

            res.json({ message: 'Password changed successfully' });
        } catch (error) {
            console.error('Change password error:', error);
            res.status(500).json({ error: 'Failed to change password' });
        }
    }

    // Upload profile picture
    static async uploadProfilePicture(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.file) {
                res.status(400).json({ error: 'No file uploaded' });
                return;
            }

            // Save ONLY the filename
            const photoURL = req.file.filename;

            const user = await User.findById(req.userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            // Delete old profile photo if exists and is different from the new one
            if (user.photoURL) {
                try {
                    let oldPhotoPath = '';

                    if (user.photoURL.includes('/')) {
                        // Legacy: contains path
                        const urlWithoutParams = user.photoURL.split('?')[0];
                        const oldFilename = urlWithoutParams.split('/').pop();
                        if (oldFilename && oldFilename !== req.file.filename) {
                            const relativePath = urlWithoutParams.startsWith('/') ? urlWithoutParams.substring(1) : urlWithoutParams;
                            oldPhotoPath = path.join(process.cwd(), relativePath);
                        }
                    } else if (user.photoURL !== req.file.filename) {
                        // New: filename only
                        oldPhotoPath = path.join(process.cwd(), 'data/images/profile-picture', user.photoURL);
                    }

                    if (oldPhotoPath) {
                        await fs.access(oldPhotoPath);
                        await fs.unlink(oldPhotoPath);
                    }
                } catch (err) {
                    // Ignore errors during deletion
                }
            }

            user.photoURL = photoURL;
            await user.save();

            res.json({ photoURL });
        } catch (error) {
            console.error('Upload photo error:', error);
            res.status(500).json({ error: 'Failed to upload photo' });
        }
    }

    // Delete account
    static async deleteAccount(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            // Delete profile photo if exists
            if (user.photoURL) {
                const relativePath = user.photoURL.replace(config.backendUrl, '');
                const photoPath = path.join(process.cwd(), relativePath);
                try {
                    await fs.unlink(photoPath);
                } catch (err) {
                    console.error('Failed to delete photo during account deletion:', err);
                }
            }

            await User.findByIdAndDelete(req.userId);
            res.json({ message: 'Account deleted successfully' });
        } catch (error) {
            console.error('Delete account error:', error);
            res.status(500).json({ error: 'Failed to delete account' });
        }
    }

    // Admin: Get all feedback/reports (paginated, O(1) user lookup)
    static async getAllFeedback(req: AuthRequest, res: Response): Promise<void> {
        try {
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
            const skip = (page - 1) * limit;

            const [feedbacks, total] = await Promise.all([
                Feedback.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
                Feedback.countDocuments(),
            ]);

            const userIds = [...new Set(feedbacks.map(f => f.userId))];
            const users = await User.find({ _id: { $in: userIds } }, 'displayName email photoURL').lean();
            const userMap = new Map(users.map(u => [u._id.toString(), u]));

            const result = feedbacks.map(f => ({
                ...f,
                user: userMap.get(f.userId.toString()) || null,
            }));
            res.json({ data: result, total, page, pages: Math.ceil(total / limit) });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get feedback' });
        }
    }

    // Admin: Update feedback status
    static async updateFeedbackStatus(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { status } = req.body;
            if (!['pending', 'reviewed', 'resolved'].includes(status)) { res.status(400).json({ error: 'Invalid status' }); return; }
            const fb = await Feedback.findByIdAndUpdate(req.params.id, { status }, { new: true });
            if (!fb) { res.status(404).json({ error: 'Not found' }); return; }
            res.json(fb);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update status' });
        }
    }

    // Admin: Delete feedback
    static async deleteFeedback(req: AuthRequest, res: Response): Promise<void> {
        try {
            await Feedback.findByIdAndDelete(req.params.id);
            res.json({ message: 'Deleted' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete' });
        }
    }

    // Create report
    static async createReport(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { type, title, description } = req.body;
            const feedback = new Feedback({
                userId: req.userId,
                type,
                title,
                description
            });
            await feedback.save();
            res.status(201).json(feedback);
        } catch (error) {
            console.error('Create report error:', error);
            res.status(500).json({ error: 'Failed to create report' });
        }
    }

    // Get hydrated saved news items
    static async getSavedNews(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            const savedIds = user.progress.savedNews || [];
            if (savedIds.length === 0) {
                res.json([]);
                return;
            }

            const activeNews = await News.find({ _id: { $in: savedIds } }, {
                title: 1, category: 1, type: 1, imageUrl: 1, images: 1, date: 1, card_date: 1, readTime: 1
            }).lean();

            // Sort by original save order (newest first)
            const sortedNews = activeNews.sort((a, b) => {
                return savedIds.indexOf(b._id.toString()) - savedIds.indexOf(a._id.toString());
            });

            res.json(sortedNews);
        } catch (error) {
            console.error('Get saved news error:', error);
            res.status(500).json({ error: 'Failed to get saved news' });
        }
    }

    // Toggle saved news
    static async toggleSavedNews(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { newsId } = req.body;
            if (!newsId) {
                res.status(400).json({ error: 'newsId is required' });
                return;
            }

            const user = await User.findById(req.userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            const savedNews = user.progress.savedNews || [];
            const index = savedNews.indexOf(newsId);
            let action = '';

            if (index === -1) {
                // Not saved, add it
                savedNews.push(newsId);
                action = 'saved';
            } else {
                // Already saved, remove it
                savedNews.splice(index, 1);
                action = 'unsaved';
            }

            user.progress.savedNews = savedNews;
            await user.save();

            res.json({ message: `Article ${action} successfully`, savedNews });
        } catch (error) {
            console.error('Toggle saved news error:', error);
            res.status(500).json({ error: 'Failed to toggle saved news' });
        }
    }

    // Create simulation for subscription
    static async subscribe(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { plan, billingCycle } = req.body;
            if (!['free', 'premium', 'pro'].includes(plan)) {
                res.status(400).json({ error: 'Invalid plan' });
                return;
            }

            const expiresAt = billingCycle === 'monthly'
                ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                : billingCycle === 'yearly'
                    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                    : undefined;

            const user = await User.findByIdAndUpdate(
                req.userId,
                {
                    subscription: {
                        plan,
                        billingCycle: plan === 'free' ? 'none' : billingCycle,
                        expiresAt: plan === 'free' ? undefined : expiresAt
                    }
                },
                { new: true }
            );

            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.json({
                message: 'Subscribed successfully',
                subscription: user.subscription
            });
        } catch (error) {
            console.error('Subscribe error:', error);
            res.status(500).json({ error: 'Failed to subscribe' });
        }
    }

    // Admin: Random Giveaway — grant 1 month premium to a random free user
    static async runGiveaway(_req: AuthRequest, res: Response): Promise<void> {
        try {
            // Find all free users
            const freeUsers = await User.find({ 'subscription.plan': 'free' }, '_id displayName email').lean();
            if (freeUsers.length === 0) {
                res.status(404).json({ error: 'No free users found' });
                return;
            }

            // Pick random winner
            const winner = freeUsers[Math.floor(Math.random() * freeUsers.length)];
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

            await User.findByIdAndUpdate(winner._id, {
                subscription: { plan: 'premium', billingCycle: 'none', expiresAt },
            });

            res.json({ message: 'Giveaway winner selected!', winner: { id: winner._id, displayName: winner.displayName, email: winner.email }, expiresAt });
        } catch (error) {
            console.error('Giveaway error:', error);
            res.status(500).json({ error: 'Failed to run giveaway' });
        }
    }

    // Get affiliate code (for sharing)
    static async getAffiliateCode(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            // Generate code if missing
            if (!user.affiliateCode) {
                user.affiliateCode = generateAffiliateCode();
                await user.save();
            }

            res.json({ affiliateCode: user.affiliateCode });
        } catch (error) {
            console.error('Get affiliate code error:', error);
            res.status(500).json({ error: 'Failed to get affiliate code' });
        }
    }

    // Get contribution count for the month
    static async getContributionStatus(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            const isPremium = user.isPremium;
            const LIMIT = 30;

            // Reset count if we're in a new month
            const now = new Date();
            const resetAt = user.contributionCount?.resetAt || new Date(0);
            const isNewMonth = resetAt.getFullYear() < now.getFullYear() ||
                (resetAt.getFullYear() === now.getFullYear() && resetAt.getMonth() < now.getMonth());

            let count = user.contributionCount?.count || 0;
            if (isNewMonth) {
                count = 0;
                await User.findByIdAndUpdate(req.userId, {
                    'contributionCount.count': 0,
                    'contributionCount.resetAt': now,
                });
            }

            res.json({
                count,
                limit: isPremium ? null : LIMIT,
                remaining: isPremium ? null : Math.max(0, LIMIT - count),
                isPremium,
                canContribute: isPremium || count < LIMIT,
            });
        } catch (error) {
            console.error('Get contribution status error:', error);
            res.status(500).json({ error: 'Failed to get contribution status' });
        }
    }

    // Increment contribution count (called after successful upload)
    static async incrementContributionCount(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            const LIMIT = 30;
            const now = new Date();

            // Check premium
            if (user.isPremium) {
                // Premium users: just increment, no limit
                await User.findByIdAndUpdate(req.userId, {
                    $inc: { 'contributionCount.count': 1 },
                    'contributionCount.resetAt': user.contributionCount?.resetAt || now,
                });
                res.json({ success: true, unlimited: true });
                return;
            }

            // Reset if new month
            const resetAt = user.contributionCount?.resetAt || new Date(0);
            const isNewMonth = resetAt.getFullYear() < now.getFullYear() ||
                (resetAt.getFullYear() === now.getFullYear() && resetAt.getMonth() < now.getMonth());

            const currentCount = isNewMonth ? 0 : (user.contributionCount?.count || 0);

            if (currentCount >= LIMIT) {
                res.status(429).json({ error: 'Monthly contribution limit reached', limit: LIMIT });
                return;
            }

            await User.findByIdAndUpdate(req.userId, {
                'contributionCount.count': currentCount + 1,
                'contributionCount.resetAt': isNewMonth ? now : resetAt,
            });

            res.json({ success: true, count: currentCount + 1, remaining: LIMIT - (currentCount + 1) });
        } catch (error) {
            console.error('Increment contribution count error:', error);
            res.status(500).json({ error: 'Failed to increment contribution count' });
        }
    }

    // Public leaderboard — top 50 users by points
    static async getRankings(_req: AuthRequest, res: Response): Promise<void> {
        try {
            const users = await User.find({ points: { $gt: 0 } })
                .select('displayName photoURL points subscription.plan level.guidance level.level createdAt')
                .sort({ points: -1 })
                .limit(50)
                .lean();

            const ranked = users.map((u, i) => ({
                rank: i + 1,
                displayName: u.displayName,
                photoURL: u.photoURL || null,
                points: u.points || 0,
                plan: (u.subscription as any)?.plan || 'free',
                guidance: (u.level as any)?.guidance || null,
                level: (u.level as any)?.level || null,
            }));

            res.json(ranked);
        } catch (error) {
            console.error('Get rankings error:', error);
            res.status(500).json({ error: 'Failed to get rankings' });
        }
    }

    static async createRewardRequest(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = await User.findById(req.userId).select('points displayName email subscription').lean();
            if (!user) { res.status(404).json({ error: 'User not found' }); return; }

            const POINTS_THRESHOLD = 10000;
            if ((user.points || 0) < POINTS_THRESHOLD) {
                res.status(400).json({ error: `You need at least ${POINTS_THRESHOLD} points to request a reward.` });
                return;
            }

            const existing = await RewardRequest.findOne({ userId: req.userId, status: 'pending' });
            if (existing) {
                res.status(400).json({ error: 'You already have a pending reward request.' });
                return;
            }

            const request = await RewardRequest.create({
                userId: req.userId,
                userDisplayName: user.displayName,
                userEmail: user.email,
                userPoints: user.points,
            });

            res.status(201).json(request);
        } catch (error) {
            console.error('Create reward request error:', error);
            res.status(500).json({ error: 'Failed to submit reward request' });
        }
    }

    static async getRewardRequests(_req: AuthRequest, res: Response): Promise<void> {
        try {
            const requests = await RewardRequest.find({}).sort({ createdAt: -1 }).lean();
            res.json(requests);
        } catch (error) {
            console.error('Get reward requests error:', error);
            res.status(500).json({ error: 'Failed to get reward requests' });
        }
    }

    static async reviewRewardRequest(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { status, reviewNotes } = req.body;

            if (!['approved', 'rejected'].includes(status)) {
                res.status(400).json({ error: 'Invalid status' });
                return;
            }

            const request = await RewardRequest.findById(id);
            if (!request) { res.status(404).json({ error: 'Request not found' }); return; }

            request.status = status;
            request.reviewNotes = reviewNotes || '';
            request.reviewedAt = new Date();
            await request.save();

            if (status === 'approved') {
                const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                await User.findByIdAndUpdate(request.userId, {
                    'subscription.plan': 'pro',
                    'subscription.billingCycle': 'none',
                    'subscription.expiresAt': expiresAt,
                });
            }

            res.json(request);
        } catch (error) {
            console.error('Review reward request error:', error);
            res.status(500).json({ error: 'Failed to review reward request' });
        }
    }

    static async getUserRewardRequests(req: AuthRequest, res: Response): Promise<void> {
        try {
            const requests = await RewardRequest.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
            res.json(requests);
        } catch (error) {
            console.error('Get user reward requests error:', error);
            res.status(500).json({ error: 'Failed to get reward requests' });
        }
    }
}
