/**
 * Gemini LLM Strategy
 * Wraps existing GeminiService for extraction
 */

import { BaseLLMStrategy } from './llm-base.strategy';
import { ExtractionStrategyType, ExtractionContext } from '../extraction.types';
import { geminiService } from '../../gemini';
import { EntityType } from '../../../modules/scraper/scraper.types';

export class GeminiLLMStrategy extends BaseLLMStrategy {
  name = 'Gemini';
  type = ExtractionStrategyType.LLM;

  /**
   * Check if Gemini provider is available
   */
  protected isProviderAvailable(): boolean {
    return geminiService.isAvailable();
  }

  /**
   * Call Gemini LLM
   */
  protected async callLLM(prompt: string): Promise<{ text: string; modelName?: string }> {
    // Use existing GeminiService.extractData() but we need to adapt it
    // Since extractData expects content and taskDescription separately,
    // we'll extract them from the prompt or use a different approach
    
    // For now, we'll use a simpler approach: call Gemini directly
    // But we need to adapt the existing service
    
    // Actually, let's use the existing extractData method by parsing the prompt
    // Extract task description and content from prompt
    const taskMatch = prompt.match(/TASK:\s*(.+?)\n/);
    const contentMatch = prompt.match(/CONTENT TO ANALYZE:\s*([\s\S]+?)\n\nRESPONSE FORMAT/);
    
    const taskDescription = taskMatch ? taskMatch[1].trim() : 'Extract relevant information';
    const content = contentMatch ? contentMatch[1].trim() : '';
    
    // Extract entity types if present
    const entityTypesMatch = prompt.match(/Focus on extracting these types:\s*(.+?)\n/);
    const entityTypes = entityTypesMatch
      ? entityTypesMatch[1].split(',').map(t => t.trim() as EntityType)
      : undefined;

    // Use existing GeminiService
    const result = await geminiService.extractData(content, taskDescription, entityTypes);

    if (!result.success) {
      throw new Error(result.error || 'Gemini extraction failed');
    }

    // Reconstruct JSON response format for parsing
    const jsonResponse = JSON.stringify({
      summary: result.summary,
      entities: result.entities,
    });

    return {
      text: jsonResponse,
      modelName: result.modelName,
    };
  }

  /**
   * Override extract to use GeminiService directly for better integration
   */
  async extract(context: ExtractionContext): Promise<import('../extraction.types').ExtractionResult> {
    const startTime = Date.now();

    if (!this.isProviderAvailable()) {
      return this.createErrorResult(
        'Gemini API key not configured',
        Date.now() - startTime
      );
    }

    try {
      // Use existing GeminiService.extractData() directly
      const result = await geminiService.extractData(
        context.text || context.markdown || context.html,
        context.taskDescription || 'Extract relevant information',
        context.entityTypes
      );

      if (!result.success) {
        return this.createErrorResult(
          result.error || 'Gemini extraction failed',
          Date.now() - startTime
        );
      }

      // Create success result
      return this.createSuccessResult(
        result.entities || [],
        Date.now() - startTime,
        {
          modelName: result.modelName || 'gemini-pro',
          summary: result.summary || '',
        }
      );
    } catch (error: any) {
      console.error('Gemini extraction error:', error);
      return this.createErrorResult(
        error.message || 'Unknown error during Gemini extraction',
        Date.now() - startTime
      );
    }
  }
}



