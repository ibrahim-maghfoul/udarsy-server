import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from './auth';
import crypto from 'crypto';

const PROFILE_PICTURE_DIR = path.join(process.cwd(), 'data/images/profile-picture');
const COVER_PHOTO_DIR = path.join(process.cwd(), 'data/images/cover-photos');
const RESOURCE_DIR = path.join(process.cwd(), 'data/resources');
const VERIFICATION_DIR = path.join(process.cwd(), 'data/verifications');
const VIDEO_DIR = path.join(process.cwd(), 'data/videos');
const APPLICATIONS_DIR = path.join(process.cwd(), 'data/videos/applications');
const DOCUMENTS_DIR = path.join(process.cwd(), 'data/documents');

// Ensure upload directories exist
[PROFILE_PICTURE_DIR, COVER_PHOTO_DIR, RESOURCE_DIR, VERIFICATION_DIR, VIDEO_DIR, APPLICATIONS_DIR, DOCUMENTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

/** Sanitize filename: strip path traversal chars, null bytes, spaces, special chars */
function safeFilename(name: string): string {
    return name
        .replace(/\.\./g, '')       // path traversal
        .replace(/[/\\%\x00]/g, '') // slashes, percent-encoding, null bytes
        .replace(/[^a-zA-Z0-9._-]/g, '_') // only safe chars
        .substring(0, 100);         // max length
}

// --- Magic Bytes Lookup ---
const MAGIC_BYTES: Record<string, Buffer> = {
    'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
    'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    'image/gif': Buffer.from([0x47, 0x49, 0x46, 0x38]),
    'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
};

/** Verify uploaded file content matches its claimed MIME type via magic bytes. */
function verifyMagicBytes(mimetype: string, filePath: string): boolean {
    const expected = MAGIC_BYTES[mimetype];
    if (!expected) return true; // unknown type — allow, validate at filter level
    try {
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(expected.length);
        fs.readSync(fd, buffer, 0, expected.length, 0);
        fs.closeSync(fd);
        return buffer.slice(0, expected.length).equals(expected);
    } catch {
        return false;
    }
}

// --- Profile Picture Upload ---
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, PROFILE_PICTURE_DIR);
    },
    filename: (_req: AuthRequest, file, cb) => {
        // Rename to UUID to prevent filename injection
        const uuid = crypto.randomUUID();
        cb(null, `${uuid}${path.extname(safeFilename(file.originalname))}`);
    },
});

const imageFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = /image\/(jpeg|png|gif)/.test(file.mimetype);

    if (extOk && mimeOk) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPG, PNG, GIF) are allowed'));
    }
};

export const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: imageFileFilter,
});

// --- Resource Upload (PDFs + Images) ---
const resourceStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, RESOURCE_DIR);
    },
    filename: (req: AuthRequest, file, cb) => {
        const userId = req.userId || 'anonymous';
        const title = (req.body.resourceTitle || 'resource').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const uuid = crypto.randomUUID();
        const ext = path.extname(safeFilename(file.originalname)).toLowerCase();
        cb(null, `${userId}-${title}-${uuid}${ext}`);
    },
});

const allowedResourceMimes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const resourceFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedResourceMimes.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF and Image files (JPG, PNG) are allowed'));
    }
};

export const resourceUpload = multer({
    storage: resourceStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: resourceFileFilter,
});

// --- Video Upload (for teacher applications) ---
const videoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, VIDEO_DIR);
    },
    filename: (req: AuthRequest, file, cb) => {
        const userId = req.userId || 'anonymous';
        const uuid = crypto.randomUUID();
        const ext = path.extname(safeFilename(file.originalname)).toLowerCase();
        cb(null, `${userId}-demo-${uuid}${ext}`);
    },
});

const allowedVideoMimes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const videoFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedVideoMimes.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only video files (MP4, WebM, MOV) are allowed'));
    }
};

export const videoUpload = multer({
    storage: videoStorage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB for 15-min demo videos
    fileFilter: videoFileFilter,
});

// --- Instructor Course Upload (Videos + PDFs) ---
const courseStorage = multer.diskStorage({
    destination: (req: AuthRequest, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const userId = req.userId || 'anonymous';

        if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) {
            // Store videos in data/videos/applications/{userId}
            const userVideoDir = path.join(APPLICATIONS_DIR, userId);
            if (!fs.existsSync(userVideoDir)) {
                fs.mkdirSync(userVideoDir, { recursive: true });
            }
            cb(null, userVideoDir);
        } else {
            // Store PDFs in data/documents/{userId}
            const userDocDir = path.join(DOCUMENTS_DIR, userId);
            if (!fs.existsSync(userDocDir)) {
                fs.mkdirSync(userDocDir, { recursive: true });
            }
            cb(null, userDocDir);
        }
    },
    filename: (_req: AuthRequest, file, cb) => {
        const ext = path.extname(safeFilename(file.originalname)).toLowerCase();
        const uuid = crypto.randomUUID();
        cb(null, `${uuid}${ext}`);
    },
});

const allowedCourseMimes = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'application/pdf']);

const courseFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedCourseMimes.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only video (MP4, WebM, MOV, AVI, MKV) and PDF files are allowed'));
    }
};

export const courseUpload = multer({
    storage: courseStorage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB for videos
    fileFilter: courseFileFilter,
});

// --- Cover Photo Upload ---
const coverStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, COVER_PHOTO_DIR);
    },
    filename: (_req: AuthRequest, file, cb) => {
        const uuid = crypto.randomUUID();
        cb(null, `${uuid}${path.extname(safeFilename(file.originalname))}`);
    },
});

export const coverUpload = multer({
    storage: coverStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: imageFileFilter,
});

// --- Teacher Verification Document Upload (ID card, certificates — images or PDF) ---
const verificationStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, VERIFICATION_DIR);
    },
    filename: (_req: AuthRequest, file, cb) => {
        const uuid = crypto.randomUUID();
        cb(null, `${uuid}${path.extname(safeFilename(file.originalname))}`);
    },
});

const allowedVerificationMimes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif']);

const verificationFileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedVerificationMimes.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only images (JPG, PNG) and PDF files are allowed'));
    }
};

export const verificationUpload = multer({
    storage: verificationStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: verificationFileFilter,
});

/**
 * Post-upload magic bytes verification middleware.
 * Call AFTER multer has saved the file, before the controller.
 * If the file content doesn't match its claimed MIME type, delete it and reject.
 */
export const verifyUploadedFile = (req: any, res: any, next: any): void => {
    if (!req.file) { next(); return; }
    const { mimetype, path: filePath } = req.file;
    if (!verifyMagicBytes(mimetype, filePath)) {
        // Delete the suspicious file
        fs.unlink(filePath, () => { });
        res.status(400).json({ error: 'File content does not match its type. Upload rejected.' });
        return;
    }
    next();
};
