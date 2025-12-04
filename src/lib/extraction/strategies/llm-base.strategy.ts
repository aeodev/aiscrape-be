/**
 * Base LLM Strategy
 * Abstract base class for LLM-based extraction strategies
 */

import { BaseExtractionStrategy } from '../extraction.strategy';
import {
  ExtractionStrategyType,
  ExtractionContext,
  ExtractionResult,
} from '../extraction.types';
import { IExtractedEntity, EntityType } from '../../../modules/scraper/scraper.types';

/**
 * Base LLM strategy with common functionality
 */
export abstract class BaseLLMStrategy extends BaseExtractionStrategy {
  abstract type: ExtractionStrategyType;
  abstract name: string;

  /**
   * Provider-specific LLM call
   */
  protected abstract callLLM(prompt: string): Promise<{ text: string; modelName?: string }>;

  /**
   * Check if provider API is available
   */
  protected abstract isProviderAvailable(): boolean;

  /**
   * Get maximum content length for this provider (in characters)
   */
  protected getMaxContentLength(): number {
    return 8000; // Default safe limit
  }

  /**
   * Check if strategy is available
   */
  isAvailable(): boolean {
    return this.isProviderAvailable();
  }

  /**
   * Extract entities from context using LLM
   */
  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();

    if (!this.isProviderAvailable()) {
      return this.createErrorResult(
        `${this.name} API key not configured`,
        Date.now() - startTime
      );
    }

    try {
      // Build extraction prompt
      const prompt = this.buildExtractionPrompt(context);

      // Call LLM
      const { text, modelName } = await this.callLLM(prompt);

      // Parse response
      const parsed = this.parseLLMResponse(text);

      // Create success result
      return this.createSuccessResult(
        parsed.entities || [],
        Date.now() - startTime,
        {
          modelName: modelName || 'unknown',
          summary: parsed.summary || '',
          explanation: parsed.explanation,
          rawResponse: text.substring(0, 500), // Store first 500 chars for debugging
        }
      );
    } catch (error: any) {
      console.error(`${this.name} extraction error:`, error);
      return this.createErrorResult(
        error.message || 'Unknown error during LLM extraction',
        Date.now() - startTime
      );
    }
  }

  /**
   * Build extraction prompt from context
   */
  protected buildExtractionPrompt(context: ExtractionContext): string {
    const entityTypesText = context.entityTypes?.length
      ? `Focus on extracting these types: ${context.entityTypes.join(', ')}`
      : 'Extract any relevant structured data';

    // Prefer text, fallback to markdown, then HTML
    const content = context.text || context.markdown || context.html;
    const maxLength = this.getMaxContentLength();
    const truncatedContent =
      content.length > maxLength
        ? content.substring(0, maxLength) + '...[truncated]'
        : content;

    // Detect if task asks for explanation or details
    const taskLower = (context.taskDescription || '').toLowerCase();
    const wantsExplanation = taskLower.includes('explain') || 
                            taskLower.includes('explanation') ||
                            taskLower.includes('details') ||
                            taskLower.includes('detail') ||
                            taskLower.includes('describe') ||
                            taskLower.includes('what');

    const summaryInstruction = wantsExplanation
      ? 'Provide a comprehensive, detailed explanation of the page content. Include all important details, context, and explanations.'
      : 'Brief summary of the page content';

    const extractionInstruction = wantsExplanation
      ? `- Extract all relevant information and provide detailed explanations
- Include comprehensive details in entity data fields
- Explain what each piece of information means and its context
- Be thorough and descriptive rather than concise`
      : `- Extract all relevant entities from the content
- Be accurate and concise`;

    // Detect commerce/e-commerce sites
    const isCommerceSite = context.url.includes('shopee') || 
                           context.url.includes('amazon') ||
                           context.url.includes('ebay') ||
                           context.url.includes('commerce') ||
                           context.url.includes('product') ||
                           context.url.includes('store') ||
                           context.url.includes('buy') ||
                           context.url.includes('cart');

    const commerceInstructions = isCommerceSite
      ? `- IMPORTANT: Extract product prices from the content, including:
     * Current price (check "Captured API Data" section if present - prices are often in JSON API responses)
     * Original/discounted prices if available
     * Currency symbol (₱, $, €, £, ¥, ₹, etc.)
     * Price variations (if multiple options/variants)
     * Look for prices in JSON API responses under "--- Captured API Data ---" section
     * Extract pricing as PRICING entity type with full details (price, currency, originalPrice, discount, etc.)`
      : '';

    return `
You are an AI data extraction specialist. Analyze the following web content and extract structured information.

TASK: ${context.taskDescription || 'Extract relevant information from this web page'}

URL: ${context.url}

INSTRUCTIONS:
- ${entityTypesText}
- ${extractionInstruction}
${commerceInstructions ? `- ${commerceInstructions}` : ''}
- Return valid JSON only
- Include confidence scores (0-1)
- When extracting entities, include all relevant details and properties

CONTENT TO ANALYZE:
${truncatedContent}

RESPONSE FORMAT (JSON only):
{
  "summary": "${summaryInstruction}",
  ${wantsExplanation ? `"explanation": "Detailed explanation of the content, its meaning, and important context",` : ''}
  "entities": [
    {
      "type": "company|person|product|article|contact|pricing|custom",
      "data": {
        // Relevant extracted data based on type - include all important details and properties
        // For products: name, description, features, specifications, price, currency, etc.
        // For pricing: price, currency, originalPrice, discount, priceRange, etc.
        // For people: name, role, bio, achievements, etc.
        // For companies: name, description, services, contact info, etc.
        // Include comprehensive details when task asks for explanation
      },
      "confidence": 0.95,
      "source": "Brief description of where this was found"
    }
  ]
}

JSON Response:`;
  }

  /**
   * Parse LLM response and extract structured data
   */
  protected parseLLMResponse(text: string): {
    entities: IExtractedEntity[];
    summary: string;
    explanation?: string;
  } {
    try {
      let cleanText = text.trim();

      // Remove markdown code blocks
      cleanText = cleanText.replace(/```json\s*/g, '').replace(/```\s*$/g, '');

      // Extract JSON from response
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize entities
      const entities: IExtractedEntity[] = (parsed.entities || []).map((entity: any) => ({
        type: this.normalizeEntityType(entity.type),
        data: entity.data || {},
        confidence: this.normalizeConfidence(entity.confidence),
        source: entity.source || '',
      }));

      // Combine summary and explanation if explanation exists
      let summary = parsed.summary || '';
      if (parsed.explanation) {
        summary = summary 
          ? `${summary}\n\n${parsed.explanation}`
          : parsed.explanation;
      }

      return {
        entities,
        summary,
        explanation: parsed.explanation,
      };
    } catch (error) {
      console.error(`Failed to parse ${this.name} response:`, error);
      // Return empty entities but preserve summary if possible
      return {
        entities: [],
        summary: text.substring(0, 500),
      };
    }
  }

  /**
   * Normalize entity type to valid EntityType enum
   */
  protected normalizeEntityType(type: any): EntityType {
    if (typeof type !== 'string') {
      return EntityType.CUSTOM;
    }

    const normalized = type.toLowerCase().trim();
    const validTypes = Object.values(EntityType);

    if (validTypes.includes(normalized as EntityType)) {
      return normalized as EntityType;
    }

    return EntityType.CUSTOM;
  }

  /**
   * Normalize confidence score to 0-1 range
   */
  protected normalizeConfidence(confidence: any): number {
    if (typeof confidence === 'number') {
      return Math.max(0, Math.min(1, confidence));
    }

    if (typeof confidence === 'string') {
      const parsed = parseFloat(confidence);
      if (!isNaN(parsed)) {
        return Math.max(0, Math.min(1, parsed));
      }
    }

    return 0.5; // Default confidence
  }
}


