import mongoose, { Schema, Document } from 'mongoose';

export interface INewsletter extends Document {
    email: string;
    subscribedAt: Date;
}

const NewsletterSchema = new Schema<INewsletter>({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    subscribedAt: {
        type: Date,
        default: Date.now,
    },
});

export const Newsletter = mongoose.model<INewsletter>('Newsletter', NewsletterSchema, 'newsletter_emails');
