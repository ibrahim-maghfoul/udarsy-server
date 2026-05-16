import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export interface IJoinRequest {
    userId: mongoose.Types.ObjectId;
    displayName: string;
    photoURL?: string;
    requestedAt: Date;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface IRoomRating {
    userId: mongoose.Types.ObjectId;
    rating: number;
    createdAt: Date;
}

export interface ITeacherRoom extends Document {
    teacherId: mongoose.Types.ObjectId;
    teacherProfileId: mongoose.Types.ObjectId;
    teacherSlug: string;
    name: string;
    description?: string;
    guidanceId: string;
    subjectId: string;
    roomCode: string;
    members: mongoose.Types.ObjectId[];
    joinRequests: IJoinRequest[];
    ratings: IRoomRating[];
    averageRating: number;
    totalRatings: number;
    maxMembers: number;
    isActive: boolean;
    lastMessagePreview?: string;
    lastMessageAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const JoinRequestSchema = new Schema<IJoinRequest>({
    userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    displayName: { type: String, required: true },
    photoURL:    { type: String },
    requestedAt: { type: Date, default: () => new Date() },
    status:      { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
}, { _id: false });

const RoomRatingSchema = new Schema<IRoomRating>({
    userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating:    { type: Number, required: true, min: 1, max: 5 },
    createdAt: { type: Date, default: () => new Date() },
}, { _id: false });

const TeacherRoomSchema = new Schema<ITeacherRoom>({
    teacherId:        { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherProfileId: { type: Schema.Types.ObjectId, ref: 'TeacherProfile', required: true },
    teacherSlug:      { type: String, required: true, index: true },
    name:             { type: String, required: true, maxlength: 100 },
    description:      { type: String, maxlength: 500 },
    guidanceId:       { type: String, required: true },
    subjectId:        { type: String, required: true },
    roomCode:         { type: String, required: true, unique: true, index: true },
    members:          [{ type: Schema.Types.ObjectId, ref: 'User' }],
    joinRequests:     [JoinRequestSchema],
    ratings:          { type: [RoomRatingSchema], default: [] },
    averageRating:    { type: Number, default: 0 },
    totalRatings:     { type: Number, default: 0 },
    maxMembers:       { type: Number, default: 50 },
    isActive:         { type: Boolean, default: true },
    lastMessagePreview: { type: String },
    lastMessageAt:      { type: Date },
}, {
    timestamps: true,
});

// Generate unique 6-char alphanumeric roomCode before validation so it passes required check
TeacherRoomSchema.pre('validate', function (next) {
    if (this.isNew && !this.roomCode) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        const bytes = crypto.randomBytes(6);
        for (let i = 0; i < 6; i++) {
            code += chars[bytes[i] % chars.length];
        }
        this.roomCode = code;
    }
    next();
});

TeacherRoomSchema.index({ guidanceId: 1, subjectId: 1 });
TeacherRoomSchema.index({ 'joinRequests.status': 1 });
TeacherRoomSchema.index({ members: 1 }); // getJoinedRooms queries members array

export const TeacherRoom = mongoose.model<ITeacherRoom>('TeacherRoom', TeacherRoomSchema);
