import { Router } from 'express';
import { NewsController } from '../controllers/newsController';
import { authMiddleware, adminMiddleware, optionalAuth } from '../middleware/auth';

const router = Router();

// --- Special admin-only routes ---
router.get('/latest-id', NewsController.getLatestId);
router.post('/bulk-upsert', authMiddleware, adminMiddleware, NewsController.bulkUpsert);
router.delete('/all', authMiddleware, adminMiddleware, NewsController.deleteAllNews);

// --- Standard CRUD ---
router.get('/', NewsController.getAllNews);
router.post('/', authMiddleware, adminMiddleware, NewsController.createNews);
router.put('/:id', authMiddleware, adminMiddleware, NewsController.updateNews);
router.delete('/:id', authMiddleware, adminMiddleware, NewsController.deleteNews);

// --- View count & rating ---
router.post('/:id/view', NewsController.trackView);
router.post('/:id/rate', authMiddleware, NewsController.rateNews);

// --- Detail with optional auth for user-specific rating ---
router.get('/:id', optionalAuth, NewsController.getNewsById);

// --- Q&A ---
router.get('/:id/questions', NewsController.getQuestions);
router.post('/:id/questions', authMiddleware, NewsController.askQuestion);
router.patch('/questions/:id/answer', authMiddleware, adminMiddleware, NewsController.answerQuestion);

export default router;
