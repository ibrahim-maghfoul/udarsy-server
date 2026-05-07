import { Request, Response } from 'express';

const GA_MEASUREMENT_ID  = process.env.GA_MEASUREMENT_ID ?? '';
const GA_API_SECRET      = process.env.GA_API_SECRET ?? '';
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
