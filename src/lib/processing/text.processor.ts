/**
 * Text Processor
 * Advanced text processing with normalization, Unicode handling, and whitespace cleanup
 */

import { JSDOM } from 'jsdom';

// Use any for $ to support different Cheerio versions
type CheerioFunction = any;
type CheerioSelection = any;

export type UnicodeNormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

export interface TextProcessorConfig {
  normalizeUnicode?: boolean;
  normalizeForm?: UnicodeNormalizationForm;
  cleanWhitespace?: boolean;
  removeControlChars?: boolean;
  normalizeLineBreaks?: boolean;
  deduplicateWhitespace?: boolean;
  trimLines?: boolean;
  preserveParagraphs?: boolean;
  maxLength?: number;
}

export interface ProcessedText {
  text: string;
  originalLength: number;
  processedLength: number;
  metadata: {
    removedChars: number;
    normalized: boolean;
  };
}

export class TextProcessor {
  private config: Required<TextProcessorConfig>;

  constructor(config?: TextProcessorConfig) {
    this.config = {
      normalizeUnicode: config?.normalizeUnicode !== false,
      normalizeForm: config?.normalizeForm || 'NFC',
      cleanWhitespace: config?.cleanWhitespace !== false,
      removeControlChars: config?.removeControlChars !== false,
      normalizeLineBreaks: config?.normalizeLineBreaks !== false,
      deduplicateWhitespace: config?.deduplicateWhitespace !== false,
      trimLines: config?.trimLines !== false,
      preserveParagraphs: config?.preserveParagraphs !== false,
      maxLength: config?.maxLength || Infinity,
    };
  }

  /**
   * Main processing method
   */
  process(text: string, options?: Partial<TextProcessorConfig>): ProcessedText {
    if (!text || text.trim().length === 0) {
      return {
        text: '',
        originalLength: 0,
        processedLength: 0,
        metadata: {
          removedChars: 0,
          normalized: false,
        },
      };
    }

    const originalLength = text.length;
    const config = { ...this.config, ...options };
    let processed = text;
    let normalized = false;
    let removedChars = 0;

    // Unicode normalization
    if (config.normalizeUnicode) {
      processed = this.normalize(processed, config.normalizeForm);
      normalized = true;
    }

    // Remove control characters
    if (config.removeControlChars) {
      const beforeLength = processed.length;
      processed = this.removeControlCharacters(processed);
      removedChars += beforeLength - processed.length;
    }

    // Normalize line breaks
    if (config.normalizeLineBreaks) {
      processed = this.normalizeLineBreaks(processed);
    }

    // Clean whitespace
    if (config.cleanWhitespace) {
      if (config.preserveParagraphs) {
        processed = this.cleanWhitespacePreserveParagraphs(processed);
      } else {
        processed = this.cleanWhitespace(processed);
      }
    }

    // Deduplicate whitespace
    if (config.deduplicateWhitespace) {
      processed = this.deduplicateWhitespace(processed);
    }

    // Trim lines
    if (config.trimLines) {
      processed = this.trimLines(processed);
    }

    // Apply max length limit
    if (processed.length > config.maxLength) {
      processed = processed.substring(0, config.maxLength);
      removedChars += processed.length - config.maxLength;
    }

    const processedLength = processed.length;
    removedChars += originalLength - processedLength;

    return {
      text: processed,
      originalLength,
      processedLength,
      metadata: {
        removedChars: Math.max(0, removedChars),
        normalized,
      },
    };
  }

  /**
   * Unicode normalization
   */
  normalize(text: string, form: UnicodeNormalizationForm = 'NFC'): string {
    try {
      return text.normalize(form);
    } catch (error: any) {
      console.error('Unicode normalization error:', error.message);
      return text;
    }
  }

  /**
   * Clean whitespace (aggressive)
   */
  cleanWhitespace(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Replace all whitespace with single space
      .trim();
  }

  /**
   * Clean whitespace while preserving paragraphs
   */
  cleanWhitespacePreserveParagraphs(text: string): string {
    return text
      .replace(/[ \t]+/g, ' ') // Replace spaces/tabs with single space
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/[ \t]+\n/g, '\n') // Remove trailing spaces before newlines
      .replace(/\n[ \t]+/g, '\n') // Remove leading spaces after newlines
      .trim();
  }

  /**
   * Extract text from HTML string
   */
  extractFromHtml(html: string, preserveStructure: boolean = false): string {
    try {
      const dom = new JSDOM(html);
      return this.extractFromJSDOM(dom.window.document, preserveStructure);
    } catch (error: any) {
      console.error('HTML text extraction error:', error.message);
      // Fallback: remove HTML tags
      return this.removeHtmlTags(html);
    }
  }

  /**
   * Extract text from Cheerio element
   */
  extractFromCheerio($: CheerioFunction, element: CheerioSelection, preserveStructure: boolean = false): string {
    try {
      // Get HTML from Cheerio element
      const html = $.html(element) || element.html() || '';
      return this.extractFromHtml(html, preserveStructure);
    } catch (error: any) {
      console.error('Cheerio text extraction error:', error.message);
      // Fallback: use Cheerio's text() method
      return element.text() || '';
    }
  }

  /**
   * Extract text from JSDOM document
   */
  extractFromJSDOM(document: Document, preserveStructure: boolean = false): string {
    try {
      // Clone document to avoid modifying original
      const clone = document.cloneNode(true) as Document;
      
      // Remove script and style elements
      const scripts = clone.querySelectorAll('script, style, noscript');
      scripts.forEach((el) => el.remove());

      const body = clone.body || clone.documentElement;
      if (!body) {
        return '';
      }

      if (preserveStructure) {
        // Preserve semantic structure
        return this.extractTextWithStructure(body);
      } else {
        // Simple text extraction
        return (body.textContent || '').trim();
      }
    } catch (error: any) {
      console.error('JSDOM text extraction error:', error.message);
      return '';
    }
  }

  /**
   * Extract text with structure preservation
   */
  private extractTextWithStructure(element: Element): string {
    let text = '';
    // NodeFilter constants: SHOW_TEXT = 4, SHOW_ELEMENT = 1
    const walker = element.ownerDocument.createTreeWalker(
      element,
      4 | 1, // NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
      null
    );

    let node: Node | null;
    // Node type constants: TEXT_NODE = 3, ELEMENT_NODE = 1
    const TEXT_NODE = 3;
    const ELEMENT_NODE = 1;
    while ((node = walker.nextNode())) {
      if (node.nodeType === TEXT_NODE) {
        const textContent = node.textContent || '';
        if (textContent.trim()) {
          text += textContent;
        }
      } else if (node.nodeType === ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();
        
        // Add structure markers
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          text += '\n\n';
        } else if (['p', 'div', 'section', 'article'].includes(tagName)) {
          text += '\n\n';
        } else if (tagName === 'li') {
          text += '\n- ';
        } else if (['br', 'hr'].includes(tagName)) {
          text += '\n';
        }
      }
    }

    return text.trim();
  }

  /**
   * Remove markdown syntax from text
   */
  removeMarkdown(text: string): string {
    return text
      // Headers
      .replace(/^#{1,6}\s+/gm, '')
      // Bold/Italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      // Code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Inline code
      .replace(/`([^`]+)`/g, '$1')
      // Lists
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      // Blockquotes
      .replace(/^>\s+/gm, '')
      // Horizontal rules
      .replace(/^---+$/gm, '')
      // Strikethrough
      .replace(/~~([^~]+)~~/g, '$1')
      .trim();
  }

  /**
   * Remove HTML tags from text
   */
  removeHtmlTags(text: string): string {
    return text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalize line breaks
   */
  normalizeLineBreaks(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // CRLF → LF
      .replace(/\r/g, '\n'); // CR → LF
  }

  /**
   * Remove control characters
   */
  removeControlCharacters(text: string): string {
    return text
      // Remove ASCII control characters except tab (0x09), newline (0x0A), carriage return (0x0D)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Remove bidirectional control characters (optional - can be kept for RTL text)
      .replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
  }

  /**
   * Deduplicate whitespace
   */
  deduplicateWhitespace(text: string): string {
    return text
      .replace(/[ \t]+/g, ' ') // Multiple spaces/tabs → single space
      .replace(/\n{3,}/g, '\n\n'); // Multiple newlines → double newline
  }

  /**
   * Trim whitespace from each line
   */
  trimLines(text: string): string {
    return text
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n'); // Clean up excessive newlines after trimming
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TextProcessorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export singleton instance with default configuration
export const textProcessor = new TextProcessor();

// Export convenience functions
export function processText(text: string, config?: TextProcessorConfig): ProcessedText {
  const processor = config ? new TextProcessor(config) : textProcessor;
  return processor.process(text);
}

export function extractTextFromHtml(html: string, preserveStructure: boolean = false): string {
  return textProcessor.extractFromHtml(html, preserveStructure);
}

export function extractTextFromCheerio(
  $: CheerioFunction,
  element: CheerioSelection,
  preserveStructure: boolean = false
): string {
  return textProcessor.extractFromCheerio($, element, preserveStructure);
}



