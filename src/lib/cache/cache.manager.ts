/**
 * Cache Manager
 * Main cache manager with Redis backend and in-memory fallback
 */

import { redisConnection } from './redis.connection';
import { CacheMode, CacheConfig, CacheResult, CacheEntry } from './cache.types';
import { TTLCacheStrategy } from './cache.strategies';
import { env } from '../../config/env';

export class CacheManager {
  private config: CacheConfig;
  private memoryCache: TTLCacheStrategy<any>;
  private keyPrefix: string;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      mode: (env.CACHE_MODE as CacheMode) || CacheMode.ENABLED,
      ttl: env.CACHE_TTL || 3600,
      keyPrefix: config?.keyPrefix || 'cache:',
      ...config,
    };
    this.keyPrefix = this.config.keyPrefix || 'cache:';
    this.memoryCache = new TTLCacheStrategy();
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<CacheResult<T>> {
    const fullKey = this.getFullKey(key);

    // Check cache mode
    if (this.config.mode === CacheMode.DISABLED) {
      return { data: null, fromCache: false };
    }

    // Try Redis first
    const redisClient = redisConnection.getClient();
    if (redisClient && this.config.mode !== CacheMode.BYPASS) {
      try {
        const cached = await redisClient.get(fullKey);
        if (cached) {
          const parsed = JSON.parse(cached) as CacheEntry<T>;
          
          // Check expiration
          if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
            await this.delete(key);
            return { data: null, fromCache: false };
          }

          const ttl = parsed.expiresAt 
            ? Math.floor((parsed.expiresAt - Date.now()) / 1000)
            : undefined;

          return {
            data: parsed.value,
            fromCache: true,
            ttl: ttl && ttl > 0 ? ttl : undefined,
          };
        }
      } catch (error: any) {
        console.error(`Redis get error for key ${fullKey}:`, error.message);
        // Fall through to memory cache
      }
    }

    // Fallback to memory cache
    const memoryEntry = this.memoryCache.get(fullKey);
    if (memoryEntry) {
      const ttl = memoryEntry.expiresAt
        ? Math.floor((memoryEntry.expiresAt - Date.now()) / 1000)
        : undefined;

      return {
        data: memoryEntry.value,
        fromCache: true,
        ttl: ttl && ttl > 0 ? ttl : undefined,
      };
    }

    return { data: null, fromCache: false };
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.getFullKey(key);
    const ttlSeconds = ttl || this.config.ttl || 3600;

    // Check cache mode
    if (this.config.mode === CacheMode.DISABLED || this.config.mode === CacheMode.READ_ONLY) {
      return;
    }

    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttlSeconds * 1000),
    };

    // Try Redis first
    const redisClient = redisConnection.getClient();
    if (redisClient && this.config.mode !== CacheMode.BYPASS) {
      try {
        const serialized = JSON.stringify(entry);
        await redisClient.setex(fullKey, ttlSeconds, serialized);
        return;
      } catch (error: any) {
        console.error(`Redis set error for key ${fullKey}:`, error.message);
        // Fall through to memory cache
      }
    }

    // Fallback to memory cache
    this.memoryCache.set(fullKey, entry, ttlSeconds);
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);

    // Try Redis first
    const redisClient = redisConnection.getClient();
    if (redisClient) {
      try {
        await redisClient.del(fullKey);
      } catch (error: any) {
        console.error(`Redis delete error for key ${fullKey}:`, error.message);
      }
    }

    // Also delete from memory cache
    this.memoryCache.delete(fullKey);
  }

  /**
   * Clear cache by pattern or all
   */
  async clear(pattern?: string): Promise<void> {
    const redisClient = redisConnection.getClient();
    
    if (redisClient) {
      try {
        if (pattern) {
          const fullPattern = this.getFullKey(pattern);
          const keys = await redisClient.keys(fullPattern);
          if (keys.length > 0) {
            await redisClient.del(...keys);
          }
        } else {
          // Clear all keys with prefix
          const keys = await redisClient.keys(`${this.keyPrefix}*`);
          if (keys.length > 0) {
            await redisClient.del(...keys);
          }
        }
      } catch (error: any) {
        console.error(`Redis clear error:`, error.message);
      }
    }

    // Clear memory cache
    if (pattern) {
      // Memory cache doesn't support pattern matching easily
      // Clear all for simplicity
      this.memoryCache.clear();
    } else {
      this.memoryCache.clear();
    }
  }

  /**
   * Get full cache key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.keyPrefix) {
      this.keyPrefix = config.keyPrefix;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    redisAvailable: boolean;
    memoryCacheSize: number;
    mode: CacheMode;
  }> {
    return {
      redisAvailable: redisConnection.isAvailable(),
      memoryCacheSize: this.memoryCache.size(),
      mode: this.config.mode,
    };
  }

  /**
   * Clean expired entries from memory cache
   */
  cleanExpired(): number {
    return this.memoryCache.cleanExpired();
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();



