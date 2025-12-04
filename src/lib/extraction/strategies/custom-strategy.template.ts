/**
 * Custom Strategy Template
 * Base template class for creating custom extraction strategies
 */

import { BaseExtractionStrategy } from '../extraction.strategy';
import {
  ExtractionStrategyType,
  ExtractionContext,
  ExtractionResult,
} from '../extraction.types';
import { IExtractedEntity } from '../../../modules/scraper/scraper.types';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';

/**
 * Custom strategy template class
 * Extend this class to create your own extraction strategy
 */
export abstract class CustomStrategyTemplate extends BaseExtractionStrategy {
  /**
   * Strategy name (must be set by subclass)
   */
  abstract name: string;

  /**
   * Strategy type (always CUSTOM for custom strategies)
   */
  type = ExtractionStrategyType.CUSTOM;

  /**
   * Configuration object (optional)
   */
  protected config?: Record<string, any>;

  /**
   * Constructor
   */
  constructor(config?: Record<string, any>) {
    super();
    this.config = config;
    this.validateConfig();
  }

  /**
   * Extract entities from context (must be implemented by subclass)
   */
  abstract extract(context: ExtractionContext): Promise<ExtractionResult>;

  /**
   * Check if strategy is available (must be implemented by subclass)
   */
  abstract isAvailable(): boolean;

  /**
   * Validate strategy configuration
   */
  protected validateConfig(): void {
    if (!this.name || this.name.trim().length === 0) {
      throw new Error('Custom strategy must have a name');
    }
  }

  /**
   * Parse HTML with Cheerio
   */
  protected parseHtml(html: string): cheerio.CheerioAPI {
    return cheerio.load(html);
  }

  /**
   * Extract text content from HTML
   */
  protected extractText(html: string): string {
    const $ = this.parseHtml(html);
    return $('body').text().trim() || '';
  }

  /**
   * Extract JSON from script tags (JSON-LD, application/json, etc.)
   */
  protected extractJson(html: string): any[] {
    const $ = this.parseHtml(html);
    const jsonData: any[] = [];

    $('script[type="application/ld+json"], script[type="application/json"]').each(
      (_, element) => {
        try {
          const content = $(element).html();
          if (content) {
            const parsed = JSON.parse(content);
            jsonData.push(parsed);
          }
        } catch (error) {
          // Skip invalid JSON
        }
      }
    );

    return jsonData;
  }

  /**
   * Extract JSON-LD structured data
   */
  protected extractJsonLd(html: string): any[] {
    const $ = this.parseHtml(html);
    const jsonLdData: any[] = [];

    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const content = $(element).html();
        if (content) {
          const parsed = JSON.parse(content);
          // Handle both single objects and arrays
          if (Array.isArray(parsed)) {
            jsonLdData.push(...parsed);
          } else {
            jsonLdData.push(parsed);
          }
        }
      } catch (error) {
        // Skip invalid JSON
      }
    });

    return jsonLdData;
  }

  /**
   * Extract microdata from HTML
   */
  protected extractMicrodata(html: string): any[] {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const items: any[] = [];

    // Find all elements with itemscope
    const scopedElements = document.querySelectorAll('[itemscope]');

    scopedElements.forEach((element) => {
      const item: any = {};

      // Get itemtype
      const itemType = element.getAttribute('itemtype');
      if (itemType) {
        item['@type'] = itemType;
      }

      // Get all properties
      const properties = element.querySelectorAll('[itemprop]');
      properties.forEach((prop) => {
        const propName = prop.getAttribute('itemprop');
        if (propName) {
          let value: any;

          // Check for itemscope (nested item)
          if (prop.hasAttribute('itemscope')) {
            value = this.extractMicrodataItem(prop);
          } else {
            // Get value from content or attribute
            const content = prop.textContent?.trim();
            const href = prop.getAttribute('href');
            const src = prop.getAttribute('src');
            const datetime = prop.getAttribute('datetime');

            value = datetime || href || src || content;
          }

          if (value !== null && value !== undefined) {
            if (item[propName]) {
              // Convert to array if multiple values
              if (!Array.isArray(item[propName])) {
                item[propName] = [item[propName]];
              }
              item[propName].push(value);
            } else {
              item[propName] = value;
            }
          }
        }
      });

      if (Object.keys(item).length > 0) {
        items.push(item);
      }
    });

    return items;
  }

  /**
   * Extract a single microdata item
   */
  private extractMicrodataItem(element: Element): any {
    const item: any = {};

    const itemType = element.getAttribute('itemtype');
    if (itemType) {
      item['@type'] = itemType;
    }

    const properties = element.querySelectorAll('[itemprop]');
    properties.forEach((prop) => {
      const propName = prop.getAttribute('itemprop');
      if (propName && !prop.hasAttribute('itemscope')) {
        const content = prop.textContent?.trim();
        const href = prop.getAttribute('href');
        const src = prop.getAttribute('src');
        const datetime = prop.getAttribute('datetime');

        const value = datetime || href || src || content;
        if (value !== null && value !== undefined) {
          item[propName] = value;
        }
      }
    });

    return item;
  }

  /**
   * Extract meta tags
   */
  protected extractMetaTags(html: string): Record<string, string> {
    const $ = this.parseHtml(html);
    const metaTags: Record<string, string> = {};

    $('meta').each((_, element) => {
      const $el = $(element);
      const name = $el.attr('name') || $el.attr('property') || $el.attr('itemprop');
      const content = $el.attr('content');

      if (name && content) {
        metaTags[name] = content;
      }
    });

    return metaTags;
  }

  /**
   * Extract Open Graph tags
   */
  protected extractOpenGraph(html: string): Record<string, string> {
    const $ = this.parseHtml(html);
    const ogTags: Record<string, string> = {};

    $('meta[property^="og:"]').each((_, element) => {
      const $el = $(element);
      const property = $el.attr('property');
      const content = $el.attr('content');

      if (property && content) {
        ogTags[property] = content;
      }
    });

    return ogTags;
  }

  /**
   * Extract Twitter Card tags
   */
  protected extractTwitterCard(html: string): Record<string, string> {
    const $ = this.parseHtml(html);
    const twitterTags: Record<string, string> = {};

    $('meta[name^="twitter:"]').each((_, element) => {
      const $el = $(element);
      const name = $el.attr('name');
      const content = $el.attr('content');

      if (name && content) {
        twitterTags[name] = content;
      }
    });

    return twitterTags;
  }

  /**
   * Log extraction activity (helper for debugging)
   */
  protected logExtraction(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${this.name}] ${message}`, data || '');
    }
  }

  /**
   * Get configuration value
   */
  protected getConfig(key: string, defaultValue?: any): any {
    return this.config?.[key] ?? defaultValue;
  }

  /**
   * Check if configuration key exists
   */
  protected hasConfig(key: string): boolean {
    return this.config !== undefined && key in this.config;
  }
}


