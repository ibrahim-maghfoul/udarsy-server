import mongoose, { Schema, Document } from 'mongoose';

export interface IAiRating {
    userId: string;
    rating: number; // 1-5
    createdAt: Date;
}

export interface IAiAnswer extends Document {
    docId: string;
    documentTitle: string;
    lessonTitle: string;
    answer: string;
    language: string; // 'fr' | 'ar' | 'en'
    ratings: IAiRating[];
    avgRating: number;
    ratingCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const AiRatingSchema = new Schema<IAiRating>({
    userId: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });

const AiAnswerSchema = new Schema<IAiAnswer>({
    docId: { type: String, required: true, index: true },
    documentTitle: { type: String, required: true },
    lessonTitle: { type: String, default: '' },
    answer: { type: String, required: true },
    language: { type: String, default: 'fr', enum: ['fr', 'ar', 'en'] },
    ratings: { type: [AiRatingSchema], default: [] },
    avgRating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
}, { timestamps: true });

// Compound unique index: one answer per doc per language
AiAnswerSchema.index({ docId: 1, language: 1 }, { unique: true });

export const AiAnswer = mongoose.model<IAiAnswer>('AiAnswer', AiAnswerSchema);
