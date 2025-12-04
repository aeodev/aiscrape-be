/**
 * Gemini Strategy Tests
 * Unit tests for GeminiLLMStrategy
 */

import { GeminiLLMStrategy } from '../gemini.strategy';
import { ExtractionContext, ExtractionStrategyType } from '../../extraction.types';
import { geminiService } from '../../../gemini';
import { EntityType } from '../../../../modules/scraper/scraper.types';
import { testExtractionContext } from '../../../../__tests__/helpers/fixtures';

// Mock Gemini service
jest.mock('../../../gemini', () => ({
  geminiService: {
    isAvailable: jest.fn(),
    extractData: jest.fn(),
  },
}));

describe('GeminiLLMStrategy', () => {
  let strategy: GeminiLLMStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new GeminiLLMStrategy();
  });

  describe('isAvailable', () => {
    it('should return true when Gemini service is available', () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      expect(strategy.isAvailable()).toBe(true);
    });

    it('should return false when Gemini service is not available', () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(false);
      expect(strategy.isAvailable()).toBe(false);
    });
  });

  describe('extract', () => {
    it('should extract entities successfully', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.extractData as jest.Mock).mockResolvedValue({
        success: true,
        entities: [
          {
            type: 'article' as any,
            data: { text: 'Extracted entity' },
            confidence: 0.9,
          },
        ],
        summary: 'Test summary',
        modelName: 'gemini-pro',
      });

      const result = await strategy.extract(testExtractionContext);

      expect(result.success).toBe(true);
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.strategy).toBe(ExtractionStrategyType.LLM);
      expect(geminiService.extractData).toHaveBeenCalled();
    });

    it('should return error when Gemini service is not available', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(false);

      const result = await strategy.extract(testExtractionContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
      expect(geminiService.extractData).not.toHaveBeenCalled();
    });

    it('should handle extraction failure', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.extractData as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Extraction failed',
      });

      const result = await strategy.extract(testExtractionContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle API errors', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.extractData as jest.Mock).mockRejectedValue(new Error('API error'));

      const result = await strategy.extract(testExtractionContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should pass entity types to Gemini service', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.extractData as jest.Mock).mockResolvedValue({
        success: true,
        entities: [],
        summary: '',
        modelName: 'gemini-pro',
      });

      const context: ExtractionContext = {
        ...testExtractionContext,
        entityTypes: [EntityType.CONTACT, EntityType.PRODUCT],
      };

      await strategy.extract(context);

      expect(geminiService.extractData).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        [EntityType.CONTACT, EntityType.PRODUCT]
      );
    });

    it('should use task description from context', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.extractData as jest.Mock).mockResolvedValue({
        success: true,
        entities: [],
        summary: '',
        modelName: 'gemini-pro',
      });

      const context: ExtractionContext = {
        ...testExtractionContext,
        taskDescription: 'Extract contact information',
      };

      await strategy.extract(context);

      expect(geminiService.extractData).toHaveBeenCalledWith(
        expect.any(String),
        'Extract contact information',
        undefined
      );
    });

    it('should track execution time', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.extractData as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          success: true,
          entities: [],
          summary: '',
          modelName: 'gemini-pro',
        }), 10))
      );

      const result = await strategy.extract(testExtractionContext);

      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should include confidence score when available', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.extractData as jest.Mock).mockResolvedValue({
        success: true,
        entities: [
          {
            type: 'article' as any,
            data: { text: 'Entity' },
            confidence: 0.95,
          },
        ],
        summary: 'Summary',
        modelName: 'gemini-pro',
      });

      const result = await strategy.extract(testExtractionContext);

      expect(result.confidence).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.extractData as jest.Mock).mockResolvedValue({
        success: true,
        entities: [],
        summary: '',
        modelName: 'gemini-pro',
      });

      const context: ExtractionContext = {
        html: '',
        markdown: '',
        text: '',
        url: 'https://example.com',
      };

      const result = await strategy.extract(context);

      expect(result.success).toBe(true);
    });

    it('should handle missing task description', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.extractData as jest.Mock).mockResolvedValue({
        success: true,
        entities: [],
        summary: '',
        modelName: 'gemini-pro',
      });

      const context: ExtractionContext = {
        ...testExtractionContext,
        taskDescription: undefined,
      };

      await strategy.extract(context);

      expect(geminiService.extractData).toHaveBeenCalled();
    });
  });
});

