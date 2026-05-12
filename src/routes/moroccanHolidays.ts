import { Router } from 'express';
import { MoroccanHolidaysController } from '../controllers/moroccanHolidaysController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/',         MoroccanHolidaysController.list);
router.post('/seed',    authMiddleware, MoroccanHolidaysController.seedEndpoint);
router.post('/',        authMiddleware, MoroccanHolidaysController.create);
router.put('/:id',      authMiddleware, MoroccanHolidaysController.update);
router.delete('/:id',   authMiddleware, MoroccanHolidaysController.remove);

export default router;
