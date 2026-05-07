import { Router } from 'express';
import { ProgressController } from '../controllers/progressController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/track-view', authMiddleware, ProgressController.trackResourceView);
router.post('/update-progress', authMiddleware, ProgressController.updateResourceProgress);
router.post('/mark-complete', authMiddleware, ProgressController.markResourceComplete);
router.post('/toggle-favorite', authMiddleware, ProgressController.toggleLessonFavorite);
router.get('/favorites', authMiddleware, ProgressController.getFavoriteLessons);
router.get('/subject/:subjectId', authMiddleware, ProgressController.getSubjectProgress);
router.get('/lesson/:lessonId', authMiddleware, ProgressController.getLessonProgressById);
router.post('/update-resource-count', authMiddleware, ProgressController.updateLessonResourceCount);
router.post('/track-session', authMiddleware, ProgressController.trackSessionTime);

export default router;
