/**
 * apps/api/src/lib/cache/inMemoryCache.ts
 * Lightweight server-side in-memory cache with configurable TTL (default 60 seconds).
 * Eliminates redundant Supabase Cloud REST calls for static and slow-moving master data.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class InMemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 60000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Retrieves a cached value if present and not expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Sets a value in the cache with an optional custom TTL in milliseconds.
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Deletes a specific key from the cache.
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Deletes all keys matching a prefix or pattern.
   */
  deletePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Wraps an async fetcher function with caching.
   */
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const fresh = await fetcher();
    this.set(key, fresh, ttlMs);
    return fresh;
  }
}

// Global master data cache instance (TTL 60 seconds)
export const masterDataCache = new InMemoryCache(60000);

