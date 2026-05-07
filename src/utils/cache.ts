/**
 * Simple in-memory TTL cache for semi-static data (curriculum hierarchy, stats).
 * Avoids repeated DB hits for data that changes only via admin actions.
 *
 * Usage:
 *   const cached = ttlCache.get<School[]>('schools');
 *   if (cached) return cached;
 *   const data = await School.find().lean();
 *   ttlCache.set('schools', data);
 */

interface CacheEntry<T = unknown> {
    data: T;
    expiresAt: number;
}

class TTLCache {
    private store = new Map<string, CacheEntry>();
    private defaultTTL: number;

    constructor(defaultTTLMs = 5 * 60_000) { // 5 minutes default
        this.defaultTTL = defaultTTLMs;
    }

    get<T>(key: string): T | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.data as T;
    }

    set<T>(key: string, data: T, ttlMs?: number): void {
        this.store.set(key, {
            data,
            expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
        });
    }

    /** Invalidate a single key */
    del(key: string): void {
        this.store.delete(key);
    }

    /** Invalidate all keys matching a prefix (e.g. 'curriculum:') */
    invalidatePrefix(prefix: string): void {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) this.store.delete(key);
        }
    }

    /** Clear entire cache */
    clear(): void {
        this.store.clear();
    }
}

// Singleton — shared across the entire backend
export const cache = new TTLCache(5 * 60_000);
