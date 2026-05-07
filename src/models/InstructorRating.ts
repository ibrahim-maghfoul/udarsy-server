import mongoose, { Schema, Document } from 'mongoose';

export interface IInstructorRating extends Document {
    userId: mongoose.Types.ObjectId;
    instructorId: mongoose.Types.ObjectId;
    rating: number; // 1-5
    feedback?: string;
    createdAt: Date;
    updatedAt: Date;
}

const InstructorRatingSchema = new Schema<IInstructorRating>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    feedback: { type: String, maxlength: 500, trim: true },
}, {
    timestamps: true,
});

// One rating per user per instructor
InstructorRatingSchema.index({ userId: 1, instructorId: 1 }, { unique: true });
// Index for fetching all ratings for an instructor (used in getRatings, aggregation)
InstructorRatingSchema.index({ instructorId: 1, createdAt: -1 });

export const InstructorRating = mongoose.model<IInstructorRating>('InstructorRating', InstructorRatingSchema);
