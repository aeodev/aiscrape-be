/**
 * Rate Limit Types
 * Type definitions for the rate limiting system
 */

/**
 * Rate limit strategy enumeration
 */
export enum RateLimitStrategy {
  SLIDING_WINDOW = 'sliding_window',
  FIXED_WINDOW = 'fixed_window',
  TOKEN_BUCKET = 'token_bucket',
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number;                    // Time window in milliseconds
  maxRequests: number;                 // Maximum requests per window
  strategy?: RateLimitStrategy;         // Rate limiting strategy
  keyGenerator?: (req: any) => string;  // Custom key generator function
  skipSuccessfulRequests?: boolean;     // Don't count successful requests
  skipFailedRequests?: boolean;        // Don't count failed requests
  message?: string;                    // Custom error message
  standardHeaders?: boolean;           // Include standard rate limit headers
  legacyHeaders?: boolean;              // Include legacy X-RateLimit-* headers
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;                    // Whether request is allowed
  remaining: number;                   // Remaining requests in window
  resetTime: number;                   // Timestamp when limit resets
  totalRequests: number;               // Total requests in current window
}

/**
 * Rate limit statistics
 */
export interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  activeKeys: number;
  redisAvailable: boolean;
}




