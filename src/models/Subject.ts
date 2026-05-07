import mongoose, { Schema, Document } from 'mongoose';

export interface ISubject extends Document {
    title: string;
    guidanceId: string;
    imageUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}

const SubjectSchema = new Schema<ISubject>({
    _id: { type: String, required: true } as any,
    title: { type: String, required: true },
    guidanceId: { type: String, required: true, index: true },
    imageUrl: { type: String },
}, {
    timestamps: true,
    _id: false
});

export const Subject = mongoose.model<ISubject>('Subject', SubjectSchema);
