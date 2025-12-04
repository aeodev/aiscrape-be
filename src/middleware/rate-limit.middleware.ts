/**
 * Rate Limit Middleware
 * Express middleware for rate limiting requests
 */

import { Request, Response, NextFunction } from 'express';
import { rateLimitManager } from '../lib/rate-limit/rate-limit.manager';
import { RateLimitConfig, RateLimitResult } from '../lib/rate-limit/rate-limit.types';

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded 
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim())
    : req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

/**
 * Create rate limit middleware
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
  const keyGenerator = config.keyGenerator || defaultKeyGenerator;
  const standardHeaders = config.standardHeaders !== false;
  const legacyHeaders = config.legacyHeaders !== false;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = keyGenerator(req);
      const result: RateLimitResult = await rateLimitManager.checkLimit(key, config);

      // Set rate limit headers
      if (standardHeaders || legacyHeaders) {
        const resetTimeSeconds = Math.ceil(result.resetTime / 1000);
        
        if (standardHeaders) {
          res.setHeader('RateLimit-Limit', config.maxRequests.toString());
          res.setHeader('RateLimit-Remaining', result.remaining.toString());
          res.setHeader('RateLimit-Reset', resetTimeSeconds.toString());
        }

        if (legacyHeaders) {
          res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
          res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
          res.setHeader('X-RateLimit-Reset', resetTimeSeconds.toString());
        }
      }

      if (!result.allowed) {
        // Calculate retry after seconds
        const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());

        const message = config.message || 'Too many requests, please try again later.';
        
        res.status(429).json({
          success: false,
          error: message,
          retryAfter,
          resetTime: result.resetTime,
        });
        return;
      }

      next();
    } catch (error: any) {
      console.error('Rate limit middleware error:', error);
      // On error, allow request to proceed (fail open)
      next();
    }
  };
}

/**
 * Per-IP rate limit middleware (convenience function)
 */
export function perIpRateLimit(windowMs: number, maxRequests: number, message?: string) {
  return rateLimitMiddleware({
    windowMs,
    maxRequests,
    message,
    standardHeaders: true,
    legacyHeaders: true,
  });
}

/**
 * Per-user rate limit middleware (requires user ID in request)
 */
export function perUserRateLimit(windowMs: number, maxRequests: number, message?: string) {
  return rateLimitMiddleware({
    windowMs,
    maxRequests,
    message,
    keyGenerator: (req: any) => {
      const userId = req.user?.id || req.user?._id || 'anonymous';
      return `user:${userId}`;
    },
    standardHeaders: true,
    legacyHeaders: true,
  });
}



