import mongoose, { Schema, Document } from 'mongoose';

export interface IGuidance extends Document {
    title: string;
    levelId: string;
    createdAt: Date;
    updatedAt: Date;
}

const GuidanceSchema = new Schema<IGuidance>({
    _id: { type: String, required: true } as any,
    title: { type: String, required: true },
    levelId: { type: String, required: true, index: true },
}, {
    timestamps: true,
    _id: false
});

export const Guidance = mongoose.model<IGuidance>('Guidance', GuidanceSchema);
