import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User';
import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken, hashRefreshToken, generateAffiliateCode, generateSessionId } from '../utils/auth';
import { config } from '../config';

export class AuthController {
    // Validation rules
    static registerValidation = [
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password')
            .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
            .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
            .matches(/[0-9]/).withMessage('Password must contain at least one number'),
        body('displayName')
            .notEmpty().withMessage('Display name is required')
            .isLength({ max: 60 }).withMessage('Display name too long')
            .trim(),
        body('nickname')
            .notEmpty().withMessage('Nickname is required')
            .isLength({ max: 30 }).withMessage('Nickname too long')
            .trim(),
        body('gender').optional().isIn(['male', 'female']).withMessage('Invalid gender'),
    ];

    static loginValidation = [
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required'),
    ];

    // Register user
    static async register(req: AuthRequest, res: Response): Promise<void> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ errors: errors.array() });
                return;
            }

            const { email, password, displayName, nickname, gender, referralCode } = req.body;

            const existingUser = await User.findOne({ email });
            if (existingUser) {
                res.status(400).json({ error: 'Email already registered' });
                return;
            }

            const hashedPassword = await hashPassword(password);

            // Generate unique affiliate code
            const affiliateCode = generateAffiliateCode();

            const user = await User.create({
                email,
                password: hashedPassword,
                displayName,
                nickname,
                gender,
                affiliateCode,
                referredBy: referralCode || undefined,
                isPremium: false,
                progress: {
                    totalLessons: 0,
                    completedLessons: 0,
                    learningTime: 0,
                    documentsOpened: 0,
                    usageTime: 0,
                    savedNews: [],
                },
                settings: {
                    notifications: true,
                    theme: 'system',
                },
            });

            // Award +100 pts to referrer if valid code
            if (referralCode) {
                await User.findOneAndUpdate(
                    { affiliateCode: referralCode },
                    { $inc: { points: 100 } }
                );
            }

            const sessionId = generateSessionId();
            const accessToken = generateAccessToken(user._id.toString(), sessionId);
            const refreshToken = generateRefreshToken(user._id.toString());

            user.refreshToken = hashRefreshToken(refreshToken);
            user.sessionId = sessionId;
            await user.save();

            res.cookie('token', accessToken, {
                httpOnly: true,
                secure: config.nodeEnv === 'production',
                maxAge: config.cookie.maxAge,
                sameSite: 'strict',
            });

            res.status(201).json({
                user: {
                    id: user._id,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    subscription: user.subscription,
                    phone: user.phone,
                    nickname: user.nickname,
                    city: user.city,
                    age: user.age,
                    gender: user.gender,
                    schoolName: user.schoolName,
                    studyLocation: user.studyLocation,
                    role: user.role,
                    progress: user.progress,
                    isPremium: user.isPremium,
                    settings: user.settings,
                    points: user.points,
                },
                token: accessToken,
            });
        } catch (error: any) {
            console.error('Register error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name,
                errors: error.errors // Mongoose validation errors
            });
            res.status(500).json({
                error: 'Registration failed',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Login user
    static async login(req: AuthRequest, res: Response): Promise<void> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ errors: errors.array() });
                return;
            }

            const { email, password, rememberMe } = req.body;

            const user = await User.findOne({ email }).select('+password');
            if (!user) {
                res.status(401).json({ error: 'Invalid credentials' });
                return;
            }

            if (!user.password) {
                res.status(401).json({ error: 'Invalid credentials' });
                return;
            }

            const isValidPassword = await comparePassword(password, user.password);
            if (!isValidPassword) {
                res.status(401).json({ error: 'Invalid credentials' });
                return;
            }

            const sessionId = generateSessionId();
            const accessToken = generateAccessToken(user._id.toString(), sessionId);
            const refreshToken = generateRefreshToken(user._id.toString());

            user.refreshToken = hashRefreshToken(refreshToken);
            user.sessionId = sessionId;
            await user.save();

            const maxAge = rememberMe ? 15 * 24 * 60 * 60 * 1000 : config.cookie.maxAge;

            res.cookie('token', accessToken, {
                httpOnly: true,
                secure: config.nodeEnv === 'production',
                maxAge: maxAge,
                sameSite: 'strict',
            });

            res.json({
                user: {
                    id: user._id,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    subscription: user.subscription,
                    level: user.level,
                    selectedPath: user.selectedPath,
                    phone: user.phone,
                    nickname: user.nickname,
                    city: user.city,
                    age: user.age,
                    gender: user.gender,
                    schoolName: user.schoolName,
                    studyLocation: user.studyLocation,
                    role: user.role,
                    progress: user.progress,
                    isPremium: user.isPremium,
                    settings: user.settings,
                    points: user.points,
                },
                token: accessToken,
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Login failed' });
        }
    }

    // Logout user
    static async logout(_req: AuthRequest, res: Response): Promise<void> {
        try {
            res.clearCookie('token');
            res.json({ message: 'Logged out successfully' });
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({ error: 'Logout failed' });
        }
    }

    // Google login — verify Google token and create/find user
    static async googleLogin(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { idToken, accessToken: googleAccessToken, referralCode } = req.body;
            if (!idToken && !googleAccessToken) {
                res.status(400).json({ error: 'Google token is required' });
                return;
            }

            let googleData: any;

            if (googleAccessToken) {
                // Fetch user info using access token
                const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${googleAccessToken}` }
                });
                if (!googleRes.ok) {
                    res.status(401).json({ error: 'Invalid Google access token' });
                    return;
                }
                googleData = await googleRes.json();
            } else {
                // Verify the Google ID token — this is the fallback
                const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
                if (!googleRes.ok) {
                    res.status(401).json({ error: 'Invalid Google ID token' });
                    return;
                }
                googleData = await googleRes.json();
            }

            const email = googleData.email;
            const displayName = googleData.name || googleData.email?.split('@')[0];
            const photoURL = googleData.picture;

            if (!email) {
                res.status(400).json({ error: 'Google account has no email' });
                return;
            }

            // Find or create user
            let user = await User.findOne({ email });
            let isNewUser = false;

            if (!user) {
                isNewUser = true;
                const hashedPassword = await hashPassword(Math.random().toString(36));
                const affiliateCode = generateAffiliateCode();
                user = await User.create({
                    email,
                    password: hashedPassword,
                    displayName,
                    photoURL,
                    affiliateCode,
                    referredBy: referralCode || undefined,
                    progress: {
                        totalLessons: 0,
                        completedLessons: 0,
                        learningTime: 0,
                        documentsOpened: 0,
                        usageTime: 0,
                        savedNews: [],
                    },
                    settings: {
                        notifications: true,
                        theme: 'system',
                    },
                });

                // Award +100 pts to referrer if valid code
                if (referralCode) {
                    await User.findOneAndUpdate(
                        { affiliateCode: referralCode },
                        { $inc: { points: 100 } }
                    );
                }
            }

            const sessionId = generateSessionId();
            const accessToken = generateAccessToken(user._id.toString(), sessionId);
            const refreshToken = generateRefreshToken(user._id.toString());

            user.refreshToken = hashRefreshToken(refreshToken);
            user.sessionId = sessionId;
            await user.save();

            res.cookie('token', accessToken, {
                httpOnly: true,
                secure: config.nodeEnv === 'production',
                maxAge: config.cookie.maxAge,
                sameSite: 'strict',
            });

            res.json({
                user: {
                    id: user._id,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL,
                    subscription: user.subscription,
                    level: user.level,
                    selectedPath: user.selectedPath,
                    phone: user.phone,
                    nickname: user.nickname,
                    city: user.city,
                    age: user.age,
                    gender: user.gender,
                    schoolName: user.schoolName,
                    studyLocation: user.studyLocation,
                    role: user.role,
                    points: user.points,
                },
                token: accessToken,
                isNewUser,
            });
        } catch (error) {
            console.error('Google login error:', error);
            res.status(500).json({ error: 'Google login failed' });
        }
    }
}
