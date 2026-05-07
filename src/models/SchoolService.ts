import mongoose, { Schema, Document } from 'mongoose';

export interface ISchoolService extends Document {
    title: string;
    description: string;
    icon: string; // URL or icon identifier
    category: 'vacation' | 'registration' | 'orientation' | 'other';
    content_blocks: any[];
    externalUrl?: string;
    isActive: boolean;
    order: number;
    createdAt: Date;
    updatedAt: Date;
}

const SchoolServiceSchema = new Schema<ISchoolService>({
    title: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, default: 'school' },
    category: {
        type: String,
        enum: ['vacation', 'registration', 'orientation', 'other'],
        default: 'other'
    },
    content_blocks: [{ type: Schema.Types.Mixed }],
    externalUrl: { type: String },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
}, {
    timestamps: true
});

export const SchoolService = mongoose.model<ISchoolService>('SchoolService', SchoolServiceSchema);
