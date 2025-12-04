/**
 * Rule-Based Extraction Utilities
 * CSS selector, XPath, regex, and transformation utilities
 */

import * as cheerio from 'cheerio';
import * as xpath from 'xpath';
import { DOMParser } from '@xmldom/xmldom';
import { ExtractionRule } from './rule-based.types';

/**
 * Extract values using CSS selector
 */
export function extractBySelector(
  html: string,
  selector: string,
  options: { attribute?: string; text?: boolean } = {}
): string[] {
  try {
    const $ = cheerio.load(html);
    const results: string[] = [];

    $(selector).each((_, element) => {
      const $el = $(element);

      if (options.attribute) {
        const value = $el.attr(options.attribute);
        if (value) {
          results.push(value);
        }
      } else {
        const text = options.text !== false ? $el.text().trim() : $el.html() || '';
        if (text) {
          results.push(text);
        }
      }
    });

    return results;
  } catch (error) {
    console.error(`Error extracting with selector "${selector}":`, error);
    return [];
  }
}

/**
 * Extract values using XPath
 */
export function extractByXPath(
  html: string,
  xpathExpr: string,
  options: { attribute?: string; text?: boolean } = {}
): string[] {
  try {
    // Parse HTML to XML-like structure
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const nodes = xpath.select(xpathExpr, doc) as any[];

    const results: string[] = [];

    for (const node of nodes) {
      if (options.attribute && node.attributes) {
        const attr = node.attributes.getNamedItem(options.attribute);
        if (attr && attr.value) {
          results.push(attr.value);
        }
      } else if (node.textContent) {
        results.push(node.textContent.trim());
      } else if (node.nodeValue) {
        results.push(node.nodeValue.trim());
      }
    }

    return results;
  } catch (error) {
    console.error(`Error extracting with XPath "${xpathExpr}":`, error);
    return [];
  }
}

/**
 * Extract values using regex
 */
export function extractByRegex(
  text: string,
  pattern: string,
  flags: string = 'gi'
): string[] {
  try {
    const regex = new RegExp(pattern, flags);
    const matches = text.match(regex);
    return matches ? Array.from(new Set(matches)) : [];
  } catch (error) {
    console.error(`Error extracting with regex "${pattern}":`, error);
    return [];
  }
}

/**
 * Built-in transformer functions
 */
export const Transformers: Record<string, (value: string) => any> = {
  trim: (value: string) => value.trim(),
  lowercase: (value: string) => value.toLowerCase(),
  uppercase: (value: string) => value.toUpperCase(),
  parseNumber: (value: string) => {
    const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? null : num;
  },
  parseDate: (value: string) => {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString();
  },
  parseEmail: (value: string) => {
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/i;
    const match = value.match(emailRegex);
    return match ? match[0].toLowerCase() : null;
  },
  parsePhone: (value: string) => {
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const match = value.match(phoneRegex);
    return match ? match[0].replace(/\s+/g, '-') : null;
  },
  parseUrl: (value: string) => {
    try {
      // If it's already a URL, return it
      if (value.startsWith('http://') || value.startsWith('https://')) {
        return value;
      }
      // Try to construct a URL
      return new URL(value).href;
    } catch {
      return null;
    }
  },
  extractDomain: (value: string) => {
    try {
      const url = value.startsWith('http') ? value : `https://${value}`;
      return new URL(url).hostname;
    } catch {
      return null;
    }
  },
  removeHtml: (value: string) => {
    return value.replace(/<[^>]*>/g, '').trim();
  },
};

/**
 * Transform a value using a transformer function or name
 */
export function transformValue(
  value: string,
  transform?: string | ((value: string) => any)
): any {
  if (!transform) {
    return value;
  }

  try {
    if (typeof transform === 'function') {
      return transform(value);
    }

    if (typeof transform === 'string') {
      const transformer = Transformers[transform];
      if (transformer) {
        return transformer(value);
      }
      console.warn(`Unknown transformer: ${transform}`);
      return value;
    }

    return value;
  } catch (error) {
    console.error(`Error transforming value "${value}":`, error);
    return value;
  }
}

/**
 * Apply transformations to an array of values
 */
export function applyTransformations(
  values: string[],
  transform?: string | ((value: string) => any)
): any[] {
  if (!transform) {
    return values;
  }

  return values
    .map((value) => transformValue(value, transform))
    .filter((value) => value !== null && value !== undefined);
}

/**
 * Evaluate a rule and extract values
 */
export function evaluateRule(html: string, rule: ExtractionRule): string[] {
  let results: string[] = [];

  // Determine extraction method
  if (rule.selector) {
    results = extractBySelector(html, rule.selector, {
      attribute: rule.attribute,
      text: rule.text !== false,
    });
  } else if (rule.xpath) {
    results = extractByXPath(html, rule.xpath, {
      attribute: rule.attribute,
      text: rule.text !== false,
    });
  } else if (rule.regex) {
    // For regex, use text content
    const $ = cheerio.load(html);
    const text = $('body').text() || html;
    results = extractByRegex(text, rule.regex);
  }

  // Apply transformations
  if (rule.transform && results.length > 0) {
    results = applyTransformations(results, rule.transform) as string[];
  }

  // Filter out empty values
  results = results.filter((value) => value !== null && value !== undefined && value !== '');

  // Return single or multiple results
  if (!rule.multiple && results.length > 0) {
    return [results[0]];
  }

  return results;
}



