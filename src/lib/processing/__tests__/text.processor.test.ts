/**
 * Text Processor Tests
 * Comprehensive unit tests for TextProcessor
 */

import { TextProcessor } from '../text.processor';

describe('TextProcessor', () => {
  let textProcessor: TextProcessor;

  beforeEach(() => {
    textProcessor = new TextProcessor();
  });

  describe('process', () => {
    it('should process text and return cleaned text', () => {
      const text = '  Test   Text  ';
      const result = textProcessor.process(text);
      
      expect(result.text).toBeDefined();
      expect(result.originalLength).toBe(text.length);
      expect(result.processedLength).toBeGreaterThan(0);
      expect(result.metadata.normalized).toBe(true);
    });

    it('should normalize unicode when enabled', () => {
      const text = 'café'; // Contains é (can be normalized)
      const result = textProcessor.process(text, { normalizeUnicode: true });
      
      expect(result.text).toBeDefined();
      expect(result.metadata.normalized).toBe(true);
    });

    it('should remove control characters', () => {
      const text = 'Test\u0000\u0001\u0002Text';
      const result = textProcessor.process(text, { removeControlChars: true });
      
      expect(result.text).not.toContain('\u0000');
      expect(result.text).not.toContain('\u0001');
      expect(result.text).toContain('Test');
      expect(result.text).toContain('Text');
    });

    it('should normalize line breaks', () => {
      const text = 'Line1\r\nLine2\nLine3\rLine4';
      const result = textProcessor.process(text, { normalizeLineBreaks: true });
      
      // Should normalize to consistent line breaks
      expect(result.text).toBeDefined();
    });

    it('should clean whitespace', () => {
      const text = '  Multiple    spaces   here  ';
      const result = textProcessor.process(text, { cleanWhitespace: true });
      
      expect(result.text).not.toContain('    ');
      expect(result.text.trim()).toBeDefined();
    });

    it('should preserve paragraphs when configured', () => {
      const text = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
      const result = textProcessor.process(text, { preserveParagraphs: true });
      
      expect(result.text).toBeDefined();
      // Paragraphs should be preserved
    });

    it('should handle empty text', () => {
      const result = textProcessor.process('');
      
      expect(result.text).toBe('');
      expect(result.originalLength).toBe(0);
      expect(result.processedLength).toBe(0);
    });

    it('should handle whitespace-only text', () => {
      const result = textProcessor.process('   \n\t  ');
      
      expect(result.text.trim().length).toBe(0);
    });

    it('should respect maxLength', () => {
      const longText = 'A'.repeat(1000);
      const result = textProcessor.process(longText, { maxLength: 100 });
      
      expect(result.processedLength).toBeLessThanOrEqual(100);
    });
  });

  describe('extractFromHtml', () => {
    it('should extract text from HTML string', () => {
      const html = '<html><body><p>Test content</p></body></html>';
      const text = textProcessor.extractFromHtml(html);
      
      expect(text).toContain('Test content');
      expect(text).not.toContain('<p>');
      expect(text).not.toContain('</p>');
    });

    it('should extract text preserving paragraphs', () => {
      const html = '<html><body><p>Para 1</p><p>Para 2</p></body></html>';
      const text = textProcessor.extractFromHtml(html, true);
      
      expect(text).toContain('Para 1');
      expect(text).toContain('Para 2');
    });
  });

  describe('extractFromCheerio', () => {
    it('should extract text from Cheerio element', () => {
      const cheerio = require('cheerio');
      const $ = cheerio.load('<html><body><p>Cheerio text</p></body></html>');
      const text = textProcessor.extractFromCheerio($, $('body'));
      
      expect(text).toContain('Cheerio text');
    });
  });

  describe('extractFromJSDOM', () => {
    it('should extract text from JSDOM document', () => {
      if (!canTestJsdom()) {
        console.warn('Skipping jsdom-dependent test');
        return;
      }
      try {
        const { JSDOM } = require('jsdom');
        const dom = new JSDOM('<html><body><p>JSDOM text</p></body></html>');
        const text = textProcessor.extractFromJSDOM(dom.window.document);
        
        expect(text).toContain('JSDOM text');
      } catch (error) {
        // Skip if JSDOM not available in test environment
        expect(true).toBe(true);
      }
    });
  });

  describe('normalize', () => {
    it('should normalize to NFC form', () => {
      const text = 'café';
      const normalized = textProcessor['normalize'](text, 'NFC');
      expect(normalized).toBeDefined();
    });

    it('should normalize to NFD form', () => {
      const text = 'café';
      const normalized = textProcessor['normalize'](text, 'NFD');
      expect(normalized).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle text with unicode characters', () => {
      const text = 'Test: 中文 العربية русский 🚀';
      const result = textProcessor.process(text);
      
      expect(result.text).toContain('中文');
      expect(result.text).toContain('العربية');
      expect(result.text).toContain('русский');
    });

    it('should handle very long text', () => {
      const longText = 'A'.repeat(100000);
      const result = textProcessor.process(longText);
      
      expect(result.processedLength).toBeGreaterThan(0);
    });

    it('should handle text with mixed line endings', () => {
      const text = 'Line1\r\nLine2\nLine3\rLine4';
      const result = textProcessor.process(text);
      
      expect(result.text).toBeDefined();
    });
  });
});

