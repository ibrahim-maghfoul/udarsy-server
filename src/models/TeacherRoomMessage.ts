import mongoose, { Schema, Document } from 'mongoose';

export interface ITeacherRoomMessage extends Document {
    roomId: mongoose.Types.ObjectId;
    sender: mongoose.Types.ObjectId;
    text?: string;
    /** type: text | file | link */
    messageType: 'text' | 'file' | 'link';
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    linkUrl?: string;
    linkTitle?: string;
    replyTo?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const TeacherRoomMessageSchema = new Schema<ITeacherRoomMessage>({
    roomId:      { type: Schema.Types.ObjectId, ref: 'TeacherRoom', required: true, index: true },
    sender:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text:        { type: String },
    messageType: { type: String, enum: ['text', 'file', 'link'], default: 'text' },
    fileUrl:     { type: String },
    fileName:    { type: String },
    fileSize:    { type: Number },
    linkUrl:     { type: String },
    linkTitle:   { type: String },
    replyTo:     { type: Schema.Types.ObjectId, ref: 'TeacherRoomMessage' },
}, {
    timestamps: true,
});

TeacherRoomMessageSchema.index({ roomId: 1, createdAt: -1 });

export const TeacherRoomMessage = mongoose.model<ITeacherRoomMessage>(
    'TeacherRoomMessage',
    TeacherRoomMessageSchema
);
