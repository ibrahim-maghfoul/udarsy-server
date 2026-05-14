import multer, { FileFilterCallback } from 'multer';
import multerS3 from 'multer-s3';
import { Request, Response, NextFunction } from 'express';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import path from 'path';
import crypto from 'crypto';
import { r2Client } from '../config/r2';
import { config } from '../config';

const BUCKET = config.r2.bucket;

type KeyCb = (error: any, key?: string) => void;

function safeFilename(name: string): string {
    return name
        .replace(/\.\./g, '')
        .replace(/[/\\%\x00]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .substring(0, 100);
}

function uuid(): string {
    return crypto.randomUUID();
}

// ─── Shared image filter ──────────────────────────────────────────────────────

const imageFileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const extOk = /jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = /image\/(jpeg|png|gif|webp)/.test(file.mimetype);
    extOk && mimeOk ? cb(null, true) : cb(new Error('Only image files (JPG, PNG, GIF, WebP) are allowed'));
};

// ─── R2 upload helpers ────────────────────────────────────────────────────────

async function uploadToR2(body: Buffer, key: string, contentType: string): Promise<void> {
    await r2Client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}

/**
 * Dual-save: uploads the raw original as lossless PNG to originals/ (owner only),
 * then uploads a web-optimized WebP to the display path.
 * Returns the display key (stored in MongoDB).
 */
async function dualUpload(buffer: Buffer, originalKey: string, displayKey: string, options: {
    width?: number;
    height?: number;
    fit?: keyof sharp.FitEnum;
    webpQuality?: number;
}): Promise<void> {
    const { width, height, fit = 'inside', webpQuality = 82 } = options;

    // 1 — Original: lossless PNG, full resolution, stored for owner only
    const original = await sharp(buffer).png({ compressionLevel: 0 }).toBuffer();
    await uploadToR2(original, originalKey, 'image/png');

    // 2 — Display: resized + WebP for fast loading across the website
    let pipeline = sharp(buffer);
    if (width || height) pipeline = pipeline.resize(width, height, { fit, withoutEnlargement: true });
    const display = await pipeline.webp({ quality: webpQuality }).toBuffer();
    await uploadToR2(display, displayKey, 'image/webp');
}

// ─── Profile Picture Upload ───────────────────────────────────────────────────
// multer collects buffer → processProfileImage middleware optimizes + uploads

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFileFilter,
});

export async function processProfileImage(req: any, _res: Response, next: NextFunction): Promise<void> {
    if (!req.file) return next();
    try {
        const id = uuid();
        const originalKey = `profile/original/${id}.png`;
        const displayKey  = `profile/optimized/${id}.webp`;
        await dualUpload(req.file.buffer, originalKey, displayKey,
            { width: 600, height: 600, fit: 'cover', webpQuality: 85 }
        );
        req.file.key         = displayKey;
        req.file.originalKey = originalKey;
        next();
    } catch (err) {
        next(err);
    }
}

// ─── Cover Photo Upload ───────────────────────────────────────────────────────

export const coverUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: imageFileFilter,
});

export async function processCoverImage(req: any, _res: Response, next: NextFunction): Promise<void> {
    if (!req.file) return next();
    try {
        const id = uuid();
        const originalKey = `cover/original/${id}.png`;
        const displayKey  = `cover/optimized/${id}.webp`;
        await dualUpload(req.file.buffer, originalKey, displayKey,
            { width: 1920, height: 640, fit: 'cover', webpQuality: 80 }
        );
        req.file.key         = displayKey;
        req.file.originalKey = originalKey;
        next();
    } catch (err) {
        next(err);
    }
}

// ─── Resource Upload (PDFs + Images for contributions) ───────────────────────

export const resourceUpload = multer({
    storage: multerS3({
        s3: r2Client,
        bucket: BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req: any, file: Express.Multer.File, cb: KeyCb) => {
            const userId = req.userId || 'anonymous';
            const title = (req.body?.resourceTitle || 'resource').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const ext = path.extname(safeFilename(file.originalname)).toLowerCase();
            cb(null, `resources/${userId}-${title}-${uuid()}${ext}`);
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
        const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
        allowed.has(file.mimetype) ? cb(null, true) : cb(new Error('Only PDF and Image files (JPG, PNG) are allowed'));
    },
});

// ─── Teacher Verification Document Upload ────────────────────────────────────
// Images are optimized with sharp; PDFs are streamed directly via multer-s3

export const verificationUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
        const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif']);
        allowed.has(file.mimetype) ? cb(null, true) : cb(new Error('Only images (JPG, PNG) and PDF files are allowed'));
    },
});

export async function processVerificationDoc(req: any, _res: Response, next: NextFunction): Promise<void> {
    if (!req.file) return next();
    try {
        const isPdf = req.file.mimetype === 'application/pdf';

        if (isPdf) {
            const key = `verifications/${uuid()}.pdf`;
            await r2Client.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: req.file.buffer,
                ContentType: 'application/pdf',
            }));
            req.file.key = key;
        } else {
            const id = uuid();
            await dualUpload(req.file.buffer,
                `verifications/original/${id}.png`,
                `verifications/optimized/${id}.webp`,
                { width: 2000, height: 2000, webpQuality: 90 }
            );
            const key = `verifications/optimized/${id}.webp`;
            req.file.key = key;
        }
        next();
    } catch (err) {
        next(err);
    }
}

// ─── Video Upload (teacher application demo videos) ──────────────────────────

export const videoUpload = multer({
    storage: multerS3({
        s3: r2Client,
        bucket: BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req: any, file: Express.Multer.File, cb: KeyCb) => {
            const userId = req.userId || 'anonymous';
            const ext = path.extname(safeFilename(file.originalname)).toLowerCase();
            cb(null, `videos/${userId}-demo-${uuid()}${ext}`);
        },
    }),
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
        const allowed = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
        allowed.has(file.mimetype) ? cb(null, true) : cb(new Error('Only video files (MP4, WebM, MOV) are allowed'));
    },
});

// ─── Instructor Course Upload (Videos + PDFs) ─────────────────────────────────

export const courseUpload = multer({
    storage: multerS3({
        s3: r2Client,
        bucket: BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req: any, file: Express.Multer.File, cb: KeyCb) => {
            const userId = req.userId || 'anonymous';
            const ext = path.extname(safeFilename(file.originalname)).toLowerCase();
            const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext);
            const prefix = isVideo ? `videos/courses/${userId}` : `documents/courses/${userId}`;
            cb(null, `${prefix}/${uuid()}${ext}`);
        },
    }),
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
        const allowed = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'application/pdf']);
        allowed.has(file.mimetype) ? cb(null, true) : cb(new Error('Only video (MP4, WebM, MOV, AVI, MKV) and PDF files are allowed'));
    },
});

// ─── Teacher Room File Upload ─────────────────────────────────────────────────

export const roomFileUpload = multer({
    storage: multerS3({
        s3: r2Client,
        bucket: BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (_req: Request, file: Express.Multer.File, cb: KeyCb) => {
            const safeName = safeFilename(file.originalname);
            cb(null, `room-files/${uuid()}-${safeName}`);
        },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
});
