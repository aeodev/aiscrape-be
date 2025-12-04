/**
 * OpenAI LLM Strategy
 * Uses OpenAI API for extraction
 */

import { BaseLLMStrategy } from './llm-base.strategy';
import { ExtractionStrategyType } from '../extraction.types';
import { env } from '../../../config/env';

let openaiClient: any = null;

/**
 * Lazy load OpenAI client
 */
async function getOpenAIClient() {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  if (openaiClient) {
    return openaiClient;
  }

  try {
    // Dynamic import to avoid requiring the package if not installed
    const { default: OpenAI } = await import('openai');
    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    return openaiClient;
  } catch (error) {
    console.warn('OpenAI package not installed. Install with: npm install openai');
    return null;
  }
}

export class OpenAILLMStrategy extends BaseLLMStrategy {
  name = 'OpenAI';
  type = ExtractionStrategyType.LLM;

  /**
   * Check if OpenAI provider is available
   */
  protected isProviderAvailable(): boolean {
    return !!env.OPENAI_API_KEY;
  }

  /**
   * Get maximum content length for OpenAI
   */
  protected getMaxContentLength(): number {
    // GPT-4o-mini has 128k context, but we'll use a safe limit
    return 100000; // ~100k characters
  }

  /**
   * Call OpenAI LLM
   */
  protected async callLLM(prompt: string): Promise<{ text: string; modelName?: string }> {
    const client = await getOpenAIClient();
    if (!client) {
      throw new Error('OpenAI client not available. Install with: npm install openai');
    }

    const model = env.OPENAI_MODEL || 'gpt-4o-mini';

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an AI data extraction specialist. Extract structured data from web content and return valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000,
      });

      const text = response.choices[0]?.message?.content || '';
      if (!text) {
        throw new Error('Empty response from OpenAI');
      }

      return {
        text,
        modelName: model,
      };
    } catch (error: any) {
      // Handle rate limits
      if (error.status === 429 || error.message?.includes('rate limit')) {
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      }

      // Handle API errors
      if (error.status === 401) {
        throw new Error('OpenAI API key is invalid');
      }

      throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`);
    }
  }
}


