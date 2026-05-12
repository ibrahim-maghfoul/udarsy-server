import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { News } from '../models/News';
import { NewsQuestion } from '../models/NewsQuestion';

export class NewsController {
    // GET /api/news — list all, with optional pagination
    static async getAllNews(req: Request, res: Response): Promise<void> {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 100;
            const skip = (page - 1) * limit;

            const [news, total] = await Promise.all([
                News.find({}, {
                    title: 1, description: 1, summary: 1, category: 1, imageUrl: 1, image_alt: 1,
                    date: 1, card_date: 1, type: 1, readTime: 1, slug: 1,
                    attachments: 1, createdAt: 1, images: 1,
                    status: 1, language: 1, important_dates: 1,
                    rating: 1, viewCount: 1,
                })
                    .sort({ _id: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                News.countDocuments(),
            ]);

            res.json({ news, total, page, totalPages: Math.ceil(total / limit) });
        } catch (error) {
            console.error('Get all news error:', error);
            res.status(500).json({ error: 'Failed to fetch news' });
        }
    }

    // GET /api/news/latest-id — highest scraped article id already in DB
    static async getLatestId(_req: Request, res: Response): Promise<void> {
        try {
            // IDs are numeric strings like "1", "2", ..., "200"
            const latest = await News.find({}, { _id: 1 }).lean();
            const ids = latest.map(n => parseInt(n._id as string)).filter(n => !isNaN(n));
            const maxId = ids.length > 0 ? Math.max(...ids) : 0;
            res.json({ latestId: maxId, count: ids.length });
        } catch (error) {
            console.error('Get latest id error:', error);
            res.status(500).json({ error: 'Failed to get latest id' });
        }
    }

    // GET /api/news/:id
    static async getNewsById(req: AuthRequest, res: Response): Promise<void> {
        try {
            const news = await News.findById(req.params.id).lean();
            if (!news) {
                res.status(404).json({ error: 'News not found' });
                return;
            }

            // If user is authenticated, find their rating
            let userRating = 0;
            if (req.userId) {
                const ratingEntry = news.userRatings?.find(
                    (r: any) => r.userId.toString() === req.userId
                );
                if (ratingEntry) {
                    userRating = ratingEntry.rating;
                }
            }

            res.json({ ...news, userRating });
        } catch (error) {
            console.error('Get news by ID error:', error);
            res.status(500).json({ error: 'Failed to fetch news detail' });
        }
    }

    // POST /api/news
    static async createNews(req: AuthRequest, res: Response): Promise<void> {
        try {
            const news = new News(req.body);
            await news.save();
            res.status(201).json(news);
        } catch (error) {
            console.error('Create news error:', error);
            res.status(500).json({ error: 'Failed to create news' });
        }
    }

    // PUT /api/news/:id
    static async updateNews(req: AuthRequest, res: Response): Promise<void> {
        try {
            const news = await News.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!news) {
                res.status(404).json({ error: 'News not found' });
                return;
            }
            res.json(news);
        } catch (error) {
            console.error('Update news error:', error);
            res.status(500).json({ error: 'Failed to update news' });
        }
    }

    // DELETE    // Delete all news
    static async deleteAllNews(_req: Request, res: Response): Promise<void> {
        try {
            await News.deleteMany({});
            res.json({ message: 'All news deleted successfully' });
        } catch (error) {
            console.error('Delete all news error:', error);
            res.status(500).json({ error: 'Failed to delete all news' });
        }
    }

    // DELETE /api/news/:id
    static async deleteNews(req: AuthRequest, res: Response): Promise<void> {
        try {
            const news = await News.findByIdAndDelete(req.params.id);
            if (!news) {
                res.status(404).json({ error: 'News not found' });
                return;
            }
            res.json({ message: 'News deleted successfully' });
        } catch (error) {
            console.error('Delete news error:', error);
            res.status(500).json({ error: 'Failed to delete news' });
        }
    }

    // POST /api/news/bulk-upsert — upload many articles at once (idempotent)
    // Accepts BOTH raw tawjihnet_full.json and organized-data.json formats.
    static async bulkUpsert(req: Request, res: Response): Promise<void> {
        try {
            const articles: any[] = req.body.articles;
            if (!Array.isArray(articles) || articles.length === 0) {
                res.status(400).json({ error: 'articles array is required' });
                return;
            }

            const FALLBACK_IMG = 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800';

            const ops = articles.map((art: any) => {
                // Organized data uses art.image.url; raw data uses art.imageUrl
                const isOrganized = !!(art.slug || art.source_url || art.important_dates);

                const imageUrl = isOrganized
                    ? (art.image?.url || art.imageUrl || FALLBACK_IMG)
                    : (art.imageUrl || art.images?.[0]?.src || FALLBACK_IMG);

                const imageAlt = isOrganized
                    ? (art.image?.alt || art.image_alt || '')
                    : (art.card_img_alt || '');

                // description: organized has summary; raw uses first paragraph
                const description = art.summary
                    || art.description
                    || art.paragraphs?.[0]
                    || '';

                // source URL
                const sourceUrl = art.source_url || art.url || '';

                const docId = (art.id ?? art._id)?.toString();

                return {
                    updateOne: {
                        filter: { _id: docId },
                        update: {
                            $set: {
                                _id: docId,
                                title: art.title || 'Untitled',
                                description,
                                imageUrl,
                                image_alt: imageAlt,
                                category: art.category || 'General',
                                type: art.type || 'Information',
                                card_date: art.card_date || '',
                                url: sourceUrl,
                                readTime: art.readTime || `${Math.max(3, Math.floor((art.content_blocks?.length || art.content_sections?.length || 0) / 2))} min`,
                                date: art.date ? new Date(art.date) : new Date(),
                                // Raw fields (present in both; empty in organized)
                                paragraphs: art.paragraphs || [],
                                images: art.images || [],
                                content_blocks: art.content_blocks || [],
                                attachments: art.attachments || [],
                                links: art.links || [],
                                // Organized fields
                                slug: art.slug || '',
                                source_url: sourceUrl,
                                summary: art.summary || '',
                                important_dates: art.important_dates || [],
                                requirements: art.requirements || [],
                                steps: art.steps || [],
                                documents: art.documents || [],
                                content_sections: art.content_sections || [],
                                language: art.language || 'mixed',
                                status: art.status || 'unknown',
                            },
                        },
                        upsert: true,
                    },
                };
            });

            const result = await News.bulkWrite(ops, { ordered: false });
            res.json({
                message: 'Bulk upsert complete',
                upserted: result.upsertedCount,
                modified: result.modifiedCount,
                total: articles.length,
            });
        } catch (error) {
            console.error('Bulk upsert error:', error);
            res.status(500).json({ error: 'Bulk upsert failed' });
        }
    }

    // ── Q&A Methods ──────────────────────────────────────────────────────────

    // GET /api/news/:id/questions
    static async getQuestions(req: Request, res: Response): Promise<void> {
        try {
            const questions = await NewsQuestion.find({ newsId: req.params.id })
                .populate('userId', 'displayName photoURL')
                .sort({ createdAt: -1 })
                .lean();
            res.json(questions);
        } catch (error) {
            console.error('Get questions error:', error);
            res.status(500).json({ error: 'Failed to fetch questions' });
        }
    }

    // POST /api/news/:id/questions (Auth Required)
    static async askQuestion(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { question } = req.body;
            if (!question?.trim()) {
                res.status(400).json({ error: 'Question text is required' });
                return;
            }

            // Verify news exists
            const news = await News.findById(req.params.id);
            if (!news) {
                res.status(404).json({ error: 'News article not found' });
                return;
            }

            const newQ = new NewsQuestion({
                newsId: news._id,
                userId: req.userId,
                question: question.trim(),
            });
            await newQ.save();

            // Populate user for instant frontend display
            await newQ.populate('userId', 'displayName photoURL');

            res.status(201).json(newQ);
        } catch (error) {
            console.error('Ask question error:', error);
            res.status(500).json({ error: 'Failed to post question' });
        }
    }

    // PUT /api/admin/questions/:id/answer (Admin Required - or backend bypass for now if auth is simple)
    static async answerQuestion(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { answer } = req.body;
            if (!answer?.trim()) {
                res.status(400).json({ error: 'Answer text is required' });
                return;
            }

            // In a real app we'd check req.user.role === 'admin'. 
            // For now, any logged-in user hits this endpoint (or an admin can).

            const q = await NewsQuestion.findByIdAndUpdate(
                req.params.id,
                { $set: { answer: answer.trim() } },
                { new: true }
            ).populate('userId', 'displayName photoURL');

            if (!q) {
                res.status(404).json({ error: 'Question not found' });
                return;
            }

            res.json(q);
        } catch (error) {
            console.error('Answer question error:', error);
            res.status(500).json({ error: 'Failed to answer question' });
        }
    }

    // POST /api/news/:id/view — increment view count
    static async trackView(req: Request, res: Response): Promise<void> {
        try {
            const news = await News.findOneAndUpdate(
                { _id: req.params.id },
                { $inc: { viewCount: 1 } },
                { new: true }
            );
            if (!news) {
                res.status(404).json({ error: 'News not found' });
                return;
            }
            res.json({ viewCount: news.viewCount });
        } catch (error) {
            console.error('Track view error:', error);
            res.status(500).json({ error: 'Failed to track view' });
        }
    }

    // POST /api/news/:id/rate — submit a rating (1-5)
    static async rateNews(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { rating } = req.body;
            const userId = req.userId;

            if (!rating || rating < 1 || rating > 5) {
                res.status(400).json({ error: 'Rating must be between 1 and 5' });
                return;
            }

            const news = await News.findById(req.params.id);
            if (!news) {
                res.status(404).json({ error: 'News not found' });
                return;
            }

            if (!news.userRatings) {
                news.userRatings = [];
            }

            // Check if user already rated
            const existingRatingIndex = news.userRatings.findIndex(
                (r: any) => r.userId.toString() === userId
            );

            if (existingRatingIndex > -1) {
                // Update existing rating
                news.userRatings[existingRatingIndex].rating = rating;
            } else {
                // Add new rating
                news.userRatings.push({ userId: userId as any, rating });
            }

            // Recalculate stats
            const total = news.userRatings.reduce((sum, r) => sum + r.rating, 0);
            const count = news.userRatings.length;
            const average = total / count;

            news.rating = {
                average: Math.round(average * 10) / 10,
                count: count,
                total: total,
            };

            await news.save();

            res.json({
                rating: news.rating,
                userRating: rating
            });
        } catch (error) {
            console.error('Rate news error:', error);
            res.status(500).json({ error: 'Failed to rate news' });
        }
    }
}
