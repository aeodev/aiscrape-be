/**
 * Cache Strategies
 * Different eviction strategies for cache management
 */

import { CacheEntry } from './cache.types';

/**
 * LRU (Least Recently Used) Cache Strategy
 */
export class LRUCacheStrategy<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get entry and mark as recently used
   */
  get(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);
    }
    return entry;
  }

  /**
   * Set entry
   */
  set(key: string, entry: CacheEntry<T>): void {
    // Remove if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, entry);
  }

  /**
   * Delete entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * FIFO (First In First Out) Cache Strategy
 */
export class FIFOCacheStrategy<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private insertionOrder: string[];

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.insertionOrder = [];
  }

  /**
   * Get entry (doesn't affect order)
   */
  get(key: string): CacheEntry<T> | undefined {
    return this.cache.get(key);
  }

  /**
   * Set entry
   */
  set(key: string, entry: CacheEntry<T>): void {
    if (!this.cache.has(key)) {
      // New entry
      if (this.cache.size >= this.maxSize) {
        // Remove oldest (first in insertion order)
        const oldestKey = this.insertionOrder.shift();
        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }
      this.insertionOrder.push(key);
    }
    this.cache.set(key, entry);
  }

  /**
   * Delete entry
   */
  delete(key: string): boolean {
    const index = this.insertionOrder.indexOf(key);
    if (index > -1) {
      this.insertionOrder.splice(index, 1);
    }
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.insertionOrder = [];
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * TTL (Time To Live) Cache Strategy
 */
export class TTLCacheStrategy<T> {
  private cache: Map<string, CacheEntry<T>>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Get entry if not expired
   */
  get(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Set entry with optional TTL
   */
  set(key: string, entry: CacheEntry<T>, ttlSeconds?: number): void {
    if (ttlSeconds) {
      entry.expiresAt = Date.now() + (ttlSeconds * 1000);
    }
    this.cache.set(key, entry);
  }

  /**
   * Delete entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}




