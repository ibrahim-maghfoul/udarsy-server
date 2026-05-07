import mongoose, { Schema, Document } from 'mongoose';

export interface IReaction {
    emoji: string;
    userId: mongoose.Types.ObjectId;
}

export interface IMessage extends Document {
    chatRoomId: mongoose.Types.ObjectId;
    sender: mongoose.Types.ObjectId;
    text: string;
    reactions: IReaction[];
    replyTo?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const ReactionSchema = new Schema<IReaction>({
    emoji: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { _id: false });

const MessageSchema = new Schema<IMessage>({
    chatRoomId: { type: Schema.Types.ObjectId, ref: 'ChatRoom', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    reactions: [ReactionSchema], // Array of tiny reaction subdocuments
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message', required: false }
}, {
    timestamps: true
});

// Indexes for fast lookup by chatRoomId and chronological pagination
MessageSchema.index({ chatRoomId: 1, createdAt: -1 });

export default mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
