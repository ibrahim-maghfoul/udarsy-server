import express from 'express';
import { InstructorController } from '../controllers/instructorController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { courseUpload, upload, coverUpload } from '../middleware/upload';

const router = express.Router();

// ─── ADMIN: All courses management ───
router.get('/admin/courses', authMiddleware, adminMiddleware, InstructorController.adminGetAllCourses);
router.put('/admin/courses/:id', authMiddleware, adminMiddleware, InstructorController.adminUpdateCourse);
router.delete('/admin/courses/:id', authMiddleware, adminMiddleware, InstructorController.adminDeleteCourse);

// ─── COURSE UPLOADS ───
router.post('/courses/upload', authMiddleware, courseUpload.single('file'),
    InstructorController.courseValidation, InstructorController.uploadCourse);

router.get('/courses/me', authMiddleware, InstructorController.getMyCourses);
router.get('/courses/:instructorId', InstructorController.getInstructorCourses);
router.get('/courses/:id/single', InstructorController.getCourse);
router.delete('/courses/:id', authMiddleware, InstructorController.deleteCourse);

// ─── TRACKING ───
router.post('/courses/:id/view', InstructorController.trackView);
router.post('/courses/:id/download', InstructorController.trackDownload);

// ─── PROFILE PHOTOS (instructor only) ───
router.post('/profile/photo', authMiddleware, upload.single('photo'), InstructorController.updateProfilePhoto);
router.post('/profile/cover', authMiddleware, coverUpload.single('cover'), InstructorController.updateCoverPhoto);

// ─── RATINGS ───
router.get('/:instructorId/ratings', InstructorController.getRatings);
router.post('/:instructorId/rate', authMiddleware, InstructorController.submitRating);

// ─── INSTRUCTOR PROFILES & BROWSE ───
router.get('/', InstructorController.listInstructors);
router.get('/:instructorId', InstructorController.getInstructorProfile);

export default router;
