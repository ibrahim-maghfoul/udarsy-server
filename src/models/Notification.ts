import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
    userId: mongoose.Types.ObjectId;
    type: 'room_accepted' | 'room_rejected' | 'join_request';
    title: string;
    body: string;
    data?: Record<string, any>;
    read: boolean;
    createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type:   { type: String, required: true },
    title:  { type: String, required: true },
    body:   { type: String, required: true },
    data:   { type: Schema.Types.Mixed },
    read:   { type: Boolean, default: false },
}, { timestamps: true });

// Compound index covers: list unread for user, mark-all-read, paginated history
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
