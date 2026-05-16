import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import { User } from '../models/User';
import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken, hashRefreshToken, generateAffiliateCode, generateSessionId } from '../utils/auth';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';
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
            .notEmpty().withMessage('Full name is required')
            .isLength({ max: 60 }).withMessage('Name is too long (max 60 characters)')
            .trim(),
        body('gender').optional().isIn(['male', 'female']).withMessage('Invalid gender'),
    ];

    static loginValidation = [
        body('email').isEmail().withMessage('Please enter a valid email address'),
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

            const { email, password, displayName, gender, referralCode } = req.body;

            const existingUser = await User.findOne({ email });
            if (existingUser) {
                res.status(400).json({ error: 'This email is already registered' });
                return;
            }

            const hashedPassword = await hashPassword(password);

            // Generate unique affiliate code
            const affiliateCode = generateAffiliateCode();

            const user = await User.create({
                email,
                password: hashedPassword,
                displayName,
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

            // Generate email verification token
            const verificationToken = crypto.randomBytes(32).toString('hex');
            user.verificationToken = verificationToken;
            user.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

            const sessionId = generateSessionId();
            const accessToken = generateAccessToken(user._id.toString(), sessionId);
            const refreshToken = generateRefreshToken(user._id.toString());

            user.refreshToken = hashRefreshToken(refreshToken);
            user.sessionId = sessionId;
            await user.save();

            // Send verification email (non-blocking)
            sendVerificationEmail(user.email, verificationToken).catch((err) =>
                console.error('Failed to send verification email:', err)
            );

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
                    isVerified: false,
                },
                token: accessToken,
            });
        } catch (error: any) {
            console.error('Register error details:', {
                message: error.message,
                name: error.name,
            });
            res.status(500).json({ error: 'Something went wrong. Please try again.' });
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
                    isVerified: user.isVerified,
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

    // Verify email with token
    static async verifyEmail(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { token } = req.body;
            if (!token) {
                res.status(400).json({ error: 'Verification token is required' });
                return;
            }

            const user = await User.findOne({
                verificationToken: token,
                verificationTokenExpiry: { $gt: new Date() },
            }).select('+verificationToken +verificationTokenExpiry');

            if (!user) {
                res.status(400).json({ error: 'Invalid or expired verification link' });
                return;
            }

            user.isVerified = true;
            user.verificationToken = undefined;
            user.verificationTokenExpiry = undefined;
            await user.save();

            res.json({ message: 'Email verified successfully' });
        } catch (error) {
            console.error('Verify email error:', error);
            res.status(500).json({ error: 'Verification failed' });
        }
    }

    // Resend verification email
    static async resendVerification(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { email } = req.body;
            if (!email) {
                res.status(400).json({ error: 'Email is required' });
                return;
            }

            const user = await User.findOne({ email: email.toLowerCase().trim() })
                .select('+verificationToken +verificationTokenExpiry');

            // Always return success to avoid email enumeration
            if (!user || user.isVerified) {
                res.json({ message: 'If your email is registered and unverified, you will receive a new link.' });
                return;
            }

            const verificationToken = crypto.randomBytes(32).toString('hex');
            user.verificationToken = verificationToken;
            user.verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await user.save();

            sendVerificationEmail(user.email, verificationToken).catch((err) =>
                console.error('Failed to send verification email:', err)
            );

            res.json({ message: 'If your email is registered and unverified, you will receive a new link.' });
        } catch (error) {
            console.error('Resend verification error:', error);
            res.status(500).json({ error: 'Failed to resend verification email' });
        }
    }

    // Request password reset
    static async forgotPassword(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { email } = req.body;
            if (!email) {
                res.status(400).json({ error: 'Email is required' });
                return;
            }

            const user = await User.findOne({ email: email.toLowerCase().trim() })
                .select('+resetPasswordToken +resetPasswordTokenExpiry');

            // Always return success to avoid email enumeration
            if (!user) {
                res.json({ message: 'If that email is registered, you will receive a reset link.' });
                return;
            }

            const resetToken = crypto.randomBytes(32).toString('hex');
            user.resetPasswordToken = resetToken;
            user.resetPasswordTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1h
            await user.save();

            sendPasswordResetEmail(user.email, resetToken).catch((err) =>
                console.error('Failed to send password reset email:', err)
            );

            res.json({ message: 'If that email is registered, you will receive a reset link.' });
        } catch (error) {
            console.error('Forgot password error:', error);
            res.status(500).json({ error: 'Failed to send reset email' });
        }
    }

    // Reset password with token
    static async resetPassword(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { token, password } = req.body;

            if (!token || !password) {
                res.status(400).json({ error: 'Token and new password are required' });
                return;
            }

            if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
                res.status(400).json({ error: 'Password must be at least 8 characters with one uppercase letter and one number' });
                return;
            }

            const user = await User.findOne({
                resetPasswordToken: token,
                resetPasswordTokenExpiry: { $gt: new Date() },
            }).select('+password +resetPasswordToken +resetPasswordTokenExpiry');

            if (!user) {
                res.status(400).json({ error: 'Invalid or expired reset link' });
                return;
            }

            user.password = await hashPassword(password);
            user.resetPasswordToken = undefined;
            user.resetPasswordTokenExpiry = undefined;
            // Invalidate all sessions
            user.refreshToken = undefined;
            user.sessionId = undefined;
            await user.save();

            res.clearCookie('token');
            res.json({ message: 'Password reset successfully. Please log in with your new password.' });
        } catch (error) {
            console.error('Reset password error:', error);
            res.status(500).json({ error: 'Password reset failed' });
        }
    }
}
