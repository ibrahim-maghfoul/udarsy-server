import mongoose, { Schema, Document } from 'mongoose';

export interface IRankEntry {
    userId: mongoose.Types.ObjectId;
    displayName: string;
    photoURL?: string;
    guidanceId?: string;
    score: number;            // composite ranking score
    points: number;
    learningTime: number;     // minutes
    contributionCount: number;
    newsInteractions: number;
    chatMessages: number;
    rank: number;             // 1 = first
}

export interface IMonthlyRank extends Document {
    month: string;            // "YYYY-MM"
    entries: IRankEntry[];
    computedAt: Date;
}

const RankEntrySchema = new Schema<IRankEntry>({
    userId:            { type: Schema.Types.ObjectId, ref: 'User', required: true },
    displayName:       { type: String, required: true },
    photoURL:          { type: String },
    guidanceId:        { type: String },
    score:             { type: Number, default: 0 },
    points:            { type: Number, default: 0 },
    learningTime:      { type: Number, default: 0 },
    contributionCount: { type: Number, default: 0 },
    newsInteractions:  { type: Number, default: 0 },
    chatMessages:      { type: Number, default: 0 },
    rank:              { type: Number, required: true },
}, { _id: false });

const MonthlyRankSchema = new Schema<IMonthlyRank>({
    month:      { type: String, required: true, unique: true, index: true },
    entries:    [RankEntrySchema],
    computedAt: { type: Date, default: () => new Date() },
});

export const MonthlyRank = mongoose.model<IMonthlyRank>('MonthlyRank', MonthlyRankSchema);
