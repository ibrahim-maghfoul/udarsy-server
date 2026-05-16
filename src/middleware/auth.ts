import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/auth';
import { User } from '../models/User';

export interface AuthRequest extends Request {
    userId?: string;
}

// Cache validated sessions to avoid a DB lookup on every authenticated request.
// Key: `${userId}:${sessionId}` — safe because a new login generates a new sessionId,
// automatically busting any cached entry for the old session.
const _sessionCache = new Map<string, number>(); // value = expiresAt timestamp
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateSessionCache(userId: string, sessionId: string): void {
    _sessionCache.delete(`${userId}:${sessionId}`);
}

async function validateSession(token: string, req: AuthRequest, res: Response): Promise<boolean> {
    try {
        const decoded = verifyAccessToken(token);
        if (!decoded.sessionId) {
            // Legacy token without sessionId — allow until re-login
            req.userId = decoded.userId;
            return true;
        }

        const cacheKey = `${decoded.userId}:${decoded.sessionId}`;
        const cachedExpiry = _sessionCache.get(cacheKey);
        if (cachedExpiry && Date.now() < cachedExpiry) {
            // Session already validated recently — skip DB hit
            req.userId = decoded.userId;
            return true;
        }

        const user = await User.findById(decoded.userId).select('+sessionId').lean();
        if (!user || (user as any).sessionId !== decoded.sessionId) {
            res.status(401).json({ error: 'Your account was logged in from another device.', code: 'SESSION_INVALIDATED' });
            return false;
        }

        _sessionCache.set(cacheKey, Date.now() + SESSION_CACHE_TTL_MS);
        req.userId = decoded.userId;
        return true;
    } catch {
        res.status(401).json({ error: 'Invalid or expired token.' });
        return false;
    }
}

// Requires a valid JWT — returns 401 if missing or invalid.
export const authMiddleware = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
    }
    const ok = await validateSession(token, req, res);
    if (!ok) return;
    next();
};

// Attaches userId if a valid token is present, but does not block unauthenticated requests.
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

// Requires authentication AND admin role. Always chain after authMiddleware.
export const adminMiddleware = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
    }
    try {
        const user = await User.findById(req.userId).select('role').lean();
        if (!user || (user as any).role !== 'admin') {
            res.status(403).json({ error: 'Admin access required.' });
            return;
        }
        next();
    } catch {
        res.status(500).json({ error: 'Authorization check failed.' });
    }
};
