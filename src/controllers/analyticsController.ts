import { Request, Response } from 'express';
import crypto from 'crypto';

const GA_MEASUREMENT_ID  = process.env.GA_MEASUREMENT_ID ?? '';
const GA_API_SECRET      = process.env.GA_API_SECRET ?? '';
const GA4_PROPERTY_ID    = process.env.GA4_PROPERTY_ID ?? '';
const GA4_SERVICE_ACCOUNT_KEY = process.env.GA4_SERVICE_ACCOUNT_KEY ?? '';

// ─── GA4 Data API helpers ─────────────────────────────────────────────────────

let _cachedToken: { token: string; expiresAt: number } | null = null;

async function getServiceAccountToken(keyJson: any): Promise<string> {
    if (_cachedToken && Date.now() < _cachedToken.expiresAt) return _cachedToken.token;

    const now = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        iss:   keyJson.client_email,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        aud:   'https://oauth2.googleapis.com/token',
        exp:   now + 3600,
        iat:   now,
    })).toString('base64url');

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(keyJson.private_key, 'base64url');
    const jwt = `${header}.${payload}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion:  jwt,
        }),
    });
    const data = await res.json() as { access_token: string };
    _cachedToken = { token: data.access_token, expiresAt: Date.now() + 55 * 60 * 1000 };
    return data.access_token;
}

async function ga4Report(propertyId: string, token: string, body: object) {
    const res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
            method:  'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        }
    );
    return res.json() as Promise<any>;
}
const GA_MP_URL          = 'https://www.google-analytics.com/mp/collect';

// ─── Internal helpers ──────────────────────────────────────────────────────────

interface MPPayload {
  client_id: string;
  user_id?:  string;
  events:    Array<{
    name:   string;
    params: Record<string, unknown>;
  }>;
}

/**
 * Send a Measurement Protocol hit to GA4.
 * Returns true on success, false on failure (non-throwing).
 */
async function sendToGA(payload: MPPayload): Promise<boolean> {
  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) {
    // Silently skip if not configured — dev environments often won't have this
    return false;
  }

  try {
    const url = `${GA_MP_URL}?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    // MP returns 204 on success
    return res.status === 204 || res.ok;
  } catch (err) {
    console.error('[Analytics] Measurement Protocol error:', err);
    return false;
  }
}

/** Extract client IP for geo enrichment */
function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    ''
  );
}

/** Generate a fallback client_id if the browser didn't supply one */
function fallbackClientId(req: Request): string {
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] ?? 'unknown';
  return `server-${Buffer.from(`${ip}:${ua}`).toString('base64').slice(0, 24)}`;
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const AnalyticsController = {

  /**
   * POST /api/analytics/event
   * Proxy a custom event through the Measurement Protocol.
   *
   * Body:
   *   name      — GA4 event name (required)
   *   params    — event parameters (optional)
   *   clientId  — GA _ga cookie value (optional, falls back to IP hash)
   *   userId    — authenticated user ID (optional, for cross-device tracking)
   */
  async trackEvent(req: Request, res: Response): Promise<void> {
    const { name, params = {}, clientId, userId } = req.body as {
      name:      string;
      params?:   Record<string, unknown>;
      clientId?: string;
      userId?:   string;
    };

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'event name is required' });
      return;
    }

    const payload: MPPayload = {
      client_id: clientId || fallbackClientId(req),
      ...(userId ? { user_id: userId } : {}),
      events: [{
        name,
        params: {
          ...params,
          // Enrich with server-side context
          engagement_time_msec: 1,
          session_id:           params.session_id ?? Date.now().toString(),
        },
      }],
    };

    const ok = await sendToGA(payload);

    // Always respond 200 — analytics failures shouldn't bubble to the client
    res.status(200).json({ success: ok, queued: !GA_MEASUREMENT_ID });
  },

  /**
   * POST /api/analytics/pageview
   * Record a page_view hit server-side (useful for SSR or Flutter app screens).
   *
   * Body:
   *   path      — page path (required), e.g. "/explore"
   *   title     — page title (optional)
   *   clientId  — GA client_id (optional)
   *   userId    — user ID (optional)
   *   referrer  — HTTP referrer (optional)
   */
  /**
   * GET /api/analytics/report?days=7
   * Read GA4 reporting data. Requires GA4_PROPERTY_ID + GA4_SERVICE_ACCOUNT_KEY env vars.
   */
  async getReport(req: Request, res: Response): Promise<void> {
    if (!GA4_PROPERTY_ID || !GA4_SERVICE_ACCOUNT_KEY) {
      res.json({ configured: false });
      return;
    }

    const days = Math.min(parseInt(req.query.days as string) || 7, 90);

    try {
      const keyJson = JSON.parse(GA4_SERVICE_ACCOUNT_KEY);
      const token   = await getServiceAccountToken(keyJson);

      const dateRange = { startDate: `${days}daysAgo`, endDate: 'today' };

      const [overview, pages] = await Promise.all([
        ga4Report(GA4_PROPERTY_ID, token, {
          dateRanges: [dateRange],
          metrics: [
            { name: 'sessions' },
            { name: 'activeUsers' },
            { name: 'screenPageViews' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
          ],
        }),
        ga4Report(GA4_PROPERTY_ID, token, {
          dateRanges: [dateRange],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 5,
        }),
      ]);

      const row = overview.rows?.[0]?.metricValues ?? [];
      const topPages = (pages.rows ?? []).map((r: any) => ({
        path:  r.dimensionValues?.[0]?.value ?? '/',
        views: parseInt(r.metricValues?.[0]?.value ?? '0'),
      }));

      res.json({
        configured: true,
        days,
        sessions:            parseInt(row[0]?.value ?? '0'),
        users:               parseInt(row[1]?.value ?? '0'),
        pageviews:           parseInt(row[2]?.value ?? '0'),
        bounceRate:          parseFloat((parseFloat(row[3]?.value ?? '0') * 100).toFixed(1)),
        avgSessionDuration:  parseFloat(parseFloat(row[4]?.value ?? '0').toFixed(1)),
        topPages,
      });
    } catch (err) {
      console.error('[Analytics] GA4 report error:', err);
      res.status(500).json({ configured: true, error: 'Failed to fetch GA4 data' });
    }
  },

  async trackPageView(req: Request, res: Response): Promise<void> {
    const { path, title, clientId, userId, referrer } = req.body as {
      path:      string;
      title?:    string;
      clientId?: string;
      userId?:   string;
      referrer?: string;
    };

    if (!path || typeof path !== 'string') {
      res.status(400).json({ error: 'path is required' });
      return;
    }

    const payload: MPPayload = {
      client_id: clientId || fallbackClientId(req),
      ...(userId ? { user_id: userId } : {}),
      events: [{
        name: 'page_view',
        params: {
          page_location: `https://udarsy.ma${path}`,
          page_path:     path,
          page_title:    title ?? path,
          page_referrer: referrer ?? req.headers.referer ?? '',
          engagement_time_msec: 1,
        },
      }],
    };

    const ok = await sendToGA(payload);
    res.status(200).json({ success: ok, queued: !GA_MEASUREMENT_ID });
  },
};
