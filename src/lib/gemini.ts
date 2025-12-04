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

    // Detect if task asks for explanation or details
    const taskLower = (taskDescription || '').toLowerCase();
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

    // Detect commerce/e-commerce sites (check if URL or content suggests commerce)
    const isCommerceSite = taskDescription.toLowerCase().includes('price') ||
                           taskDescription.toLowerCase().includes('product') ||
                           taskDescription.toLowerCase().includes('buy') ||
                           content.toLowerCase().includes('price') ||
                           content.toLowerCase().includes('₱') ||
                           content.toLowerCase().includes('$') ||
                           content.toLowerCase().includes('add to cart');

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

TASK: ${taskDescription || 'Extract relevant information from this web page'}

INSTRUCTIONS:
- ${entityTypesText}
- ${extractionInstruction}
${commerceInstructions ? `- ${commerceInstructions}` : ''}
- Return valid JSON only
- Include confidence scores (0-1)
- When extracting entities, include all relevant details and properties

CONTENT TO ANALYZE:
${content.substring(0, 8000)} ${content.length > 8000 ? '...[truncated]' : ''}

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

      // Combine summary and explanation if explanation exists
      let summary = parsed.summary || '';
      if (parsed.explanation) {
        summary = summary 
          ? `${summary}\n\n${parsed.explanation}`
          : parsed.explanation;
      }

      return {
        entities: parsed.entities || [],
        summary,
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

    const lowerMessage = newMessage.toLowerCase()
    const isDealsQuery = lowerMessage.includes('deal') || lowerMessage.includes('product') || lowerMessage.includes('buy') || lowerMessage.includes('recommend')
    const isListQuery = lowerMessage.includes('list') || lowerMessage.includes('all') || lowerMessage.includes('every')
    
    const dealsInstructions = isDealsQuery ? `
SPECIAL INSTRUCTIONS FOR DEALS/PRODUCTS:
- Look for product names, titles, descriptions, prices, discounts, ratings, and images
- Extract product information even if it appears in cards, grids, lists, or dynamic sections
- If you see product data in JSON, HTML attributes, or structured formats, extract it
- For "top 5" or "recommend" requests, analyze products and provide recommendations with reasoning
- Include prices, discounts, ratings, and key features when available
- If deals are mentioned but not fully detailed, extract what IS available (names, prices, etc.)
` : ''

    const listInstructions = isListQuery ? `
SPECIAL INSTRUCTIONS FOR LISTING:
- Extract EVERY item requested, not just examples
- Look through ALL sections of the content, including:
  * Lists, tables, grids, cards
  * JSON data, data attributes, structured content
  * Dynamically loaded content that may appear later in the text
  * Repeated patterns that indicate multiple items
- Count items and verify you've extracted all of them
- If content seems incomplete, extract what IS available and note it
` : ''

    const systemPrompt = `
You are a helpful AI assistant analyzing web content.
Use the following scraped content as your knowledge base to answer the user's questions.

CRITICAL INSTRUCTIONS:
- Extract and return the EXACT information requested by the user
- If asked for specific data (like deals, products, prices, team names, companies, etc.), provide a clear, structured list
- Be THOROUGH - extract ALL instances, not just a few examples
- Format lists clearly with bullet points or numbered lists
- If extracting names, titles, products, or similar items, list them one per line or in a clear list format
- If the answer is not in the content, clearly state that - BUT first double-check:
  * Look for data in different formats (JSON, HTML attributes, structured data)
  * Check if content might be truncated - extract what IS visible
  * Look for patterns that indicate the requested data exists
- When extracting multiple items (like "all deals" or "all products"), you MUST extract ALL of them, not just a few
- Be precise and accurate - don't make up information that isn't in the content
${dealsInstructions}
${listInstructions}

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
