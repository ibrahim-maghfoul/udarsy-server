import mongoose, { Schema, Document } from 'mongoose';

export interface INewsQuestion extends Document {
    newsId: string;
    userId: mongoose.Types.ObjectId;
    question: string;
    answer?: string;
    createdAt: Date;
    updatedAt: Date;
}

const NewsQuestionSchema = new Schema<INewsQuestion>({
    newsId: { type: String, ref: 'News', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    question: { type: String, required: true },
    answer: { type: String },
}, {
    timestamps: true,
});

NewsQuestionSchema.index({ newsId: 1 });
NewsQuestionSchema.index({ userId: 1 });

export const NewsQuestion = mongoose.model<INewsQuestion>('NewsQuestion', NewsQuestionSchema);
