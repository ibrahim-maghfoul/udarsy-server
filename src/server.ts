import express, { Application, Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { config } from './config';
import { connectDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { sanitizeInputs, sanitizeStrings, authRateLimiter, generalRateLimiter } from './middleware/security';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import progressRoutes from './routes/progress';
import dataRoutes from './routes/data';
import newsRoutes from './routes/news';
import newsletterRoutes from './routes/newsletter';
import contactRoutes from './routes/contact';
import chatRoutes from './routes/chat';
import calendarRoutes from './routes/calendar';
import teacherRoutes from './routes/teacher';
import instructorRoutes from './routes/instructor';
import posterRoutes from './routes/poster';
import leaderboardRoutes from './routes/leaderboard';
import notificationRoutes from './routes/notifications';
import aiRoutes from './routes/ai';
import analyticsRoutes from './routes/analytics';
import adminRoutes from './routes/admin';
import moroccanHolidaysRoutes from './routes/moroccanHolidays';
import { handleChatConnection } from './sockets/chat';
import { initSocketManager } from './sockets/socketManager';
import { verifyAccessToken } from './utils/auth';

const app: Application = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Socket.io auth middleware — verify JWT before allowing connection
io.use((socket, next) => {
    const token = socket.handshake.auth?.token ||
                  socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('Authentication required'));
    try {
        verifyAccessToken(token);
        next();
    } catch {
        next(new Error('Invalid token'));
    }
});

// Initialize socket manager so controllers can emit events
initSocketManager(io);

// Setup sockets
io.on('connection', (socket) => {
    handleChatConnection(io, socket);
});

// Connect to database
connectDatabase();

// ----- SECURITY MIDDLEWARE -----

// Helmet: sets many secure HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                // Google Analytics 4 / Tag Manager
                'https://www.googletagmanager.com',
                'https://www.google-analytics.com',
                'https://ssl.google-analytics.com',
            ],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: [
                "'self'", 'data:', 'https:',
                // GA4 beacon images
                'https://www.google-analytics.com',
            ],
            connectSrc: [
                "'self'",
                // GA4 Measurement Protocol endpoint
                'https://www.google-analytics.com',
                'https://analytics.google.com',
                'https://stats.g.doubleclick.net',
                'https://region1.google-analytics.com',
            ],
        },
    },
    crossOriginEmbedderPolicy: false, // Allow static resources
}));

// CORS
app.use(cors(config.cors));

// Body parsing (must come before sanitizers)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(config.cookie.secret));
app.use(compression());

// ----- INPUT SANITIZATION (apply globally after body parsing) -----
app.use(sanitizeInputs);    // Strip MongoDB operators from all inputs
app.use(sanitizeStrings);   // Strip HTML tags from string fields

// ----- RATE LIMITING -----
// Stricter rate limit for auth endpoints (brute-force protection)
app.use('/api/auth', authRateLimiter);
// General rate limit for all other API routes
app.use('/api/', generalRateLimiter);

// Logging middleware
if (config.nodeEnv === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/poster', posterRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/moroccan-holidays', moroccanHolidaysRoutes);
// 404 handler
app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = config.port;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} in ${config.nodeEnv} mode`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`🔒 Security middleware: NoSQL sanitizer, rate limiter, helmet enabled`);
    console.log(`💬 Socket.io real-time chat enabled`);
}).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Exiting...`);
        process.exit(1);
    } else {
        throw err;
    }
});

// Prevent server from crashing on unhandled errors
process.on('uncaughtException', (error) => {
    console.error('🔥 UNCAUGHT EXCEPTION! Server kept alive. Error:', error);
});

process.on('unhandledRejection', (reason, _promise) => {
    console.error('🔥 UNHANDLED REJECTION! Server kept alive. Reason:', reason);
});

export default app;
