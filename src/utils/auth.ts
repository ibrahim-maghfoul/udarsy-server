import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config';

export const hashPassword = async (password: string): Promise<string> => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

// Hash a refresh token for secure DB storage (fast one-way hash — not bcrypt)
export const hashRefreshToken = (token: string): string =>
    crypto.createHash('sha256').update(token).digest('hex');

// Generate a cryptographically secure affiliate code
export const generateAffiliateCode = (): string =>
    crypto.randomBytes(4).toString('hex').toUpperCase();

export const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
    return bcrypt.compare(password, hashedPassword);
};

export const generateSessionId = (): string =>
    crypto.randomBytes(16).toString('hex');

export const generateAccessToken = (userId: string, sessionId?: string): string => {
    return jwt.sign({ userId, sessionId }, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    });
};

export const generateRefreshToken = (userId: string): string => {
    return jwt.sign({ userId }, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    });
};

export const verifyAccessToken = (token: string): { userId: string; sessionId?: string } => {
    return jwt.verify(token, config.jwt.secret) as { userId: string; sessionId?: string };
};

export const verifyRefreshToken = (token: string): { userId: string } => {
    return jwt.verify(token, config.jwt.refreshSecret) as { userId: string };
};
