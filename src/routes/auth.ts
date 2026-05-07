import { Router } from 'express';
import { AuthController } from '../controllers/authController';

const router = Router();

router.post('/register', AuthController.registerValidation, AuthController.register);
router.post('/login', AuthController.loginValidation, AuthController.login);
router.post('/google', AuthController.googleLogin);
router.post('/logout', AuthController.logout);

export default router;
