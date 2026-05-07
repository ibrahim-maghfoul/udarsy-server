import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController';

const router = Router();

/**
 * POST /api/analytics/event
 * Server-side Measurement Protocol proxy.
 * Forwards critical events to GA4 bypassing ad blockers.
 * Body: { name, params?, clientId? }
 */
router.post('/event', AnalyticsController.trackEvent);

/**
 * POST /api/analytics/pageview
 * Server-side page view (for SSR-rendered pages or native app screens).
 * Body: { path, title?, clientId?, userId? }
 */
router.post('/pageview', AnalyticsController.trackPageView);

export default router;
