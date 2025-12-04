/**
 * Processing Pipeline Performance Tests
 * Performance benchmarks for processing pipeline operations
 */

import { ProcessingPipeline } from '../../lib/processing/pipeline.processor';

describe('Processing Pipeline Performance Tests', () => {
  const testHtmlSizes = {
    small: { size: 10 * 1024, description: '10KB HTML' },
    medium: { size: 100 * 1024, description: '100KB HTML' },
    large: { size: 1024 * 1024, description: '1MB HTML' },
  };

  function generateTestHtml(size: number): string {
    const baseHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Page</title>
        <style>body { color: red; }</style>
        <script>console.log('test');</script>
      </head>
      <body>
        <h1>Test Heading</h1>
        <p>Test paragraph content.</p>
        <div>
          ${'<p>Repeated content</p>'.repeat(Math.floor(size / 50))}
        </div>
      </body>
      </html>
    `;
    return baseHtml;
  }

  describe('HTML Processing Performance', () => {
    Object.entries(testHtmlSizes).forEach(([sizeKey, { size, description }]) => {
      it(`should process ${description} efficiently`, async () => {
        const html = generateTestHtml(size);
        const pipeline = new ProcessingPipeline({
          enableHtmlProcessing: true,
          enableMarkdownConversion: true,
          enableTextExtraction: true,
        });
        
        const iterations = 10;
        const times: number[] = [];
        
        for (let i = 0; i < iterations; i++) {
          const startTime = Date.now();
          await pipeline.process(html);
          const endTime = Date.now();
          times.push(endTime - startTime);
        }
        
        const avgTime = times.reduce((a, b) => a + b, 0) / iterations;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        
        console.log(`${description} - Avg: ${avgTime.toFixed(2)}ms, Min: ${minTime}ms, Max: ${maxTime}ms`);
        
        // Performance expectations based on size
        if (sizeKey === 'small') {
          expect(avgTime).toBeLessThan(500);
        } else if (sizeKey === 'medium') {
          expect(avgTime).toBeLessThan(2000);
        } else {
          expect(avgTime).toBeLessThan(10000);
        }
      });
    });
  });

  describe('Pipeline Stage Performance', () => {
    it('should measure individual stage performance', async () => {
      const html = generateTestHtml(50 * 1024); // 50KB
      const pipeline = new ProcessingPipeline({
        enableHtmlProcessing: true,
        enableMarkdownConversion: true,
        enableTextExtraction: true,
      });
      
      const result = await pipeline.process(html);
      
      console.log('Stage timings:', result.metadata.stageTimings);
      console.log('Total execution time:', result.metadata.executionTime, 'ms');
      
      expect(result.metadata.stageTimings).toBeDefined();
      expect(result.metadata.executionTime).toBeGreaterThan(0);
      
      // Each stage should complete in reasonable time
      Object.values(result.metadata.stageTimings).forEach((time: number) => {
        expect(time).toBeLessThan(5000);
      });
    });
  });

  describe('Concurrent Processing', () => {
    it('should handle concurrent processing requests', async () => {
      const html = generateTestHtml(10 * 1024);
      const pipeline = new ProcessingPipeline();
      
      const concurrentRequests = 20;
      const startTime = Date.now();
      
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() => pipeline.process(html));
      
      const results = await Promise.all(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / concurrentRequests;
      
      console.log(`Concurrent processing: ${avgTime.toFixed(2)}ms per request (${concurrentRequests} concurrent)`);
      
      expect(results.length).toBe(concurrentRequests);
      results.forEach(result => {
        expect(result.html).toBeDefined();
        expect(result.markdown).toBeDefined();
        expect(result.text).toBeDefined();
      });
      
      expect(totalTime).toBeLessThan(30000); // Should complete in reasonable time
    });
  });

  describe('Memory Usage During Processing', () => {
    it('should not cause excessive memory growth', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const pipeline = new ProcessingPipeline();
      
      // Process multiple large HTML files
      const iterations = 50;
      const html = generateTestHtml(100 * 1024);
      
      for (let i = 0; i < iterations; i++) {
        await pipeline.process(html);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB for ${iterations} iterations`);
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024); // Less than 200MB
    });
  });

  describe('Large HTML File Handling', () => {
    it('should handle very large HTML files', async () => {
      const largeHtml = generateTestHtml(5 * 1024 * 1024); // 5MB
      const pipeline = new ProcessingPipeline();
      
      const startTime = Date.now();
      const result = await pipeline.process(largeHtml);
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      console.log(`Large HTML (5MB) processing time: ${processingTime}ms`);
      
      expect(result.html).toBeDefined();
      expect(result.markdown).toBeDefined();
      expect(result.text).toBeDefined();
      expect(processingTime).toBeLessThan(60000); // Should complete in under 1 minute
    });
  });

  describe('Pipeline Throughput', () => {
    it('should achieve good throughput', async () => {
      const html = generateTestHtml(10 * 1024);
      const pipeline = new ProcessingPipeline();
      
      const operations = 100;
      const startTime = Date.now();
      
      for (let i = 0; i < operations; i++) {
        await pipeline.process(html);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const throughput = (operations / totalTime) * 1000; // ops per second
      
      console.log(`Throughput: ${throughput.toFixed(2)} operations/second`);
      
      expect(throughput).toBeGreaterThan(1); // At least 1 op/sec
    });
  });

  describe('Error Recovery Performance', () => {
    it('should handle errors without significant performance impact', async () => {
      const pipeline = new ProcessingPipeline({
        stopOnError: false,
      });
      
      const validHtml = generateTestHtml(10 * 1024);
      const invalidHtml = '<invalid><unclosed>tags';
      
      const startTime = Date.now();
      
      // Mix valid and invalid HTML
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          await pipeline.process(validHtml);
        } else {
          try {
            await pipeline.process(invalidHtml);
          } catch (error) {
            // Expected to fail
          }
        }
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      console.log(`Error recovery test: ${totalTime}ms for 20 operations`);
      
      expect(totalTime).toBeLessThan(30000); // Should complete reasonably
    });
  });
});


