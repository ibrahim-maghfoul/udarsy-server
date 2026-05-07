import mongoose, { Schema, Document } from 'mongoose';

export interface IChatRoom extends Document {
    guidance: string;
    level: string;
    roomKey: string; // e.g., "Bac_Math"
    participants: mongoose.Types.ObjectId[];
    lastMessagePreview?: string;
    lastMessageAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ChatRoomSchema = new Schema<IChatRoom>({
    guidance: { type: String, required: true, index: true },
    level: { type: String, required: true, index: true },
    roomKey: { type: String, required: true, unique: true, index: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    lastMessagePreview: { type: String },
    lastMessageAt: { type: Date }
}, {
    timestamps: true
});

// Compound index for finding rooms by guidance and level
ChatRoomSchema.index({ guidance: 1, level: 1 });

export default mongoose.models.ChatRoom || mongoose.model<IChatRoom>('ChatRoom', ChatRoomSchema);
