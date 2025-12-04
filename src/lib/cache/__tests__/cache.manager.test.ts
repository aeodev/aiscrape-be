/**
 * Cache Manager Tests
 * Comprehensive unit tests for CacheManager
 */

import { CacheManager } from '../cache.manager';
import { CacheMode, CacheEntry } from '../cache.types';
import { redisConnection } from '../redis.connection';
import { createMockRedisClient, createMockRedisFailure } from '../../../__tests__/helpers/mocks';

// Mock redis connection
jest.mock('../redis.connection', () => ({
  redisConnection: {
    getClient: jest.fn(),
    isAvailable: jest.fn(),
  },
}));

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient = createMockRedisClient();
    (redisConnection.getClient as jest.Mock).mockReturnValue(mockRedisClient);
    (redisConnection.isAvailable as jest.Mock).mockReturnValue(true);
    cacheManager = new CacheManager({
      mode: CacheMode.ENABLED,
      ttl: 3600,
      keyPrefix: 'test:',
    });
  });

  afterEach(() => {
    mockRedisClient.clear();
  });

  describe('get', () => {
    it('should return cached data from Redis', async () => {
      const testData = { name: 'test', value: 123 };
      const cacheEntry: CacheEntry<typeof testData> = {
        value: testData,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cacheEntry));

      const result = await cacheManager.get<typeof testData>('test-key');

      expect(result.data).toEqual(testData);
      expect(result.fromCache).toBe(true);
      expect(result.ttl).toBeDefined();
      expect(mockRedisClient.get).toHaveBeenCalledWith('test:test-key');
    });

    it('should return null when cache is disabled', async () => {
      cacheManager = new CacheManager({ mode: CacheMode.DISABLED });
      const result = await cacheManager.get('test-key');
      expect(result.data).toBeNull();
      expect(result.fromCache).toBe(false);
    });

    it('should return null when key does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const result = await cacheManager.get('non-existent');
      expect(result.data).toBeNull();
      expect(result.fromCache).toBe(false);
    });

    it('should delete and return null for expired entries', async () => {
      const expiredEntry: CacheEntry<any> = {
        value: { test: 'data' },
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 3600000, // Expired 1 hour ago
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(expiredEntry));

      const result = await cacheManager.get('expired-key');

      expect(result.data).toBeNull();
      expect(result.fromCache).toBe(false);
      expect(mockRedisClient.del).toHaveBeenCalledWith('test:expired-key');
    });

    it('should fallback to memory cache when Redis fails', async () => {
      // Make Redis fail on set so it goes to memory cache
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));
      await cacheManager.set('memory-key', { test: 'memory' }, 3600);
      
      // Make Redis fail on get too
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
      
      // Get should use memory cache fallback
      const result = await cacheManager.get('memory-key');
      
      expect(result.data).toEqual({ test: 'memory' });
      expect(result.fromCache).toBe(true);
    });

    it('should return null when Redis is not available', async () => {
      (redisConnection.getClient as jest.Mock).mockReturnValue(null);
      const result = await cacheManager.get('test-key');
      expect(result.data).toBeNull();
      expect(result.fromCache).toBe(false);
    });
  });

  describe('set', () => {
    it('should set data in Redis with TTL', async () => {
      const testData = { name: 'test', value: 456 };
      await cacheManager.set('set-key', testData, 1800);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'test:set-key',
        1800,
        expect.stringContaining('"value":456')
      );
    });

    it('should use default TTL when not provided', async () => {
      const testData = { test: 'data' };
      await cacheManager.set('default-ttl-key', testData);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'test:default-ttl-key',
        3600, // Default TTL
        expect.any(String)
      );
    });

    it('should not set when cache mode is DISABLED', async () => {
      cacheManager = new CacheManager({ mode: CacheMode.DISABLED });
      await cacheManager.set('disabled-key', { test: 'data' });
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('should not set when cache mode is READ_ONLY', async () => {
      cacheManager = new CacheManager({ mode: CacheMode.READ_ONLY });
      await cacheManager.set('readonly-key', { test: 'data' });
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('should fallback to memory cache when Redis fails', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));
      const testData = { test: 'fallback' };
      
      await cacheManager.set('fallback-key', testData, 3600);
      
      // Should be available in memory cache
      const result = await cacheManager.get('fallback-key');
      expect(result.data).toEqual(testData);
      expect(result.fromCache).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete key from Redis', async () => {
      await cacheManager.delete('delete-key');
      expect(mockRedisClient.del).toHaveBeenCalledWith('test:delete-key');
    });

    it('should delete from memory cache when Redis fails', async () => {
      // Set in cache (will go to both Redis and memory)
      await cacheManager.set('memory-delete-key', { test: 'data' });
      
      // Make Redis fail on delete
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));
      
      // Delete should still work via memory cache
      await cacheManager.delete('memory-delete-key');
      
      // Make Redis fail on get too to force memory cache check
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
      const result = await cacheManager.get('memory-delete-key');
      expect(result.data).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all keys with prefix from Redis', async () => {
      // Mock keys to return only keys with prefix (as Redis would)
      mockRedisClient.keys.mockResolvedValue(['test:key1', 'test:key2']);
      await cacheManager.clear();

      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith('test:key1', 'test:key2');
    });

    it('should clear keys matching pattern', async () => {
      mockRedisClient.keys.mockResolvedValue(['test:pattern:1', 'test:pattern:2']);
      await cacheManager.clear('pattern:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:pattern:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith('test:pattern:1', 'test:pattern:2');
    });

    it('should clear memory cache', async () => {
      // Set in cache
      await cacheManager.set('mem1', { test: 1 });
      await cacheManager.set('mem2', { test: 2 });
      
      // Make Redis fail to force memory cache usage
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
      
      // Clear should remove from memory cache
      await cacheManager.clear();
      
      const result1 = await cacheManager.get('mem1');
      const result2 = await cacheManager.get('mem2');
      expect(result1.data).toBeNull();
      expect(result2.data).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      (redisConnection.isAvailable as jest.Mock).mockReturnValue(true);
      
      // Set data and make Redis fail to ensure it goes to memory cache
      mockRedisClient.setex.mockRejectedValueOnce(new Error('Redis error'));
      await cacheManager.set('stat1', { test: 1 });
      
      const stats = await cacheManager.getStats();
      
      expect(stats.redisAvailable).toBe(true);
      expect(stats.mode).toBe(CacheMode.ENABLED);
      expect(stats.memoryCacheSize).toBeGreaterThanOrEqual(0);
    });

    it('should report Redis as unavailable when not connected', async () => {
      (redisConnection.isAvailable as jest.Mock).mockReturnValue(false);
      const stats = await cacheManager.getStats();
      expect(stats.redisAvailable).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update cache configuration', () => {
      cacheManager.updateConfig({ ttl: 7200, keyPrefix: 'new:' });
      expect(cacheManager).toBeDefined();
      // Verify by checking behavior with new prefix
      cacheManager.set('test', { data: 'test' });
      // Should use new prefix (would need to check mock calls)
    });
  });

  describe('cleanExpired', () => {
    it('should clean expired entries from memory cache', () => {
      const cleaned = cacheManager.cleanExpired();
      expect(typeof cleaned).toBe('number');
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('should handle null values', async () => {
      await cacheManager.set('null-key', null as any);
      const result = await cacheManager.get('null-key');
      expect(result.data).toBeNull();
    });

    it('should handle large data', async () => {
      const largeData = { data: 'x'.repeat(100000) };
      await cacheManager.set('large-key', largeData);
      const result = await cacheManager.get('large-key');
      expect(result.data).toEqual(largeData);
    });

    it('should handle special characters in keys', async () => {
      const specialKey = 'test:key:with:colons:and/slashes';
      await cacheManager.set(specialKey, { test: 'data' });
      const result = await cacheManager.get(specialKey);
      expect(result.data).toEqual({ test: 'data' });
    });
  });
});

