import mongoose, { Schema, Document } from 'mongoose';

export interface IUserReport extends Document {
    reporterId: mongoose.Types.ObjectId;
    reportedUserId: mongoose.Types.ObjectId;
    messageId?: mongoose.Types.ObjectId;
    reason: string;
    details: string;
    status: 'pending' | 'resolved' | 'dismissed';
    createdAt: Date;
    updatedAt: Date;
}

const UserReportSchema = new Schema<IUserReport>({
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: false },
    reason: { type: String, required: true },
    details: { type: String, required: true },
    status: { type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending' },
}, {
    timestamps: true
});

export const UserReport = mongoose.model<IUserReport>('UserReport', UserReportSchema);
