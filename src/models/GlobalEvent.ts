import mongoose, { Schema, Document } from 'mongoose';

export interface IGlobalEvent extends Document {
    id: string;
    title: string;
    desc?: string;
    date: string;       // YYYY-MM-DD
    endDate?: string;
    category: string;
    color: string;
    isGlobal: true;
    createdAt: Date;
    updatedAt: Date;
}

const GlobalEventSchema = new Schema<IGlobalEvent>({
    id:       { type: String, required: true, unique: true },
    title:    { type: String, required: true },
    desc:     { type: String },
    date:     { type: String, required: true },
    endDate:  { type: String },
    category: { type: String, required: true },
    color:    { type: String, required: true },
    isGlobal: { type: Boolean, default: true },
}, {
    timestamps: true,
});

export const GlobalEvent = mongoose.model<IGlobalEvent>('GlobalEvent', GlobalEventSchema);
