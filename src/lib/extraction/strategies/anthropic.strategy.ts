/**
 * Anthropic LLM Strategy
 * Uses Anthropic API for extraction
 */

import { BaseLLMStrategy } from './llm-base.strategy';
import { ExtractionStrategyType } from '../extraction.types';
import { env } from '../../../config/env';

let anthropicClient: any = null;

/**
 * Lazy load Anthropic client
 */
async function getAnthropicClient() {
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }

  if (anthropicClient) {
    return anthropicClient;
  }

  try {
    // Dynamic import to avoid requiring the package if not installed
    const Anthropic = await import('@anthropic-ai/sdk');
    anthropicClient = new Anthropic.default({
      apiKey: env.ANTHROPIC_API_KEY,
    });
    return anthropicClient;
  } catch (error) {
    console.warn('Anthropic package not installed. Install with: npm install @anthropic-ai/sdk');
    return null;
  }
}

export class AnthropicLLMStrategy extends BaseLLMStrategy {
  name = 'Anthropic';
  type = ExtractionStrategyType.LLM;

  /**
   * Check if Anthropic provider is available
   */
  protected isProviderAvailable(): boolean {
    return !!env.ANTHROPIC_API_KEY;
  }

  /**
   * Get maximum content length for Anthropic
   */
  protected getMaxContentLength(): number {
    // Claude 3.5 Sonnet has 200k context, but we'll use a safe limit
    return 150000; // ~150k characters
  }

  /**
   * Call Anthropic LLM
   */
  protected async callLLM(prompt: string): Promise<{ text: string; modelName?: string }> {
    const client = await getAnthropicClient();
    if (!client) {
      throw new Error('Anthropic client not available. Install with: npm install @anthropic-ai/sdk');
    }

    const model = env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 2000,
        system:
          'You are an AI data extraction specialist. Extract structured data from web content and return valid JSON only. Your response must be valid JSON.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      if (!text) {
        throw new Error('Empty response from Anthropic');
      }

      return {
        text,
        modelName: model,
      };
    } catch (error: any) {
      // Handle rate limits
      if (error.status === 429 || error.message?.includes('rate limit')) {
        throw new Error('Anthropic rate limit exceeded. Please try again later.');
      }

      // Handle API errors
      if (error.status === 401) {
        throw new Error('Anthropic API key is invalid');
      }

      throw new Error(`Anthropic API error: ${error.message || 'Unknown error'}`);
    }
  }
}


