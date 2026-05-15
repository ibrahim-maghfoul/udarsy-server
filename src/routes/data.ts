import { Router, Request, Response, NextFunction } from 'express';
import { DataController } from '../controllers/dataController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { resourceUpload } from '../middleware/upload';

const router = Router();

// Cache-Control for semi-static curriculum data (browser + CDN can cache for 60s, stale-while-revalidate for 5 min)
const curriculumCache = (_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    next();
};

// --- Public read endpoints ---
router.get('/schools', curriculumCache, DataController.getSchools);
router.get('/levels/:schoolId', curriculumCache, DataController.getLevels);
router.get('/guidances/:levelId', curriculumCache, DataController.getGuidances);
router.get('/subjects/:guidanceId', curriculumCache, DataController.getSubjects);
router.get('/subject/by-slug/:slug', curriculumCache, DataController.getSubjectBySlug);
router.get('/guidance/by-slug/:slug', curriculumCache, DataController.getGuidanceBySlug);
router.get('/lessons/:subjectId', curriculumCache, DataController.getLessons);
router.get('/lesson/by-slug/:slug', curriculumCache, DataController.getLessonBySlug);
router.get('/lesson/:lessonId', DataController.getLessonById);
router.get('/school-services', curriculumCache, DataController.getSchoolServices);
router.get('/guidance-stats/global', DataController.getGlobalStats);
router.get('/guidance-stats/:guidanceId', DataController.getGuidanceStats);
router.get('/guidance-resources/:guidanceId', DataController.getGuidanceResourceCount);

// --- Protected: user resource contribution ---
router.post('/contribute', authMiddleware, resourceUpload.single('file'), DataController.contribute);

// --- Public/Protected: Contributions Hub ---
// These endpoints feed the CircleRing visualization and recent feed.
router.get('/contributions/summary', DataController.getContributionsSummary);
router.get('/contributions/recent', DataController.getRecentContributions);

// --- Admin: Contributions CRUD ---
router.get('/contributions', authMiddleware, adminMiddleware, DataController.getAllContributions);
router.patch('/contributions/:id/status', authMiddleware, adminMiddleware, DataController.updateContributionStatus);
router.delete('/contributions/:id', authMiddleware, adminMiddleware, DataController.deleteContribution);

// --- Admin-only: write/update/delete endpoints ---
router.post('/schools', authMiddleware, adminMiddleware, DataController.createSchool);
router.post('/levels', authMiddleware, adminMiddleware, DataController.createLevel);
router.post('/guidances', authMiddleware, adminMiddleware, DataController.createGuidance);
router.post('/subjects', authMiddleware, adminMiddleware, DataController.createSubject);
router.post('/lessons', authMiddleware, adminMiddleware, DataController.createLesson);
router.post('/school-services', authMiddleware, adminMiddleware, DataController.createSchoolService);
router.put('/school-services/:id', authMiddleware, adminMiddleware, DataController.updateSchoolService);
router.delete('/school-services/:id', authMiddleware, adminMiddleware, DataController.deleteSchoolService);

router.put('/schools/:id', authMiddleware, adminMiddleware, DataController.updateSchool);
router.put('/levels/:id', authMiddleware, adminMiddleware, DataController.updateLevel);
router.put('/guidances/:id', authMiddleware, adminMiddleware, DataController.updateGuidance);
router.put('/subjects/:id', authMiddleware, adminMiddleware, DataController.updateSubject);
router.put('/lessons/:id', authMiddleware, adminMiddleware, DataController.updateLesson);

router.delete('/schools/:id', authMiddleware, adminMiddleware, DataController.deleteSchool);
router.delete('/levels/:id', authMiddleware, adminMiddleware, DataController.deleteLevel);
router.delete('/guidances/:id', authMiddleware, adminMiddleware, DataController.deleteGuidance);
router.delete('/subjects/:id', authMiddleware, adminMiddleware, DataController.deleteSubject);
router.delete('/lessons/:id', authMiddleware, adminMiddleware, DataController.deleteLesson);

// Guidance Stats (admin-only for write, public for read)
router.post('/guidance-stats', authMiddleware, adminMiddleware, DataController.upsertGuidanceStats);
router.post('/stats/recalculate', authMiddleware, adminMiddleware, DataController.recalculateAllStats);

export default router;
