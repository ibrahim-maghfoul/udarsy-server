import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Simple schemas for the migration script
const UserSchema = new mongoose.Schema({
    progress: {
        totalLessons: { type: Number, default: 0 },
        completedLessons: { type: Number, default: 0 },
        lessons: { type: [mongoose.Schema.Types.Mixed], default: [] }
    }
}, { strict: false });

const User = mongoose.model('User', UserSchema);

async function migrateStats() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected.');

        console.log('Fetching users...');
        const users = await User.find({});
        console.log(`Found ${users.length} users.`);

        let updatedCount = 0;

        for (const user of users) {
             const lessons = user.progress?.lessons || [];
             let completedCount = 0;
             let totalCount = lessons.length;

             for (const lesson of lessons) {
                 if (lesson.isCompleted) {
                     completedCount++;
                 }
             }

             // If total is 0 but completed > 0 (data inconsistency), fix it
             if (totalCount < completedCount) {
                 totalCount = completedCount;
             }
             
             // Or if total is just missing
             if (totalCount === 0 && lessons.length > 0) {
                 totalCount = lessons.length;
             }

             // Add a default total if they have genuinely 0 history to show a full circle
             if (totalCount === 0) {
                 totalCount = 10;
                 completedCount = 0;
                 console.log(`User ${user._id} had 0 total courses. Defaulting total to 10 for visual charts.`);
             }

             if (user.progress) {
                 user.progress.totalLessons = totalCount;
                 user.progress.completedLessons = Math.min(completedCount, totalCount); // Ensure completed <= total
             }

             await user.save();
             updatedCount++;
        }

        console.log(`\nMigration completed successfully! Updated ${updatedCount} users.`);
        
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

migrateStats();
