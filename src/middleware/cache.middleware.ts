/**
 * Cache Middleware
 * Express middleware for caching GET requests and invalidating on mutations
 */

import { Request, Response, NextFunction } from 'express';
import { cacheManager } from '../lib/cache/cache.manager';
import { CacheMode } from '../lib/cache/cache.types';
import { env } from '../config/env';

interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  skipCache?: (req: Request) => boolean;
}

/**
 * Generate cache key from request
 */
function generateCacheKey(req: Request): string {
  const url = req.originalUrl || req.url;
  const query = req.query ? JSON.stringify(req.query) : '';
  return `route:${req.method}:${url}:${query}`;
}

/**
 * Cache middleware factory
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  const {
    ttl,
    keyGenerator = generateCacheKey,
    skipCache = () => false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      // Invalidate cache on mutations
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        try {
          // Clear cache for related routes
          await cacheManager.clear(`route:${req.baseUrl || ''}*`);
        } catch (error) {
          console.error('Cache invalidation error:', error);
        }
      }
      return next();
    }

    // Check if cache is enabled
    if (!env.CACHE_ENABLED) {
      return next();
    }

    // Check if should skip cache
    if (skipCache(req)) {
      return next();
    }

    const cacheKey = keyGenerator(req);

    try {
      // Try to get from cache
      const cached = await cacheManager.get(cacheKey);
      
      if (cached.data !== null && cached.fromCache) {
        // Set cache headers
        res.setHeader('X-Cache', 'HIT');
        if (cached.ttl) {
          res.setHeader('X-Cache-TTL', cached.ttl.toString());
        }
        
        // Return cached response
        return res.json(cached.data);
      }

      // Cache miss - intercept response
      const originalJson = res.json.bind(res);
      res.json = function (body: any) {
        // Cache the response
        cacheManager.set(cacheKey, body, ttl).catch((error) => {
          console.error('Cache set error:', error);
        });

        // Set cache headers
        res.setHeader('X-Cache', 'MISS');
        
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Simple cache middleware with default options
 */
export const cache = cacheMiddleware();




