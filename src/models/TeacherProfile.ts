import mongoose, { Schema, Document } from 'mongoose';

export interface ITeacherRating {
    userId: mongoose.Types.ObjectId;
    rating: number; // 1-5
    comment?: string;
    createdAt: Date;
}

export interface ITeacherProfile extends Document {
    userId: mongoose.Types.ObjectId;
    fullName: string;
    bio?: string;
    photoURL?: string;
    specialist: string;
    schoolName: string; // real-life school where they teach
    guidanceId: string;
    subjectId: string;
    ratings: ITeacherRating[];
    averageRating: number;
    totalRatings: number;
    totalStudents: number;
    isVerified: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const TeacherRatingSchema = new Schema<ITeacherRating>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });

const TeacherProfileSchema = new Schema<ITeacherProfile>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true },
    bio: { type: String, maxlength: 1000 },
    photoURL: { type: String },
    specialist: { type: String, required: true },
    schoolName: { type: String, required: true },
    guidanceId: { type: String, required: true },
    subjectId: { type: String, required: true },
    ratings: { type: [TeacherRatingSchema], default: [] },
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    totalStudents: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
}, {
    timestamps: true,
});

TeacherProfileSchema.index({ guidanceId: 1 });
TeacherProfileSchema.index({ subjectId: 1 });
TeacherProfileSchema.index({ averageRating: -1 });
TeacherProfileSchema.index({ isActive: 1, isVerified: 1 });

export const TeacherProfile = mongoose.model<ITeacherProfile>('TeacherProfile', TeacherProfileSchema);
