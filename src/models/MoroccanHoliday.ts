import mongoose, { Schema, Document } from 'mongoose';

interface TranslationEntry {
    title: string;
    desc?: string;
}

export interface IMoroccanHoliday extends Document {
    id: string;
    title: string;
    desc?: string;
    translations: {
        ar: TranslationEntry;
        fr: TranslationEntry;
        en: TranslationEntry;
    };
    date: string;       // YYYY-MM-DD
    endDate?: string;
    category: string;
    color: string;
    isGlobal: true;
    createdAt: Date;
    updatedAt: Date;
}

const TranslationSchema = new Schema<TranslationEntry>(
    { title: { type: String, required: true }, desc: { type: String } },
    { _id: false }
);

const MoroccanHolidaySchema = new Schema<IMoroccanHoliday>({
    id:       { type: String, required: true, unique: true },
    title:    { type: String, required: true },
    desc:     { type: String },
    translations: {
        ar: { type: TranslationSchema, required: true },
        fr: { type: TranslationSchema, required: true },
        en: { type: TranslationSchema, required: true },
    },
    date:     { type: String, required: true },
    endDate:  { type: String },
    category: { type: String, required: true },
    color:    { type: String, required: true },
    isGlobal: { type: Boolean, default: true },
}, {
    timestamps: true,
});

export const MoroccanHoliday = mongoose.model<IMoroccanHoliday>('MoroccanHoliday', MoroccanHolidaySchema);
