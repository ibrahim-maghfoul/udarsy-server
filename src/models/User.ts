import mongoose, { Schema, Document } from 'mongoose';

export interface CalEvent {
    id: string;
    title: string;
    desc?: string;
    date: string;       // YYYY-MM-DD
    endDate?: string;
    time?: string;      // HH:MM
    endTime?: string;
    duration?: number;  // minutes
    allDay?: boolean;
    category: string;
    color: string;
    reminder?: boolean;
    reminderMins?: number;
    createdAt: string;
    updatedAt?: string;
    isGlobal?: boolean;
}

export interface CalTodo {
    id: string;
    label: string;
    done: boolean;
    createdAt: string;
    completedAt?: string | null;
    updatedAt?: string;
}


export interface IUser extends Document {
    displayName: string;
    email: string;
    password: string;
    role: 'user' | 'admin' | 'instructor' | 'teacher';
    photoURL?: string;
    photoURLOriginal?: string;
    coverPhotoURL?: string;
    coverPhotoURLOriginal?: string;
    subscription: {
        plan: 'free' | 'premium' | 'pro';
        billingCycle: 'monthly' | 'yearly' | 'none';
        expiresAt?: Date;
    };
    level?: {
        school: string;
        level: string;
        guidance: string;
    };
    phone?: string;
    nickname?: string;
    city?: string;
    age?: number;
    birthday?: Date;
    gender?: 'male' | 'female';
    schoolName?: string;
    studyLocation?: string;
    progress: {
        totalLessons: number;
        completedLessons: number;
        learningTime: number; // in minutes
        documentsOpened: number;
        videosWatched: number;
        usageTime: number;
        timeSpentHistory: {
            date: string; // YYYY-MM-DD
            minutes: number;
            filesOpened?: number;
        }[];
        savedNews: string[];
        lessons: {
            lessonId: string;
            subjectId: string;
            isFavorite: boolean;
            lastAccessed: Date;
            totalTimeSpent: number;
            completedResources: string[];
            totalResourcesCount: number;
        }[];
    };
    settings: {
        notifications: boolean;
        theme: 'light' | 'dark' | 'system';
    };
    selectedPath?: {
        schoolId: string;
        levelId: string;
        guidanceId: string;
    };
    calendar: {
        events: CalEvent[];
        todos: CalTodo[];
    };
    points: number;
    affiliateCode?: string;
    referredBy?: string;
    pointsPremiumGrantedAt?: Date;
    contributionCount: {
        count: number;
        resetAt: Date;
    };
    refreshToken?: string;
    sessionId?: string;
    aiLastRegenDate?: Date;
    aiRegenCountToday?: number;
    chatMutedUntil?: Date;
    createdAt: Date;
    updatedAt: Date;
    isPremium: boolean; // virtual
}

const UserSchema = new Schema<IUser>({
    displayName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin', 'instructor', 'teacher'], default: 'user' },
    photoURL: { type: String },
    photoURLOriginal: { type: String },
    coverPhotoURL: { type: String },
    coverPhotoURLOriginal: { type: String },
    subscription: {
        plan: { type: String, enum: ['free', 'premium', 'pro'], default: 'free' },
        billingCycle: { type: String, enum: ['monthly', 'yearly', 'none'], default: 'none' },
        expiresAt: { type: Date },
    },
    level: {
        school: String,
        level: String,
        guidance: String,
    },
    phone: String,
    nickname: String,
    city: String,
    age: { type: Number, max: 80 },
    birthday: { type: Date },
    gender: { type: String, enum: ['male', 'female'] },
    schoolName: String,
    studyLocation: String,
    progress: {
        totalLessons: { type: Number, default: 0 },
        completedLessons: { type: Number, default: 0 },
        learningTime: { type: Number, default: 0 },
        documentsOpened: { type: Number, default: 0 },
        videosWatched: { type: Number, default: 0 },
        usageTime: { type: Number, default: 0 },
        timeSpentHistory: [{
            date: { type: String, required: true },
            minutes: { type: Number, default: 0 },
            filesOpened: { type: Number, default: 0 },
        }],
        savedNews: { type: [String], default: [] },
        lessons: [{
            lessonId: { type: String, required: true },
            subjectId: { type: String, required: true },
            isFavorite: { type: Boolean, default: false },
            lastAccessed: { type: Date, default: Date.now },
            totalTimeSpent: { type: Number, default: 0 },
            completedResources: { type: [String], default: [] },
            totalResourcesCount: { type: Number, default: 0 },
        }],
    },
    settings: {
        notifications: { type: Boolean, default: true },
        theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    },
    selectedPath: {
        schoolId: String,
        levelId: String,
        guidanceId: String,
    },
    calendar: {
        events: { type: [Schema.Types.Mixed], default: [] },
        todos:  { type: [Schema.Types.Mixed], default: [] },
    },
    points: { type: Number, default: 0 },
    affiliateCode: { type: String, unique: true, sparse: true },
    referredBy: { type: String },
    pointsPremiumGrantedAt: { type: Date },
    contributionCount: {
        count: { type: Number, default: 0 },
        resetAt: { type: Date, default: () => new Date() },
    },
    refreshToken: { type: String, select: false },
    sessionId: { type: String, select: false },
    aiLastRegenDate: { type: Date },
    aiRegenCountToday: { type: Number, default: 0 },
    chatMutedUntil: { type: Date },
}, {
    timestamps: true,
});

// Pre-save hook to seed timeSpentHistory for new users
UserSchema.pre('save', function(next) {
    if (this.isNew && (!this.progress.timeSpentHistory || this.progress.timeSpentHistory.length === 0)) {
        const history = [];
        const today = new Date();
        // Generate last 7 days including today
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            // Random minutes between 15 and 120
            const randomMinutes = Math.floor(Math.random() * (120 - 15 + 1) + 15);
            history.push({ date: dateStr, minutes: randomMinutes });
        }
        this.progress.timeSpentHistory = history;
        
        // Also update total learningTime to match the seeded data
        this.progress.learningTime = history.reduce((sum, entry) => sum + entry.minutes, 0);
    }
    next();
});

// Indexes for better query performance
UserSchema.index({ 'progress.lessons.lessonId': 1 });
UserSchema.index({ 'progress.lessons.subjectId': 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ 'selectedPath.guidanceId': 1 });
UserSchema.index({ 'subscription.plan': 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ points: -1 });


// Virtual: isPremium is true when plan is 'premium' or 'pro'
UserSchema.virtual('isPremium').get(function (this: IUser) {
    return this.subscription?.plan === 'premium' || this.subscription?.plan === 'pro';
});

export const User = mongoose.model<IUser>('User', UserSchema);
