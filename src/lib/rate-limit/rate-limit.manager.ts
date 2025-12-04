/**
 * Rate Limit Manager
 * Redis-based rate limiting with in-memory fallback
 */

import { redisConnection } from '../cache/redis.connection';
import { RateLimitConfig, RateLimitResult, RateLimitStats, RateLimitStrategy } from './rate-limit.types';

interface MemoryLimitEntry {
  timestamps: number[];
  resetTime: number;
}

export class RateLimitManager {
  private memoryLimits: Map<string, MemoryLimitEntry> = new Map();
  private stats = {
    totalRequests: 0,
    blockedRequests: 0,
  };
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000);
  }

  /**
   * Check if request is within rate limit
   */
  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    this.stats.totalRequests++;

    const strategy = config.strategy || RateLimitStrategy.SLIDING_WINDOW;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Try Redis first
    const redisClient = redisConnection.getClient();
    if (redisClient) {
      try {
        return await this.checkLimitRedis(key, config, now, windowStart, redisClient);
      } catch (error: any) {
        console.error(`Redis rate limit check error:`, error.message);
        // Fall through to memory fallback
      }
    }

    // Fallback to memory
    return this.checkLimitMemory(key, config, now, windowStart);
  }

  /**
   * Check limit using Redis (sliding window)
   */
  private async checkLimitRedis(
    key: string,
    config: RateLimitConfig,
    now: number,
    windowStart: number,
    redisClient: any
  ): Promise<RateLimitResult> {
    const redisKey = `rate_limit:${key}`;
    const resetTime = now + config.windowMs;

    // Use sorted set to store request timestamps
    const pipeline = redisClient.pipeline();
    
    // Remove old entries outside window
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    
    // Count current requests in window
    pipeline.zcard(redisKey);
    
    // Add current request timestamp
    pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
    
    // Set expiration
    pipeline.expire(redisKey, Math.ceil(config.windowMs / 1000));
    
    const results = await pipeline.exec();
    const currentCount = results[1][1] as number;
    const newCount = currentCount + 1;

    const allowed = newCount <= config.maxRequests;
    
    if (!allowed) {
      this.stats.blockedRequests++;
    }

    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - newCount),
      resetTime,
      totalRequests: newCount,
    };
  }

  /**
   * Check limit using in-memory storage
   */
  private checkLimitMemory(
    key: string,
    config: RateLimitConfig,
    now: number,
    windowStart: number
  ): RateLimitResult {
    const entry = this.memoryLimits.get(key);
    const resetTime = now + config.windowMs;

    if (!entry) {
      // First request
      const newEntry: MemoryLimitEntry = {
        timestamps: [now],
        resetTime,
      };
      this.memoryLimits.set(key, newEntry);
      
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime,
        totalRequests: 1,
      };
    }

    // Remove old timestamps outside window
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);
    
    // Add current timestamp
    entry.timestamps.push(now);
    entry.resetTime = resetTime;

    const totalRequests = entry.timestamps.length;
    const allowed = totalRequests <= config.maxRequests;

    if (!allowed) {
      this.stats.blockedRequests++;
      // Remove the last added timestamp since it's not allowed
      entry.timestamps.pop();
    }

    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - totalRequests),
      resetTime,
      totalRequests: allowed ? totalRequests : totalRequests - 1,
    };
  }

  /**
   * Reset rate limit for a key
   */
  async resetLimit(key: string): Promise<void> {
    // Reset in Redis
    const redisClient = redisConnection.getClient();
    if (redisClient) {
      try {
        await redisClient.del(`rate_limit:${key}`);
      } catch (error: any) {
        console.error(`Redis rate limit reset error:`, error.message);
      }
    }

    // Reset in memory
    this.memoryLimits.delete(key);
  }

  /**
   * Get remaining requests for a key
   */
  async getRemaining(key: string, config: RateLimitConfig): Promise<number> {
    const result = await this.checkLimit(key, config);
    return result.remaining;
  }

  /**
   * Get rate limit statistics
   */
  getStats(): RateLimitStats {
    return {
      totalRequests: this.stats.totalRequests,
      blockedRequests: this.stats.blockedRequests,
      activeKeys: this.memoryLimits.size,
      redisAvailable: redisConnection.isAvailable(),
    };
  }

  /**
   * Cleanup expired entries from memory
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryLimits.entries()) {
      if (entry.resetTime < now) {
        this.memoryLimits.delete(key);
      }
    }
  }

  /**
   * Clear all rate limits
   */
  async clear(): Promise<void> {
    // Clear Redis
    const redisClient = redisConnection.getClient();
    if (redisClient) {
      try {
        const keys = await redisClient.keys('rate_limit:*');
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch (error: any) {
        console.error(`Redis rate limit clear error:`, error.message);
      }
    }

    // Clear memory
    this.memoryLimits.clear();
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Export singleton instance
export const rateLimitManager = new RateLimitManager();




