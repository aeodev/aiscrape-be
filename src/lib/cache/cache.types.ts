/**
 * Cache Types
 * Type definitions for the cache system
 */

/**
 * Cache mode enumeration
 */
export enum CacheMode {
  DISABLED = 'disabled',      // No caching
  ENABLED = 'enabled',        // Use cache if available
  BYPASS = 'bypass',          // Bypass cache, save result
  READ_ONLY = 'read_only',    // Only read from cache
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  mode: CacheMode;
  ttl?: number;               // Time to live in seconds
  keyPrefix?: string;         // Prefix for cache keys
}

/**
 * Cache result wrapper
 */
export interface CacheResult<T> {
  data: T | null;
  fromCache: boolean;
  ttl?: number;
}

/**
 * Cache entry metadata
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt?: number;          // Timestamp when entry expires
  createdAt: number;          // Timestamp when entry was created
}



