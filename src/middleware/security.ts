import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Recursively sanitize an object by removing keys that start with '$'
 * or contain '.', which are used in NoSQL injection attacks.
 */
function sanitizeValue(value: any): any {
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value !== null && typeof value === 'object') {
        const sanitized: Record<string, any> = {};
        for (const key of Object.keys(value)) {
            // Drop keys used in MongoDB operator injection
            if (key.startsWith('$') || key.includes('.')) {
                continue;
            }
            sanitized[key] = sanitizeValue(value[key]);
        }
        return sanitized;
    }
    return value;
}

/**
 * Middleware: Sanitize all incoming request data to prevent NoSQL injection.
 * Strips MongoDB operators ($gt, $ne, etc.) from body, query, and params.
 */
export const sanitizeInputs = (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body) req.body = sanitizeValue(req.body);
    if (req.query) req.query = sanitizeValue(req.query) as any;
    if (req.params) req.params = sanitizeValue(req.params);
    next();
};

/**
 * Middleware: Strip HTML tags from string fields to prevent XSS stored in DB.
 */
function stripHtml(value: any): any {
    if (typeof value === 'string') {
        return value
            .replace(/<[^>]*>?/g, '')         // strip HTML tags
            .replace(/&lt;.*?&gt;/gi, '')     // strip encoded tags
            .replace(/on\w+\s*=/gi, '')       // strip event handlers
            .replace(/javascript\s*:/gi, '')  // strip javascript: URIs
            .trim();
    }
    if (Array.isArray(value)) {
        return value.map(stripHtml);
    }
    if (value !== null && typeof value === 'object') {
        const cleaned: Record<string, any> = {};
        for (const key of Object.keys(value)) {
            cleaned[key] = stripHtml(value[key]);
        }
        return cleaned;
    }
    return value;
}

export const sanitizeStrings = (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body) req.body = stripHtml(req.body);
    next();
};

/**
 * Middleware: Validate that the request comes from a trusted client
 * (Mobile App or Website) using a shared API key in the X-App-Key header.
 * 
 * This is a lightweight origin validation — not a replacement for auth,
 * but a first line of defense against random scanners and bots.
 */
export const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
    const expectedKey = config.apiKey;

    // If no API key is configured, skip validation (dev mode)
    if (!expectedKey) {
        next();
        return;
    }

    const providedKey = req.headers['x-app-key'];
    if (!providedKey || providedKey !== expectedKey) {
        res.status(403).json({ error: 'Forbidden: Invalid API key' });
        return;
    }
    next();
};

/**
 * Strict rate limiter for auth routes to prevent brute-force attacks.
 */
import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                   // 20 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many authentication attempts. Please try again in 15 minutes.',
    },
    skipSuccessfulRequests: false,
});

export const generalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests from this IP, please try again later.' },
});
