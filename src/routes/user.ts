import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { upload, processProfileImage } from '../middleware/upload';

const router = Router();

router.get('/all', authMiddleware, adminMiddleware, UserController.getAllUsers);
router.patch('/admin/:id/role', authMiddleware, adminMiddleware, UserController.setUserRole);
router.patch('/admin/:id/subscription', authMiddleware, adminMiddleware, UserController.setUserSubscription);
router.delete('/admin/:id', authMiddleware, adminMiddleware, UserController.deleteUserAdmin);
router.get('/admin/feedback', authMiddleware, adminMiddleware, UserController.getAllFeedback);
router.patch('/admin/feedback/:id/status', authMiddleware, adminMiddleware, UserController.updateFeedbackStatus);
router.delete('/admin/feedback/:id', authMiddleware, adminMiddleware, UserController.deleteFeedback);
router.get('/profile', authMiddleware, UserController.getProfile);
router.patch('/profile', authMiddleware, UserController.updateProfile);
router.post('/change-password', authMiddleware, UserController.changePassword);
router.post('/profile/photo', authMiddleware, upload.single('photo'), processProfileImage, UserController.uploadProfilePicture);
router.delete('/profile', authMiddleware, UserController.deleteAccount);
router.post('/report', authMiddleware, UserController.createReport);
router.get('/saved-news', authMiddleware, UserController.getSavedNews);
router.post('/saved-news', authMiddleware, UserController.toggleSavedNews);
router.patch('/subscribe', authMiddleware, UserController.subscribe);
router.post('/admin/giveaway', authMiddleware, adminMiddleware, UserController.runGiveaway);
router.get('/affiliate-code', authMiddleware, UserController.getAffiliateCode);
router.get('/contribution-status', authMiddleware, UserController.getContributionStatus);
router.post('/contribution-count/increment', authMiddleware, UserController.incrementContributionCount);
router.get('/rankings', UserController.getRankings);
router.post('/reward-request', authMiddleware, UserController.createRewardRequest);
router.get('/reward-requests/me', authMiddleware, UserController.getUserRewardRequests);
router.get('/admin/reward-requests', authMiddleware, adminMiddleware, UserController.getRewardRequests);
router.patch('/admin/reward-requests/:id/review', authMiddleware, adminMiddleware, UserController.reviewRewardRequest);

export default router;
