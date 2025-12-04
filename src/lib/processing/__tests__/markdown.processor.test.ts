/**
 * Markdown Processor Tests
 * Comprehensive unit tests for MarkdownProcessor
 */

import { MarkdownProcessor, htmlStringToMarkdown } from '../markdown.processor';

describe('MarkdownProcessor', () => {
  let markdownProcessor: MarkdownProcessor;

  beforeEach(() => {
    markdownProcessor = new MarkdownProcessor();
  });

  describe('htmlStringToMarkdown', () => {
    it('should convert simple HTML to markdown', () => {
      const html = '<h1>Heading</h1><p>Paragraph text.</p>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toContain('# Heading');
      expect(markdown).toContain('Paragraph text');
    });

    it('should convert headings correctly', () => {
      const html = '<h1>H1</h1><h2>H2</h2><h3>H3</h3>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toContain('# H1');
      expect(markdown).toContain('## H2');
      expect(markdown).toContain('### H3');
    });

    it('should convert links correctly', () => {
      const html = '<a href="https://example.com">Link Text</a>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toContain('[Link Text](https://example.com)');
    });

    it('should convert images correctly', () => {
      const html = '<img src="image.jpg" alt="Alt text" />';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toContain('![Alt text](image.jpg)');
    });

    it('should convert lists correctly', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toMatch(/-.*Item 1/);
      expect(markdown).toMatch(/-.*Item 2/);
    });

    it('should convert ordered lists correctly', () => {
      const html = '<ol><li>First</li><li>Second</li></ol>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toMatch(/1\.\s*First/);
      expect(markdown).toMatch(/2\.\s*Second/);
    });

    it('should convert code blocks correctly', () => {
      const html = '<pre><code>const x = 1;</code></pre>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toContain('```');
      expect(markdown).toContain('const x = 1;');
    });

    it('should convert inline code correctly', () => {
      const html = '<p>Use <code>console.log()</code> to debug.</p>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toContain('`console.log()`');
    });

    it('should convert tables correctly (GFM)', () => {
      const html = '<table><tr><th>Header</th></tr><tr><td>Cell</td></tr></table>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toContain('Header');
      expect(markdown).toContain('Cell');
    });

    it('should convert blockquotes correctly', () => {
      const html = '<blockquote>Quoted text</blockquote>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toContain('> Quoted text');
    });

    it('should handle empty HTML', () => {
      const markdown = htmlStringToMarkdown('');
      expect(markdown).toBe('');
    });

    it('should handle HTML with only whitespace', () => {
      const markdown = htmlStringToMarkdown('   \n\t  ');
      expect(markdown.trim()).toBe('');
    });

    it('should preserve text content when removing tags', () => {
      const html = '<div><p>Text <strong>bold</strong> and <em>italic</em></p></div>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toContain('Text');
      expect(markdown).toContain('bold');
      expect(markdown).toContain('italic');
    });

    it('should handle nested structures', () => {
      const html = '<div><div><p>Nested content</p></div></div>';
      const markdown = htmlStringToMarkdown(html);
      
      expect(markdown).toContain('Nested content');
    });
  });


  describe('edge cases', () => {
    it('should handle malformed HTML', () => {
      const html = '<p>Unclosed<p>Another';
      const markdown = htmlStringToMarkdown(html);
      expect(markdown).toBeDefined();
    });

    it('should handle HTML with special characters', () => {
      const html = '<p>Test &amp; "quotes" &lt;tags&gt;</p>';
      const markdown = htmlStringToMarkdown(html);
      expect(markdown).toBeDefined();
    });

    it('should handle HTML with unicode', () => {
      const html = '<p>中文 العربية русский</p>';
      const markdown = htmlStringToMarkdown(html);
      expect(markdown).toContain('中文');
    });
  });
});

