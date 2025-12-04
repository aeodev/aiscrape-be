/**
 * Content Validation Utilities
 * Helper functions for content validation
 */

import { ValidationContext, ValidationMetrics } from './content-validator.types';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

/**
 * Get validation metrics from context
 */
export function getMetrics(context: ValidationContext): ValidationMetrics {
  const $ = cheerio.load(context.html);

  return {
    contentLength: context.html.length,
    htmlTags: $('*').length,
    textWords: context.text.split(/\s+/).filter((w) => w.length > 0).length,
    linkCount: $('a').length,
    imageCount: $('img').length,
    formCount: $('form').length,
    scriptCount: $('script').length,
    tableCount: $('table').length,
    listCount: $('ul, ol').length,
  };
}

/**
 * Generate content hash for caching
 */
export function generateContentHash(context: ValidationContext): string {
  const content = `${context.html}:${context.taskDescription || ''}:${context.url}`;
  return createHash('sha256').update(content).digest('hex');
}

