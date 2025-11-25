/**
 * Gemini AI Service
 * Google Generative AI integration for data extraction
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { env } from '../config/env';
import { IExtractedEntity, EntityType } from '../modules/scraper/scraper.types';

// Default model names to try in order of preference
const DEFAULT_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-1.0-pro',
];

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private cachedModels: string[] | null = null;

  constructor() {
    if (env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    }
  }

  /**
   * Check if Gemini is available
   */
  isAvailable(): boolean {
    return !!this.genAI && !!env.GEMINI_API_KEY;
  }

  /**
   * Get available model names (with caching)
   */
  private async getModelNames(): Promise<string[]> {
    if (this.cachedModels) {
      return this.cachedModels;
    }

    if (!env.GEMINI_API_KEY) {
      return DEFAULT_MODELS;
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${env.GEMINI_API_KEY}`
      );

      if (!response.ok) {
        console.error(`Failed to list models: ${response.status} ${response.statusText}`);
        return DEFAULT_MODELS;
      }

      const data = await response.json();
      const modelNames = (data.models || [])
        .map((model: any) => model.name?.replace('models/', '') || model.name)
        .filter((name: string) => name && name.includes('gemini'));

      if (modelNames.length > 0) {
        this.cachedModels = modelNames;
        console.log('Available Gemini models:', modelNames);
        return modelNames;
      }
    } catch (error) {
      console.error('Error listing models via API:', error);
    }

    return DEFAULT_MODELS;
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute a function with model fallback and retry for 503 errors
   */
  private async executeWithModelFallback<T>(
    executor: (model: GenerativeModel, modelName: string) => Promise<T>
  ): Promise<T> {
    if (!this.genAI) {
      throw new Error('Gemini API not initialized');
    }

    const modelNames = await this.getModelNames();
    let lastError: any = null;
    const maxRetries = 3;

    for (const modelName of modelNames) {
      const cleanModelName = modelName.replace(/^models\//, '');
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const model = this.genAI.getGenerativeModel({ model: cleanModelName });
          const result = await executor(model, cleanModelName);
          console.log(`✅ Successfully used Gemini model: ${cleanModelName}`);
          return result;
        } catch (error: any) {
          lastError = error;
          
          // Handle 503 Service Unavailable (overloaded) with retry
          if (error.message?.includes('503') || error.message?.includes('overloaded')) {
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`⏳ Model ${cleanModelName} overloaded, retry ${attempt}/${maxRetries} in ${delay/1000}s...`);
            await this.sleep(delay);
            continue;
          }
          
          // Handle 429 Rate Limit with retry
          if (error.message?.includes('429') || error.message?.includes('rate limit')) {
            const delay = Math.pow(2, attempt) * 2000; // 4s, 8s, 16s
            console.log(`⏳ Rate limited on ${cleanModelName}, retry ${attempt}/${maxRetries} in ${delay/1000}s...`);
            await this.sleep(delay);
            continue;
          }
          
          // Handle 404 Not Found - try next model
          if (error.message?.includes('404') || error.message?.includes('not found')) {
            console.log(`❌ Model ${cleanModelName} not available, trying next...`);
            break; // Try next model
          }
          
          // For other errors, throw immediately
          throw error;
        }
      }
    }

    throw new Error(
      `Gemini API failed after retries. Last error: ${lastError?.message || 'Unknown error'}. ` +
      `Tried models: ${modelNames.join(', ')}. Please try again later.`
    );
  }

  /**
   * Extract structured data from HTML/text using Gemini
   */
  async extractData(
    content: string,
    taskDescription: string,
    entityTypes?: EntityType[]
  ): Promise<{
    entities: IExtractedEntity[];
    summary: string;
    success: boolean;
    error?: string;
    modelName?: string;
  }> {
    if (!this.isAvailable()) {
      return {
        entities: [],
        summary: '',
        success: false,
        error: 'Gemini API key not configured',
      };
    }

    try {
      const prompt = this.buildExtractionPrompt(content, taskDescription, entityTypes);

      const { text, modelName } = await this.executeWithModelFallback(async (model, name) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return { text: response.text(), modelName: name };
      });

      const parsed = this.parseGeminiResponse(text);

      return {
        entities: parsed.entities || [],
        summary: parsed.summary || '',
        success: true,
        modelName,
      };
    } catch (error: any) {
      console.error('Gemini extraction error:', error);
      return {
        entities: [],
        summary: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Build extraction prompt for Gemini
   */
  private buildExtractionPrompt(
    content: string,
    taskDescription: string,
    entityTypes?: EntityType[]
  ): string {
    const entityTypesText = entityTypes?.length
      ? `Focus on extracting these types: ${entityTypes.join(', ')}`
      : 'Extract any relevant structured data';

    return `
You are an AI data extraction specialist. Analyze the following web content and extract structured information.

TASK: ${taskDescription || 'Extract relevant information from this web page'}

INSTRUCTIONS:
- ${entityTypesText}
- Return valid JSON only
- Be accurate and concise
- Include confidence scores (0-1)

CONTENT TO ANALYZE:
${content.substring(0, 8000)} ${content.length > 8000 ? '...[truncated]' : ''}

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
   * Parse Gemini response and extract structured data
   */
  private parseGeminiResponse(text: string): {
    entities: IExtractedEntity[];
    summary: string;
  } {
    try {
      let cleanText = text.trim();
      cleanText = cleanText.replace(/```json\s*/g, '').replace(/```\s*$/g, '');

      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        entities: parsed.entities || [],
        summary: parsed.summary || '',
      };
    } catch (error) {
      console.error('Failed to parse Gemini response:', error);
      return {
        entities: [],
        summary: text.substring(0, 500),
      };
    }
  }

  /**
   * Chat with Gemini about the scraped content
   */
  async chat(
    context: string,
    history: { role: 'user' | 'assistant' | 'system'; content: string }[],
    newMessage: string
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('Gemini API key not configured');
    }

    const systemPrompt = `
You are a helpful AI assistant analyzing web content.
Use the following scraped content as your knowledge base to answer the user's questions.

CRITICAL INSTRUCTIONS:
- Extract and return the EXACT information requested by the user
- If asked for specific data (like team names, prices, companies, etc.), provide a clear, structured list
- Be THOROUGH - extract ALL instances, not just a few examples
- Format lists clearly with bullet points or numbered lists
- If extracting names, titles, or similar items, list them one per line or in a clear list format
- If the answer is not in the content, clearly state that
- When extracting multiple items (like "all team names"), you MUST list ALL of them, not just a few
- Be precise and accurate - don't make up information that isn't in the content

CONTEXT:
${context.substring(0, 15000)} ${context.length > 15000 ? '...[truncated]' : ''}
`;

    const chatHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: msg.content }],
    }));

    try {
      return await this.executeWithModelFallback(async (model) => {
        const chat = model.startChat({
          history: [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'I understand. I am ready to answer questions about the provided content.' }] },
            ...chatHistory,
          ],
          generationConfig: {
            maxOutputTokens: 2000,
          },
        });

        const result = await chat.sendMessage(newMessage);
        const response = await result.response;
        return response.text();
      });
    } catch (error: any) {
      console.error('Gemini chat error:', error);
      throw new Error(`Chat failed: ${error.message}`);
    }
  }

  /**
   * Generate a summary of scraped content
   */
  async generateSummary(content: string, maxLength: number = 200): Promise<string> {
    if (!this.isAvailable()) {
      return content.substring(0, maxLength) + '...';
    }

    try {
      const prompt = `
Summarize the following web content in ${maxLength} characters or less. Be concise and focus on the main points:

${content.substring(0, 4000)}

Summary:`;

      const text = await this.executeWithModelFallback(async (model) => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });

      const summary = text.trim();
      return summary.length > maxLength
        ? summary.substring(0, maxLength) + '...'
        : summary;
    } catch (error) {
      console.error('Gemini summary error:', error);
      return content.substring(0, maxLength) + '...';
    }
  }
}

export const geminiService = new GeminiService();
