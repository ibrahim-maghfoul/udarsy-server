import mongoose from 'mongoose';
import { config } from '../config';

export const connectDatabase = async (): Promise<void> => {
    try {
        const uri = config.mongodb.uri;
        console.log(`🔌 Attempting to connect to MongoDB...`);
        const maskedUri = uri.replace(/:([^:@]+)@/, ':****@');
        console.log(`📝 Connection String: ${maskedUri}`);

        const options = {
            autoIndex: true,
            serverSelectionTimeoutMS: 5000,
            // Connection pool: allow up to 10 concurrent connections
            maxPoolSize: 10,
            minPoolSize: 2,
            // Socket timeout: don't wait forever on slow queries
            socketTimeoutMS: 30000,
            // Heartbeat: detect primary changes faster
            heartbeatFrequencyMS: 10000,
        };

        await mongoose.connect(uri, options);

        console.log('✅ MongoDB connected successfully');

        // Drop stale index left from schema rename inviteCode → roomCode
        try {
            await mongoose.connection.collection('teacherrooms').dropIndex('inviteCode_1');
            console.log('🔧 Dropped stale teacherrooms.inviteCode_1 index');
        } catch {
            // Index doesn't exist — nothing to do
        }

        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected');
        });

    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    }
};
