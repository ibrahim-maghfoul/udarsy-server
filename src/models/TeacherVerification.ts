import mongoose, { Schema, Document } from 'mongoose';

export interface ITeacherVerification extends Document {
    userId: mongoose.Types.ObjectId;
    schoolName: string;
    city: string;               // city where they teach
    classLevel: string;         // e.g. "1ère Bac", "Tronc Commun"
    className?: string;         // specific class e.g. "3ème AS-B"
    position: string;           // e.g. "Mathematics Teacher"
    subject: string;        // subject they teach
    contactInfo: string;    // phone or email for post-verification contact
    documentUrl: string;        // uploaded file path
    documentType: 'id_card' | 'certificate' | 'school_letter' | 'other';
    status: 'pending' | 'approved' | 'rejected';
    reviewNote?: string;
    reviewedBy?: mongoose.Types.ObjectId;
    reviewedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const TeacherVerificationSchema = new Schema<ITeacherVerification>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    schoolName: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    classLevel: { type: String, required: true, trim: true, maxlength: 100 },
    className: { type: String, trim: true, maxlength: 100 },
    position: { type: String, required: true, trim: true, maxlength: 100 },
    subject: { type: String, required: true, trim: true, maxlength: 100 },
    contactInfo: { type: String, required: true, trim: true, maxlength: 200 },
    documentUrl: { type: String, required: true },
    documentType: {
        type: String,
        enum: ['id_card', 'certificate', 'school_letter', 'other'],
        required: true,
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewNote: { type: String },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
}, {
    timestamps: true,
});

TeacherVerificationSchema.index({ status: 1 });

export const TeacherVerification = mongoose.model<ITeacherVerification>('TeacherVerification', TeacherVerificationSchema);
