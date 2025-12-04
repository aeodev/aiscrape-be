/**
 * HTML Processor Tests
 * Comprehensive unit tests for HtmlProcessor
 */

import { HtmlProcessor } from '../html.processor';
import { testHtml } from '../../../__tests__/helpers/fixtures';

// Skip jsdom-dependent tests if jsdom is not available
const canTestJsdom = () => {
  try {
    require('jsdom');
    return true;
  } catch {
    return false;
  }
};

describe('HtmlProcessor', () => {
  let htmlProcessor: HtmlProcessor;

  beforeEach(() => {
    htmlProcessor = new HtmlProcessor();
  });

  describe('process', () => {
    it('should process HTML and return clean HTML', () => {
      if (!canTestJsdom()) {
        console.warn('Skipping jsdom-dependent test');
        return;
      }
      const simpleHtml = '<html><body><p>Test content</p></body></html>';
      const result = htmlProcessor.process(simpleHtml);
      
      expect(result.html).toBeDefined();
      expect(result.cleanHtml).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.metadata.originalLength).toBeGreaterThan(0);
      expect(result.metadata.cleanLength).toBeGreaterThanOrEqual(0);
    });

    it('should remove scripts when removeScripts is true', () => {
      if (!canTestJsdom()) {
        console.warn('Skipping jsdom-dependent test');
        return;
      }
      const processor = new HtmlProcessor({ removeScripts: true });
      const htmlWithScript = '<html><body><script>alert("test");</script><p>Content</p></body></html>';
      const result = processor.process(htmlWithScript);
      
      expect(result.text).toContain('Content');
      expect(result.metadata.removedTags).toContain('script');
    });

    it('should remove styles when removeStyles is true', () => {
      if (!canTestJsdom()) {
        console.warn('Skipping jsdom-dependent test');
        return;
      }
      const processor = new HtmlProcessor({ removeStyles: true });
      const htmlWithStyle = '<html><head><style>body { color: red; }</style></head><body><p>Content</p></body></html>';
      const result = processor.process(htmlWithStyle);
      
      expect(result.text).toContain('Content');
      expect(result.metadata.removedTags).toContain('style');
    });

    it('should handle empty HTML', () => {
      const result = htmlProcessor.process('');
      
      expect(result.html).toBe('');
      expect(result.cleanHtml).toBe('');
      expect(result.text).toBe('');
      expect(result.metadata.originalLength).toBe(0);
    });

    it('should preserve text content when removing tags', () => {
      if (!canTestJsdom()) {
        console.warn('Skipping jsdom-dependent test');
        return;
      }
      const html = '<html><body><p>Important <strong>bold</strong> text</p></body></html>';
      const result = htmlProcessor.process(html);
      
      expect(result.text).toContain('Important');
      expect(result.text).toContain('bold');
      expect(result.text).toContain('text');
    });

    it('should return metadata with removed tags', () => {
      if (!canTestJsdom()) {
        console.warn('Skipping jsdom-dependent test');
        return;
      }
      const processor = new HtmlProcessor({ removeScripts: true, removeStyles: true });
      const html = '<html><body><script>test</script><style>css</style><p>Content</p></body></html>';
      const result = processor.process(html);
      
      expect(result.metadata.removedTags.length).toBeGreaterThan(0);
    });
  });

  describe('processWithCheerio', () => {
    it('should process HTML from Cheerio element', () => {
      if (!canTestJsdom()) {
        console.warn('Skipping jsdom-dependent test');
        return;
      }
      const cheerio = require('cheerio');
      const $ = cheerio.load('<html><body><p>Test</p></body></html>');
      const result = htmlProcessor.processWithCheerio($, $('body'));
      
      expect(result.html).toBeDefined();
      expect(result.cleanHtml).toBeDefined();
      expect(result.text).toContain('Test');
    });
  });

  describe('edge cases', () => {
    it('should handle HTML with special characters', () => {
      if (!canTestJsdom()) {
        console.warn('Skipping jsdom-dependent test');
        return;
      }
      const html = '<html><body><p>Test &amp; "quotes" &lt;tags&gt;</p></body></html>';
      const result = htmlProcessor.process(html);
      
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('should handle HTML with unicode characters', () => {
      if (!canTestJsdom()) {
        console.warn('Skipping jsdom-dependent test');
        return;
      }
      const html = '<html><body><p>Test: 中文 العربية русский</p></body></html>';
      const result = htmlProcessor.process(html);
      
      expect(result.text).toContain('中文');
      expect(result.text).toContain('العربية');
      expect(result.text).toContain('русский');
    });

    it('should handle basic HTML structure', () => {
      if (!canTestJsdom()) {
        console.warn('Skipping jsdom-dependent test');
        return;
      }
      const html = '<html><head><title>Title</title></head><body><h1>Heading</h1><p>Paragraph</p></body></html>';
      const result = htmlProcessor.process(html);
      
      expect(result.text).toContain('Heading');
      expect(result.text).toContain('Paragraph');
    });
  });
});

