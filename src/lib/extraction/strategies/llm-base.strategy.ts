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

    return `
You are an AI data extraction specialist. Analyze the following web content and extract structured information.

TASK: ${context.taskDescription || 'Extract relevant information from this web page'}

URL: ${context.url}

INSTRUCTIONS:
- ${entityTypesText}
- Return valid JSON only
- Be accurate and concise
- Include confidence scores (0-1)
- Extract all relevant entities from the content

CONTENT TO ANALYZE:
${truncatedContent}

RESPONSE FORMAT (JSON only):
{
  "summary": "Brief summary of the page content",
  "entities": [
    {
      "type": "company|person|product|article|contact|pricing|custom",
      "data": {
        // Relevant extracted data based on type
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

      return {
        entities,
        summary: parsed.summary || '',
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


