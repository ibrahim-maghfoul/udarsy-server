import mongoose, { Schema, Document } from 'mongoose';

export interface IContribution extends Document {
    userId: string;
    resourceTitle: string;
    url: string;
    subjectId: string;
    lessonId: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: Date;
    updatedAt: Date;
}

const ContributionSchema = new Schema<IContribution>({
    userId: { type: String, required: true, index: true },
    resourceTitle: { type: String, required: true },
    url: { type: String, required: true },
    subjectId: { type: String, required: true },
    lessonId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, {
    timestamps: true
});

ContributionSchema.index({ status: 1 });
ContributionSchema.index({ subjectId: 1, userId: 1 });
ContributionSchema.index({ createdAt: -1 }); // sort by recent
ContributionSchema.index({ status: 1, createdAt: -1 }); // filter approved + sort
ContributionSchema.index({ lessonId: 1 }); // used in contribution filtering

export const Contribution = mongoose.model<IContribution>('Contribution', ContributionSchema);
