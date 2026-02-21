/**
 * Tiny in-process TTL cache for server-side hot-path responses.
 * Not a replacement for Redis — suited for single-instance deployments
 * where a few seconds of stale data is acceptable (stats, chart-data, etc.)
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MicroCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /** Read a cached value. Returns undefined if missing or expired. */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Store a value with a TTL (ms). */
  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Remove a specific key (e.g. after a mutation invalidates it). */
  del(key: string): void {
    this.store.delete(key);
  }

  /** Remove all keys whose names start with `prefix`. */
  delByPrefix(prefix: string): void {
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

export const cache = new MicroCache();
