/**
 * HTML Processor
 * Advanced HTML processing with sanitization, noise removal, and content extraction
 */

import sanitizeHtml from 'sanitize-html';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';

// Use any for $ to support different Cheerio versions
type CheerioFunction = any;
type CheerioSelection = any;

export interface HtmlProcessorConfig {
  removeScripts?: boolean;
  removeStyles?: boolean;
  removeComments?: boolean;
  removeNoise?: boolean; // Remove ads, trackers, etc.
  extractMainContent?: boolean;
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  maxHtmlLength?: number;
}

export interface ProcessedHtml {
  html: string;
  cleanHtml: string;
  mainContent?: string;
  text: string;
  metadata: {
    originalLength: number;
    cleanLength: number;
    mainContentLength?: number;
    removedTags: string[];
  };
}

export class HtmlProcessor {
  private config: Required<HtmlProcessorConfig>;

  // Common noise selectors (ads, trackers, social widgets, etc.)
  private readonly noiseSelectors = [
    'script',
    'style',
    'noscript',
    'iframe[src*="ads"]',
    'iframe[src*="advertising"]',
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]',
    '[class*="ad"]',
    '[class*="advertisement"]',
    '[class*="advert"]',
    '[id*="ad"]',
    '[id*="advertisement"]',
    '[id*="advert"]',
    '[data-ad]',
    '[data-ad-client]',
    '[data-ad-slot]',
    '.ad-banner',
    '.ad-container',
    '.ad-wrapper',
    '.advertisement',
    '.adsbygoogle',
    '.google-ad',
    '.social-share',
    '.share-buttons',
    '.social-media',
    '.twitter-widget',
    '.facebook-widget',
    '.instagram-embed',
    '.disqus-comments',
    '.comment-section',
    'nav',
    'footer',
    'header',
    'aside[class*="sidebar"]',
    '.sidebar',
    '.related-posts',
    '.related-articles',
    '.newsletter',
    '.subscribe',
    '.cookie-banner',
    '.cookie-consent',
    '[role="banner"]',
    '[role="navigation"]',
    '[role="complementary"]',
    '[role="contentinfo"]',
  ];

  // Main content selectors (in order of preference)
  private readonly mainContentSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '#content',
    '.post',
    '.article',
    '.entry-content',
    '.post-content',
    '.article-content',
    '.main-content',
    '.page-content',
    'section',
    '.body-content',
  ];

  constructor(config?: HtmlProcessorConfig) {
    this.config = {
      removeScripts: config?.removeScripts !== false,
      removeStyles: config?.removeStyles !== false,
      removeComments: config?.removeComments !== false,
      removeNoise: config?.removeNoise !== false,
      extractMainContent: config?.extractMainContent !== false,
      allowedTags: config?.allowedTags || [],
      allowedAttributes: config?.allowedAttributes || {},
      maxHtmlLength: config?.maxHtmlLength || 10 * 1024 * 1024, // 10MB default
    };
  }

  /**
   * Process HTML string
   */
  process(html: string): ProcessedHtml {
    if (!html || html.trim().length === 0) {
      return {
        html: '',
        cleanHtml: '',
        text: '',
        metadata: {
          originalLength: 0,
          cleanLength: 0,
          removedTags: [],
        },
      };
    }

    const originalLength = html.length;

    // Truncate if too long
    if (html.length > this.config.maxHtmlLength) {
      html = html.substring(0, this.config.maxHtmlLength);
      console.warn(`HTML truncated from ${originalLength} to ${this.config.maxHtmlLength} bytes`);
    }

    // Parse with JSDOM for better DOM manipulation
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const removedTags: string[] = [];

    // Remove scripts
    if (this.config.removeScripts) {
      const scripts = document.querySelectorAll('script');
      scripts.forEach((script) => {
        removedTags.push('script');
        script.remove();
      });
    }

    // Remove styles
    if (this.config.removeStyles) {
      const styles = document.querySelectorAll('style');
      styles.forEach((style) => {
        removedTags.push('style');
        style.remove();
      });
    }

    // Remove comments
    if (this.config.removeComments) {
      // NodeFilter.SHOW_COMMENT = 128
      const walker = document.createTreeWalker(
        document,
        128, // NodeFilter.SHOW_COMMENT
        null
      );
      const comments: Comment[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        comments.push(node as Comment);
      }
      comments.forEach((comment) => {
        comment.remove();
      });
    }

    // Remove noise (ads, trackers, etc.)
    if (this.config.removeNoise) {
      this.noiseSelectors.forEach((selector) => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach((element) => {
            const tagName = element.tagName?.toLowerCase();
            if (tagName && !removedTags.includes(tagName)) {
              removedTags.push(tagName);
            }
            element.remove();
          });
        } catch (error) {
          // Invalid selector, skip
        }
      });
    }

    // Extract main content if requested
    let mainContent: string | undefined;
    let mainContentLength: number | undefined;

    if (this.config.extractMainContent) {
      const mainContentElement = this.findMainContent(document);
      if (mainContentElement) {
        mainContent = mainContentElement.innerHTML;
        mainContentLength = mainContent.length;
      }
    }

    // Sanitize HTML
    const cleanHtml = this.sanitize(document.documentElement.outerHTML);
    const cleanLength = cleanHtml.length;

    // Extract text
    const text = this.extractText(document);

    return {
      html: document.documentElement.outerHTML,
      cleanHtml,
      mainContent,
      text,
      metadata: {
        originalLength,
        cleanLength,
        mainContentLength,
        removedTags: [...new Set(removedTags)],
      },
    };
  }

  /**
   * Process HTML using Cheerio (for compatibility with existing code)
   */
  processWithCheerio($: CheerioFunction, element: CheerioSelection): ProcessedHtml {
    const html = $.html(element) || element.html() || '';
    return this.process(html);
  }

  /**
   * Find main content element
   */
  private findMainContent(document: Document): Element | null {
    for (const selector of this.mainContentSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isSubstantialContent(element)) {
          return element;
        }
      } catch (error) {
        // Invalid selector, continue
      }
    }

    // Fallback to body
    const body = document.body;
    if (body && this.isSubstantialContent(body)) {
      return body;
    }

    return null;
  }

  /**
   * Check if element has substantial content
   */
  private isSubstantialContent(element: Element): boolean {
    const text = element.textContent || '';
    const textLength = text.trim().replace(/\s+/g, ' ').length;
    
    // Consider substantial if has at least 200 characters of text
    return textLength >= 200;
  }

  /**
   * Sanitize HTML using sanitize-html
   */
  private sanitize(html: string): string {
    const sanitizeOptions: sanitizeHtml.IOptions = {
      allowedTags: this.config.allowedTags.length > 0
        ? this.config.allowedTags
        : sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption']),
      allowedAttributes: this.config.allowedAttributes && Object.keys(this.config.allowedAttributes).length > 0
        ? this.config.allowedAttributes
        : {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ['src', 'alt', 'title', 'width', 'height'],
            a: ['href', 'title', 'target', 'rel'],
            '*': ['class', 'id', 'data-*'],
          },
      allowedSchemes: ['http', 'https', 'mailto', 'tel'],
      allowedSchemesByTag: {
        img: ['http', 'https', 'data'],
        a: ['http', 'https', 'mailto', 'tel'],
      },
      allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
      allowProtocolRelative: true,
      enforceHtmlBoundary: true,
    };

    return sanitizeHtml(html, sanitizeOptions);
  }

  /**
   * Extract clean text from document
   */
  private extractText(document: Document): string {
    const body = document.body || document.documentElement;
    if (!body) {
      return '';
    }

    // Clone body to avoid modifying original
    const clone = body.cloneNode(true) as Element;

    // Remove script and style elements from clone
    const scripts = clone.querySelectorAll('script, style');
    scripts.forEach((el) => el.remove());

    const text = clone.textContent || '';
    
    // Clean up whitespace
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * Remove noise from HTML string
   */
  removeNoise(html: string): string {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    this.noiseSelectors.forEach((selector) => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element) => element.remove());
      } catch (error) {
        // Invalid selector, skip
      }
    });

    return document.documentElement.outerHTML;
  }

  /**
   * Extract main content from HTML string
   */
  extractMainContent(html: string): string | null {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const mainContent = this.findMainContent(document);
    
    return mainContent ? mainContent.innerHTML : null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HtmlProcessorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export singleton instance with default configuration
export const htmlProcessor = new HtmlProcessor();

// Export convenience functions
export function processHtml(html: string, config?: HtmlProcessorConfig): ProcessedHtml {
  const processor = config ? new HtmlProcessor(config) : htmlProcessor;
  return processor.process(html);
}

export function processHtmlWithCheerio(
  $: CheerioFunction,
  element: CheerioSelection,
  config?: HtmlProcessorConfig
): ProcessedHtml {
  const processor = config ? new HtmlProcessor(config) : htmlProcessor;
  return processor.processWithCheerio($, element);
}



