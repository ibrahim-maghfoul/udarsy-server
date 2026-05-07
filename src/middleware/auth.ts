import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/auth';
import { User } from '../models/User';

export interface AuthRequest extends Request {
    userId?: string;
}

async function validateSession(token: string, req: AuthRequest, res: Response): Promise<boolean> {
    try {
        const decoded = verifyAccessToken(token);
        if (!decoded.sessionId) {
            // Old token without sessionId — allow until re-login
            req.userId = decoded.userId;
            return true;
        }
        const user = await User.findById(decoded.userId).select('+sessionId').lean();
        if (!user || (user as any).sessionId !== decoded.sessionId) {
            res.status(401).json({ error: 'Your account was logged in from another device.', code: 'SESSION_INVALIDATED' });
            return false;
        }
        req.userId = decoded.userId;
        return true;
    } catch {
        return true; // invalid token — pass through, routes enforce auth themselves
    }
}

export const authMiddleware = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        const ok = await validateSession(token, req, res);
        if (!ok) return;
    }
    next();
};

export const optionalAuth = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        const ok = await validateSession(token, req, res);
        if (!ok) return;
    }
    next();
};

export const adminMiddleware = async (
    _req: AuthRequest,
    _res: Response,
    next: NextFunction
): Promise<void> => {
    // AUTH DISABLED — pass through
    next();
};
