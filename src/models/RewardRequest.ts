import mongoose, { Schema, Document } from 'mongoose';

export interface IRewardRequest extends Document {
    userId: string;
    userDisplayName: string;
    userEmail: string;
    userPoints: number;
    status: 'pending' | 'approved' | 'rejected';
    reviewNotes?: string;
    reviewedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const RewardRequestSchema = new Schema<IRewardRequest>({
    userId: { type: String, required: true, index: true },
    userDisplayName: { type: String, required: true },
    userEmail: { type: String, required: true },
    userPoints: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewNotes: { type: String },
    reviewedAt: { type: Date },
}, {
    timestamps: true
});

RewardRequestSchema.index({ status: 1, createdAt: -1 });

export const RewardRequest = mongoose.model<IRewardRequest>('RewardRequest', RewardRequestSchema);
