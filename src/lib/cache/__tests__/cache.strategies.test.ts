/**
 * Cache Strategies Tests
 * Unit tests for LRU, FIFO, and TTL cache strategies
 */

import { LRUCacheStrategy, FIFOCacheStrategy, TTLCacheStrategy } from '../cache.strategies';
import { CacheEntry } from '../cache.types';

describe('LRUCacheStrategy', () => {
  let lruCache: LRUCacheStrategy<number>;

  beforeEach(() => {
    lruCache = new LRUCacheStrategy<number>(3);
  });

  describe('get', () => {
    it('should return entry if exists', () => {
      const entry: CacheEntry<number> = { value: 42, createdAt: Date.now() };
      lruCache.set('key1', entry);
      const result = lruCache.get('key1');
      expect(result).toEqual(entry);
    });

    it('should return undefined if key does not exist', () => {
      const result = lruCache.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should move accessed entry to end (most recently used)', () => {
      lruCache.set('key1', { value: 1, createdAt: Date.now() });
      lruCache.set('key2', { value: 2, createdAt: Date.now() });
      lruCache.set('key3', { value: 3, createdAt: Date.now() });
      
      // Access key1, making it most recently used
      lruCache.get('key1');
      
      // Add new entry - should evict key2 (least recently used)
      lruCache.set('key4', { value: 4, createdAt: Date.now() });
      
      expect(lruCache.get('key1')).toBeDefined();
      expect(lruCache.get('key2')).toBeUndefined(); // Evicted
      expect(lruCache.get('key3')).toBeDefined();
      expect(lruCache.get('key4')).toBeDefined();
    });
  });

  describe('set', () => {
    it('should add new entry', () => {
      const entry: CacheEntry<number> = { value: 100, createdAt: Date.now() };
      lruCache.set('new-key', entry);
      expect(lruCache.get('new-key')).toEqual(entry);
    });

    it('should update existing entry', () => {
      lruCache.set('key1', { value: 1, createdAt: Date.now() });
      lruCache.set('key1', { value: 2, createdAt: Date.now() });
      expect(lruCache.get('key1')?.value).toBe(2);
    });

    it('should evict least recently used when at capacity', () => {
      lruCache.set('key1', { value: 1, createdAt: Date.now() });
      lruCache.set('key2', { value: 2, createdAt: Date.now() });
      lruCache.set('key3', { value: 3, createdAt: Date.now() });
      
      // Add fourth entry - should evict key1 (least recently used)
      lruCache.set('key4', { value: 4, createdAt: Date.now() });
      
      expect(lruCache.get('key1')).toBeUndefined();
      expect(lruCache.get('key2')).toBeDefined();
      expect(lruCache.get('key3')).toBeDefined();
      expect(lruCache.get('key4')).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete entry', () => {
      lruCache.set('key1', { value: 1, createdAt: Date.now() });
      lruCache.delete('key1');
      expect(lruCache.get('key1')).toBeUndefined();
    });

    it('should return false if key does not exist', () => {
      const result = lruCache.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      lruCache.set('key1', { value: 1, createdAt: Date.now() });
      lruCache.set('key2', { value: 2, createdAt: Date.now() });
      lruCache.clear();
      expect(lruCache.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct cache size', () => {
      expect(lruCache.size()).toBe(0);
      lruCache.set('key1', { value: 1, createdAt: Date.now() });
      expect(lruCache.size()).toBe(1);
      lruCache.set('key2', { value: 2, createdAt: Date.now() });
      expect(lruCache.size()).toBe(2);
    });
  });
});

describe('FIFOCacheStrategy', () => {
  let fifoCache: FIFOCacheStrategy<string>;

  beforeEach(() => {
    fifoCache = new FIFOCacheStrategy<string>(3);
  });

  describe('get', () => {
    it('should return entry if exists', () => {
      const entry: CacheEntry<string> = { value: 'test', createdAt: Date.now() };
      fifoCache.set('key1', entry);
      expect(fifoCache.get('key1')).toEqual(entry);
    });

    it('should not affect insertion order on get', () => {
      fifoCache.set('key1', { value: '1', createdAt: Date.now() });
      fifoCache.set('key2', { value: '2', createdAt: Date.now() });
      fifoCache.set('key3', { value: '3', createdAt: Date.now() });
      
      // Access key1 multiple times
      fifoCache.get('key1');
      fifoCache.get('key1');
      
      // Add new entry - should still evict key1 (first in)
      fifoCache.set('key4', { value: '4', createdAt: Date.now() });
      
      expect(fifoCache.get('key1')).toBeUndefined(); // Evicted (first in)
      expect(fifoCache.get('key2')).toBeDefined();
      expect(fifoCache.get('key3')).toBeDefined();
      expect(fifoCache.get('key4')).toBeDefined();
    });
  });

  describe('set', () => {
    it('should evict first in when at capacity', () => {
      fifoCache.set('key1', { value: '1', createdAt: Date.now() });
      fifoCache.set('key2', { value: '2', createdAt: Date.now() });
      fifoCache.set('key3', { value: '3', createdAt: Date.now() });
      
      // Add fourth entry - should evict key1 (first in)
      fifoCache.set('key4', { value: '4', createdAt: Date.now() });
      
      expect(fifoCache.get('key1')).toBeUndefined();
      expect(fifoCache.get('key2')).toBeDefined();
      expect(fifoCache.get('key3')).toBeDefined();
      expect(fifoCache.get('key4')).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should remove from insertion order', () => {
      fifoCache.set('key1', { value: '1', createdAt: Date.now() });
      fifoCache.set('key2', { value: '2', createdAt: Date.now() });
      fifoCache.delete('key1');
      
      // Add new entry - should not evict key2
      fifoCache.set('key3', { value: '3', createdAt: Date.now() });
      fifoCache.set('key4', { value: '4', createdAt: Date.now() });
      
      expect(fifoCache.get('key2')).toBeDefined();
      expect(fifoCache.get('key3')).toBeDefined();
      expect(fifoCache.get('key4')).toBeDefined();
    });
  });
});

describe('TTLCacheStrategy', () => {
  let ttlCache: TTLCacheStrategy<object>;

  beforeEach(() => {
    ttlCache = new TTLCacheStrategy<object>();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('get', () => {
    it('should return entry if not expired', () => {
      const entry: CacheEntry<object> = {
        value: { test: 'data' },
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000,
      };
      ttlCache.set('key1', entry);
      expect(ttlCache.get('key1')).toEqual(entry);
    });

    it('should return undefined if entry is expired', () => {
      const entry: CacheEntry<object> = {
        value: { test: 'data' },
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000,
      };
      ttlCache.set('key1', entry);
      
      // Advance time past expiration
      jest.advanceTimersByTime(2000);
      
      expect(ttlCache.get('key1')).toBeUndefined();
    });

    it('should auto-delete expired entry on get', () => {
      const entry: CacheEntry<object> = {
        value: { test: 'data' },
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000,
      };
      ttlCache.set('key1', entry);
      jest.advanceTimersByTime(2000);
      
      ttlCache.get('key1');
      expect(ttlCache.size()).toBe(0);
    });
  });

  describe('set', () => {
    it('should set entry with TTL', () => {
      const entry: CacheEntry<object> = { value: { test: 'data' }, createdAt: Date.now() };
      ttlCache.set('key1', entry, 5); // 5 seconds TTL
      
      const retrieved = ttlCache.get('key1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.expiresAt).toBeDefined();
      expect(retrieved?.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should set entry without TTL if not provided', () => {
      const entry: CacheEntry<object> = { value: { test: 'data' }, createdAt: Date.now() };
      ttlCache.set('key1', entry);
      
      const retrieved = ttlCache.get('key1');
      expect(retrieved).toBeDefined();
      // Without TTL, expiresAt might not be set
    });
  });

  describe('cleanExpired', () => {
    it('should remove expired entries', () => {
      ttlCache.set('key1', { value: { test: 1 }, createdAt: Date.now() }, 1);
      ttlCache.set('key2', { value: { test: 2 }, createdAt: Date.now() }, 10);
      
      jest.advanceTimersByTime(2000);
      
      const cleaned = ttlCache.cleanExpired();
      expect(cleaned).toBe(1);
      expect(ttlCache.get('key1')).toBeUndefined();
      expect(ttlCache.get('key2')).toBeDefined();
    });

    it('should return 0 if no expired entries', () => {
      ttlCache.set('key1', { value: { test: 1 }, createdAt: Date.now() }, 10);
      const cleaned = ttlCache.cleanExpired();
      expect(cleaned).toBe(0);
    });
  });
});


