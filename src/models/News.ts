import mongoose, { Schema, Document } from 'mongoose';

export interface INews extends Document<string> {
    _id: string;
    // Core fields
    title: string;
    description: string;
    content?: string;
    imageUrl: string;
    date: Date;
    category: string;
    author?: string;
    readTime?: string;
    links?: { label: string; url: string; type?: string }[];

    // Scraped data fields (raw)
    type?: string;
    card_date?: string;
    url?: string;
    paragraphs?: string[];
    images?: { src: string; alt?: string }[];
    content_blocks?: mongoose.Schema.Types.Mixed[];
    attachments?: { label: string; url: string; format?: string }[];

    // Organized data fields (from organizer.py)
    slug?: string;
    source_url?: string;
    summary?: string;
    image_alt?: string;
    important_dates?: { label: string; date: string }[];
    requirements?: string[];
    steps?: string[];
    documents?: string[];
    content_sections?: { heading: string; body: string[] }[];
    language?: string;   // 'ar' | 'fr' | 'mixed'
    status?: string;     // 'open' | 'closed' | 'unknown'

    viewCount: number;
    rating: {
        average: number;
        count: number;
        total: number;
    };
    userRatings?: { userId: string; rating: number }[];

    createdAt: Date;
    updatedAt: Date;
}

const NewsSchema = new Schema<INews>({
    _id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    content: { type: String },
    imageUrl: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    category: { type: String, default: 'General' },
    author: { type: String },
    readTime: { type: String },
    links: [{ label: String, url: String }],

    // Scraped fields (raw)
    type: { type: String },
    card_date: { type: String },
    url: { type: String },
    paragraphs: [{ type: String }],
    images: [{ src: String, alt: String }],
    content_blocks: [{ type: Schema.Types.Mixed }],
    attachments: [{ label: String, url: String, format: String }],

    // Organized fields (from organizer.py output)
    slug: { type: String, index: true },
    source_url: { type: String },
    summary: { type: String },
    image_alt: { type: String },
    important_dates: [{ label: String, date: String }],
    requirements: [{ type: String }],
    steps: [{ type: String }],
    documents: [{ type: String }],
    content_sections: [{ heading: String, body: [String] }],
    language: { type: String, enum: ['ar', 'fr', 'mixed'], default: 'mixed' },
    status: { type: String, enum: ['open', 'closed', 'unknown'], default: 'unknown', index: true },

    viewCount: { type: Number, default: 0 },
    rating: {
        average: { type: Number, default: 0 },
        count: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
    },
    userRatings: [{
        userId: { type: String },
        rating: { type: Number, required: true }
    }],
}, {
    timestamps: true,
});

// Indexes for query performance
// language_override tells MongoDB NOT to treat the 'language' field as a text-index
// language hint — avoids MongoBulkWriteError 17262 ("language override unsupported: mixed")
NewsSchema.index({ title: 'text', description: 'text' }, { language_override: '_text_lang' });
NewsSchema.index({ category: 1 });
NewsSchema.index({ date: -1 });
NewsSchema.index({ viewCount: -1 });

export const News = mongoose.model<INews>('News', NewsSchema);
