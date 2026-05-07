import mongoose, { Schema, Document } from 'mongoose';

export interface ISchool extends Document {
    title: string;
    category: string;
    createdAt: Date;
    updatedAt: Date;
}

const SchoolSchema = new Schema<ISchool>({
    _id: { type: String, required: true } as any, // Cast to any to bypass strict ObjectId check for _id
    title: { type: String, required: true },
    category: { type: String, required: true },
}, {
    timestamps: true,
});

export const School = mongoose.model<ISchool>('School', SchoolSchema);
