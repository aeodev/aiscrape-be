/**
 * HTML to Markdown converter
 * Enhanced converter using Turndown with GFM support
 * Maintains backward compatibility with existing code
 */

import { htmlToMarkdown as enhancedHtmlToMarkdown } from '../../../lib/processing/markdown.processor';

// Use any for $ to support different Cheerio versions from Crawlee and standalone
type CheerioFunction = any;
type CheerioSelection = any;

/**
 * Enhanced HTML to Markdown converter using Turndown
 * Supports tables, code blocks, images, and GitHub Flavored Markdown
 */
export function htmlToMarkdown($: CheerioFunction, element: CheerioSelection): string {
  try {
    // Use the enhanced markdown processor
    return enhancedHtmlToMarkdown($, element);
  } catch (error: any) {
    console.error('Enhanced markdown conversion failed, using fallback:', error.message);
    // Fallback to basic text extraction if enhanced conversion fails
    return element.text() || '';
  }
}
