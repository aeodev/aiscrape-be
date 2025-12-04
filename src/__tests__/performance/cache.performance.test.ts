/**
 * Cache Performance Tests
 * Performance benchmarks for cache operations
 */

import { cacheManager } from '../../lib/cache';
import { CacheMode } from '../../lib/cache/cache.types';

describe('Cache Performance Tests', () => {
  const testDataSizes = {
    small: { size: 1 * 1024, description: '1KB' },
    medium: { size: 100 * 1024, description: '100KB' },
    large: { size: 1024 * 1024, description: '1MB' },
  };

  beforeEach(async () => {
    await cacheManager.clear();
  });

  describe('Get Operation Performance', () => {
    Object.entries(testDataSizes).forEach(([sizeKey, { size, description }]) => {
      it(`should get small data (${description}) efficiently`, async () => {
        const key = `perf-test-${sizeKey}`;
        const data = 'x'.repeat(size);
        
        // Set data first
        await cacheManager.set(key, data, 3600);
        
        const iterations = 100;
        const startTime = Date.now();
        
        for (let i = 0; i < iterations; i++) {
          await cacheManager.get(key);
        }
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const avgTime = totalTime / iterations;
        
        console.log(`Get ${description}: ${avgTime.toFixed(2)}ms per operation (${iterations} iterations)`);
        
        expect(avgTime).toBeLessThan(100); // Should be fast
      });
    });
  });

  describe('Set Operation Performance', () => {
    Object.entries(testDataSizes).forEach(([sizeKey, { size, description }]) => {
      it(`should set small data (${description}) efficiently`, async () => {
        const key = `perf-test-set-${sizeKey}`;
        const data = 'x'.repeat(size);
        
        const iterations = 100;
        const startTime = Date.now();
        
        for (let i = 0; i < iterations; i++) {
          await cacheManager.set(`${key}-${i}`, data, 3600);
        }
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const avgTime = totalTime / iterations;
        
        console.log(`Set ${description}: ${avgTime.toFixed(2)}ms per operation (${iterations} iterations)`);
        
        expect(avgTime).toBeLessThan(200); // Set operations may be slower
      });
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent get operations', async () => {
      const key = 'concurrent-test';
      const data = 'test data';
      await cacheManager.set(key, data, 3600);
      
      const concurrentRequests = 50;
      const startTime = Date.now();
      
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() => cacheManager.get(key));
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / concurrentRequests;
      
      console.log(`Concurrent gets: ${avgTime.toFixed(2)}ms per operation (${concurrentRequests} concurrent)`);
      
      expect(totalTime).toBeLessThan(5000); // Should complete quickly
    });

    it('should handle concurrent set operations', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();
      
      const promises = Array(concurrentRequests)
        .fill(null)
        .map((_, i) => cacheManager.set(`concurrent-set-${i}`, `data-${i}`, 3600));
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / concurrentRequests;
      
      console.log(`Concurrent sets: ${avgTime.toFixed(2)}ms per operation (${concurrentRequests} concurrent)`);
      
      expect(totalTime).toBeLessThan(10000); // Should complete reasonably quickly
    });
  });

  describe('Large Data Handling', () => {
    it('should handle large data efficiently', async () => {
      const key = 'large-data-test';
      const largeData = {
        items: Array(10000).fill(null).map((_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'x'.repeat(100),
          metadata: { createdAt: new Date().toISOString() },
        })),
      };
      
      const startTime = Date.now();
      await cacheManager.set(key, largeData, 3600);
      const setTime = Date.now() - startTime;
      
      const getStartTime = Date.now();
      const result = await cacheManager.get(key);
      const getTime = Date.now() - getStartTime;
      
      console.log(`Large data set: ${setTime}ms, get: ${getTime}ms`);
      
      expect(result.fromCache).toBe(true);
      expect(result.data).toBeDefined();
      expect(setTime).toBeLessThan(5000);
      expect(getTime).toBeLessThan(2000);
    });
  });

  describe('Memory Usage', () => {
    it('should not cause excessive memory growth', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Set many items
      const itemsCount = 1000;
      for (let i = 0; i < itemsCount; i++) {
        await cacheManager.set(`memory-test-${i}`, `data-${i}`, 3600);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryPerItem = memoryIncrease / itemsCount;
      
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB for ${itemsCount} items`);
      console.log(`Memory per item: ${(memoryPerItem / 1024).toFixed(2)}KB`);
      
      // Memory increase should be reasonable (less than 50MB for 1000 items)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Throughput', () => {
    it('should achieve good throughput for mixed operations', async () => {
      const operations = 500;
      const startTime = Date.now();
      
      for (let i = 0; i < operations; i++) {
        if (i % 2 === 0) {
          await cacheManager.set(`throughput-${i}`, `data-${i}`, 3600);
        } else {
          await cacheManager.get(`throughput-${i - 1}`);
        }
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const throughput = (operations / totalTime) * 1000; // ops per second
      
      console.log(`Throughput: ${throughput.toFixed(2)} operations/second`);
      
      expect(throughput).toBeGreaterThan(10); // At least 10 ops/sec
    });
  });
});


