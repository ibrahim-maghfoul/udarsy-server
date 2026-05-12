import { Router } from 'express';
import { CalendarController } from '../controllers/calendarController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Global events — public read, admin write
router.get('/global',                CalendarController.getGlobalEvents);
router.post('/global/seed-holidays', authMiddleware, CalendarController.seedHolidays);
router.post('/global',               authMiddleware, CalendarController.createGlobalEvent);
router.put('/global/:id',            authMiddleware, CalendarController.updateGlobalEvent);
router.delete('/global/:id',         authMiddleware, CalendarController.deleteGlobalEvent);

// User calendar — all require auth
router.get('/',                       authMiddleware, CalendarController.getCalendar);
router.put('/',                       authMiddleware, CalendarController.syncCalendar);
router.post('/events',                authMiddleware, CalendarController.addEvent);
router.put('/events/:id',             authMiddleware, CalendarController.updateEvent);
router.delete('/events/:id',          authMiddleware, CalendarController.deleteEvent);
router.post('/todos',                 authMiddleware, CalendarController.addTodo);
router.put('/todos/:id',              authMiddleware, CalendarController.toggleTodo);
router.delete('/todos/:id',           authMiddleware, CalendarController.deleteTodo);

export default router;
