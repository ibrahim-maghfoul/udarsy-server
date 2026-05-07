import mongoose, { Schema, Document } from 'mongoose';

export interface ITeacherApplication extends Document {
    userId: mongoose.Types.ObjectId;
    fullName: string;
    email: string;
    age: number;
    studyBranch: string;
    studyLevel: string;
    specialist: string;
    currentStand: string; // e.g. "student", "employed", "freelance"
    targetLevelId: string; // level the teacher wants to teach
    targetGuidanceId: string; // guidance chosen from that level
    targetSubjectId: string; // subject within guidance to explain
    videoUrl: string; // uploaded 15-min demo video filename
    status: 'pending' | 'approved' | 'rejected';
    reviewNote?: string;
    reviewedBy?: mongoose.Types.ObjectId;
    reviewedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const TeacherApplicationSchema = new Schema<ITeacherApplication>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    age: { type: Number, required: true, min: 16, max: 80 },
    studyBranch: { type: String, required: true },
    studyLevel: { type: String, required: true },
    specialist: { type: String, required: true },
    currentStand: { type: String, required: true },
    targetLevelId: { type: String, required: true },
    targetGuidanceId: { type: String, required: true },
    targetSubjectId: { type: String, required: true },
    videoUrl: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewNote: { type: String },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
}, {
    timestamps: true,
});

TeacherApplicationSchema.index({ status: 1 });
TeacherApplicationSchema.index({ userId: 1, status: 1 });

export const TeacherApplication = mongoose.model<ITeacherApplication>('TeacherApplication', TeacherApplicationSchema);
