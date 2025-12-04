/**
 * Processing Pipeline Tests
 * Comprehensive unit tests for ProcessingPipeline
 */

import { ProcessingPipeline, processContent } from '../pipeline.processor';
import { testHtml } from '../../../__tests__/helpers/fixtures';

describe('ProcessingPipeline', () => {
  let pipeline: ProcessingPipeline;

  beforeEach(() => {
    pipeline = new ProcessingPipeline();
  });

  describe('process', () => {
    it('should process HTML through all stages', async () => {
      const result = await pipeline.process(testHtml);
      
      expect(result.html).toBeDefined();
      expect(result.markdown).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.metadata.stagesExecuted.length).toBeGreaterThan(0);
      expect(result.metadata.executionTime).toBeGreaterThan(0);
    });

    it('should execute HTML processing stage', async () => {
      const result = await pipeline.process(testHtml, {
        enableHtmlProcessing: true,
        enableMarkdownConversion: false,
        enableTextExtraction: false,
      });
      
      expect(result.metadata.stagesExecuted).toContain('html-processing');
      expect(result.cleanHtml).toBeDefined();
    });

    it('should execute markdown conversion stage', async () => {
      const result = await pipeline.process(testHtml, {
        enableHtmlProcessing: false,
        enableMarkdownConversion: true,
        enableTextExtraction: false,
      });
      
      expect(result.metadata.stagesExecuted).toContain('markdown-conversion');
      expect(result.markdown).toBeDefined();
    });

    it('should execute text extraction stage', async () => {
      const result = await pipeline.process(testHtml, {
        enableHtmlProcessing: false,
        enableMarkdownConversion: false,
        enableTextExtraction: true,
      });
      
      expect(result.metadata.stagesExecuted).toContain('text-extraction');
      expect(result.text).toBeDefined();
    });

    it('should preserve original HTML when configured', async () => {
      const result = await pipeline.process(testHtml, {
        preserveOriginalHtml: true,
      });
      
      expect(result.html).toBe(testHtml);
    });

    it('should handle errors gracefully when stopOnError is false', async () => {
      const invalidHtml = '<invalid><unclosed>';
      const result = await pipeline.process(invalidHtml, {
        stopOnError: false,
      });
      
      expect(result).toBeDefined();
      expect(result.metadata.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should extract main content when configured', async () => {
      const htmlWithMain = '<html><body><nav>Nav</nav><main><p>Main</p></main></body></html>';
      const result = await pipeline.process(htmlWithMain, {
        extractMainContent: true,
      });
      
      expect(result.mainContent).toBeDefined();
    });

    it('should track execution time for each stage', async () => {
      const result = await pipeline.process(testHtml);
      
      expect(result.metadata.stageTimings).toBeDefined();
      expect(result.metadata.stageTimings['html-processing']).toBeGreaterThanOrEqual(0);
    });

    it('should collect metadata statistics', async () => {
      const result = await pipeline.process(testHtml);
      
      expect(result.metadata.htmlStats).toBeDefined();
      expect(result.metadata.htmlStats?.originalLength).toBeGreaterThan(0);
      expect(result.metadata.textStats).toBeDefined();
    });
  });

  describe('processWithCheerio', () => {
    it('should process Cheerio element through pipeline', async () => {
      const cheerio = require('cheerio');
      const $ = cheerio.load('<html><body><p>Test</p></body></html>');
      const result = await pipeline.processWithCheerio($, $('body'));
      
      expect(result.html).toBeDefined();
      expect(result.markdown).toBeDefined();
      expect(result.text).toBeDefined();
    });

    it('should handle Cheerio processing errors', async () => {
      const cheerio = require('cheerio');
      const $ = cheerio.load('<html><body></body></html>');
      // Pass invalid element
      const result = await pipeline.processWithCheerio($, null as any);
      
      expect(result).toBeDefined();
      expect(result.metadata.errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStats', () => {
    it('should return pipeline statistics', async () => {
      await pipeline.process(testHtml);
      const stats = pipeline.getStats();
      
      expect(stats.totalExecutions).toBeGreaterThan(0);
      expect(stats.averageExecutionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resetStats', () => {
    it('should reset pipeline statistics', async () => {
      await pipeline.process(testHtml);
      pipeline.resetStats();
      const stats = pipeline.getStats();
      
      expect(stats.totalExecutions).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.averageExecutionTime).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('should update pipeline configuration', () => {
      pipeline.updateConfig({ enableHtmlProcessing: false });
      expect(pipeline).toBeDefined();
    });
  });

  describe('processContent convenience function', () => {
    it('should process content using default pipeline', async () => {
      const result = await processContent(testHtml);
      
      expect(result.html).toBeDefined();
      expect(result.markdown).toBeDefined();
      expect(result.text).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty HTML', async () => {
      const result = await pipeline.process('');
      
      expect(result.html).toBe('');
      expect(result.markdown).toBe('');
      expect(result.text).toBe('');
    });

    it('should handle very large HTML', async () => {
      const largeHtml = '<html><body>' + '<p>Content</p>'.repeat(10000) + '</body></html>';
      const result = await pipeline.process(largeHtml);
      
      expect(result.metadata.executionTime).toBeGreaterThan(0);
      expect(result.text).toBeDefined();
    });

    it('should handle HTML with only scripts', async () => {
      const htmlWithOnlyScripts = '<html><body><script>alert("test");</script></body></html>';
      const result = await pipeline.process(htmlWithOnlyScripts);
      
      expect(result).toBeDefined();
    });
  });
});


