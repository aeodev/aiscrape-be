/**
 * Content Quality Validator
 * Uses AI to determine if scraped content is sufficient to answer the user's question
 * 
 * @deprecated Use enhanced validator from '../../../lib/validation' instead
 * This file maintains backward compatibility
 */

import { geminiService } from '../../../lib/gemini';
import { contentValidator, ValidationContext, EnhancedValidationResult } from '../../../lib/validation';
import { ContentValidationResult } from '../../../lib/validation/content-validator.types';

// Re-export types for backward compatibility
export type { ContentValidationResult };

/**
 * Validate if scraped content can answer the user's question
 * 
 * @deprecated Use enhanced validator: contentValidator.validate() instead
 * This function maintains backward compatibility by wrapping the enhanced validator
 */
export async function validateContent(
  scrapedContent: string,
  userQuestion: string,
  pageTitle?: string
): Promise<ContentValidationResult> {
  // Use enhanced validator
  const context: ValidationContext = {
    html: scrapedContent,
    text: scrapedContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    markdown: '',
    url: '',
    taskDescription: userQuestion,
    pageTitle,
  };

  try {
    const result = await contentValidator.validateWithCache(context);
    
    // Convert to legacy format
    return {
      sufficient: result.sufficient,
      reason: result.reason,
      needsInteraction: result.needsInteraction,
      suggestedActions: result.suggestedActions,
    };
  } catch (error: any) {
    console.error('Content validation error:', error.message);
    
    // Fallback to basic check
    return {
      sufficient: scrapedContent.length > 100,
      reason: 'Validation failed, using basic check',
      needsInteraction: scrapedContent.length < 100,
    };
  }
}

/**
 * Quick heuristic check for dynamic content (no AI call)
 */
export function quickDynamicCheck(html: string, text: string): boolean {
  const indicators = [
    // Empty data containers
    /<table[^>]*>[\s\n]*(<thead[^>]*>.*?<\/thead>)?[\s\n]*<tbody[^>]*>[\s\n]*<\/tbody>/is,
    /<ul[^>]*>[\s\n]*<\/ul>/is,
    /<div[^>]*class="[^"]*data[^"]*"[^>]*>[\s\n]*<\/div>/is,
    
    // AJAX loading indicators
    /data-load/i,
    /onclick.*load/i,
    /ajax.*true/i,
  ];

  const textIndicators = [
    /select.*to view/i,
    /click.*to load/i,
    /choose.*year/i,
    /loading\.\.\./i,
  ];

  const hasHtmlIndicator = indicators.some(pattern => pattern.test(html));
  const hasTextIndicator = textIndicators.some(pattern => pattern.test(text));

  return hasHtmlIndicator || hasTextIndicator;
}





