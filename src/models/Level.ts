import mongoose, { Schema, Document } from 'mongoose';

export interface ILevel extends Document {
    title: string;
    schoolId: string;
    createdAt: Date;
    updatedAt: Date;
}

const LevelSchema = new Schema<ILevel>({
    _id: { type: String, required: true } as any,
    title: { type: String, required: true },
    schoolId: { type: String, required: true, index: true },
}, {
    timestamps: true,
    _id: false
});

export const Level = mongoose.model<ILevel>('Level', LevelSchema);
