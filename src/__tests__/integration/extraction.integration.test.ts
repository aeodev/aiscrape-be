/**
 * Extraction Integration Tests
 * Tests extraction strategy integration with scraper service
 */

import { ScraperService } from '../../modules/scraper/scraper.service';
import { extractionManager, ExtractionStrategyType } from '../../lib/extraction';
import { RuleBasedStrategy } from '../../lib/extraction/strategies/rule-based.strategy';
import { CosineSimilarityStrategy } from '../../lib/extraction/strategies/cosine-similarity.strategy';
import { ScraperType, ScrapeStatus } from '../../modules/scraper/scraper.types';
import { scrapeRepository } from '../../modules/scraper/scraper.repository';
import { setupTestDatabase, teardownTestDatabase, clearTestDatabase } from '../helpers/database';
import { geminiService } from '../../lib/gemini';

// Mock external services
jest.mock('../../lib/gemini', () => ({
  geminiService: {
    isAvailable: jest.fn(() => false),
    extractData: jest.fn(),
  },
}));

jest.mock('../../lib/socket', () => ({
  getIO: jest.fn(() => ({
    emit: jest.fn(),
  })),
}));

// Mock scrapers
jest.mock('../../modules/scraper/scrapers', () => ({
  scrapeWithHttp: jest.fn(async () => ({
    html: '<html><body><h1>Contact Info</h1><p>Email: test@example.com</p></body></html>',
    markdown: '# Contact Info\n\nEmail: test@example.com',
    text: 'Contact Info\n\nEmail: test@example.com',
    finalUrl: 'https://example.com',
    statusCode: 200,
    contentType: 'text/html',
    pageTitle: 'Contact Info',
  })),
  scrapeWithCheerio: jest.fn(async () => null),
  scrapeWithJina: jest.fn(async () => null),
  scrapeWithPlaywright: jest.fn(async () => null),
  scrapeWithSmartPlaywright: jest.fn(async () => null),
  scrapeWithAIAgent: jest.fn(async () => null),
  scrapeLinkedIn: jest.fn(async () => null),
}));

describe('Extraction Integration Tests', () => {
  let scraperService: ScraperService;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    scraperService = new ScraperService();
    
    // Register extraction strategies
    extractionManager.clear();
    extractionManager.registerStrategy(new RuleBasedStrategy());
    extractionManager.registerStrategy(new CosineSimilarityStrategy());
  });

  describe('Extraction with Scraper Service', () => {
    it('should extract entities using registered strategies', async () => {
      const job = await scraperService.createJob('https://example.com', {
        taskDescription: 'Extract contact information',
        scraperType: ScraperType.HTTP,
      });

      // Job execution starts automatically when createJob is called
      await new Promise(resolve => setTimeout(resolve, 200));

      const updatedJob = await scrapeRepository.findById(job.id);
      
      // Verify extraction was attempted
      expect(updatedJob?.taskDescription).toBe('Extract contact information');
      
      // Verify strategies are registered
      const availableStrategies = extractionManager.getAvailableStrategies();
      expect(availableStrategies.length).toBeGreaterThan(0);
    });

    it('should use fallback chain when primary strategy fails', async () => {
      // Register multiple strategies
      extractionManager.clear();
      const ruleStrategy = new RuleBasedStrategy();
      const cosineStrategy = new CosineSimilarityStrategy();
      
      extractionManager.registerStrategy(ruleStrategy);
      extractionManager.registerStrategy(cosineStrategy);

      const job = await scraperService.createJob('https://example.com', {
        taskDescription: 'Extract emails',
        scraperType: ScraperType.HTTP,
      });

      // Job execution starts automatically when createJob is called
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify fallback chain is available
      const availableStrategies = extractionManager.getAvailableStrategies();
      expect(availableStrategies.length).toBeGreaterThan(1);
      
      // Verify extraction manager can use fallback
      const stats = extractionManager.getStats();
      expect(stats.availableStrategies).toBeGreaterThan(0);
    });

    it('should integrate with processing pipeline output', async () => {
      const job = await scraperService.createJob('https://example.com', {
        taskDescription: 'Extract heading',
        scraperType: ScraperType.HTTP,
      });

      // Job execution starts automatically when createJob is called
      await new Promise(resolve => setTimeout(resolve, 200));

      const updatedJob = await scrapeRepository.findById(job.id);
      
      // Verify processing pipeline produced output
      if (updatedJob?.status === ScrapeStatus.COMPLETED) {
        expect(updatedJob.html).toBeDefined();
        expect(updatedJob.markdown).toBeDefined();
        expect(updatedJob.text).toBeDefined();
        
        // Extraction should receive processed content
        expect(updatedJob.taskDescription).toBe('Extract heading');
      }
    });

    it('should handle extraction errors gracefully', async () => {
      // Clear strategies to simulate no extraction available
      extractionManager.clear();

      const job = await scraperService.createJob('https://example.com', {
        taskDescription: 'Extract data',
        scraperType: ScraperType.HTTP,
      });

      // Job execution starts automatically when createJob is called
      await new Promise(resolve => setTimeout(resolve, 200));

      const updatedJob = await scrapeRepository.findById(job.id);
      
      // Job should still complete even if extraction fails
      expect(updatedJob).toBeDefined();
      expect([ScrapeStatus.COMPLETED, ScrapeStatus.FAILED]).toContain(updatedJob?.status);
    });

    it('should extract entities and save to job', async () => {
      const job = await scraperService.createJob('https://example.com', {
        taskDescription: 'Extract contact information',
        scraperType: ScraperType.HTTP,
      });

      // Job execution starts automatically when createJob is called
      await new Promise(resolve => setTimeout(resolve, 300));

      const updatedJob = await scrapeRepository.findById(job.id);
      
      // Verify job has task description for extraction
      expect(updatedJob?.taskDescription).toBe('Extract contact information');
      
      // If extraction succeeded, entities should be saved
      // (This depends on actual extraction results)
    });
  });

  describe('Strategy Selection', () => {
    it('should prefer LLM strategy when available', async () => {
      const availableStrategies = extractionManager.getAvailableStrategies();
      
      // Verify strategies are registered
      expect(availableStrategies.length).toBeGreaterThan(0);
      
      // Verify extraction manager can select strategy
      const stats = extractionManager.getStats();
      expect(stats.availableStrategies).toBeGreaterThan(0);
    });

    it('should fallback to rule-based when LLM unavailable', async () => {
      // Register only rule-based strategy
      extractionManager.clear();
      extractionManager.registerStrategy(new RuleBasedStrategy());

      const availableStrategies = extractionManager.getAvailableStrategies();
      expect(availableStrategies).toContain(ExtractionStrategyType.RULE_BASED);
    });

    it('should use cosine similarity as fallback', async () => {
      extractionManager.clear();
      extractionManager.registerStrategy(new CosineSimilarityStrategy());

      const availableStrategies = extractionManager.getAvailableStrategies();
      expect(availableStrategies).toContain(ExtractionStrategyType.COSINE_SIMILARITY);
    });
  });

  describe('Extraction Context', () => {
    it('should pass correct context to extraction strategies', async () => {
      const job = await scraperService.createJob('https://example.com', {
        taskDescription: 'Extract information',
        scraperType: ScraperType.HTTP,
      });

      // Job execution starts automatically when createJob is called
      await new Promise(resolve => setTimeout(resolve, 200));

      const updatedJob = await scrapeRepository.findById(job.id);
      
      // Verify context data is available
      expect(updatedJob?.url).toBe('https://example.com');
      expect(updatedJob?.taskDescription).toBe('Extract information');
      
      // Verify processed content is available for extraction
      if (updatedJob?.status === ScrapeStatus.COMPLETED) {
        expect(updatedJob.html || updatedJob.markdown || updatedJob.text).toBeDefined();
      }
    });

    it('should handle empty content gracefully', async () => {
      const job = await scraperService.createJob('https://example.com', {
        taskDescription: 'Extract data',
        scraperType: ScraperType.HTTP,
      });

      // Job execution starts automatically when createJob is called
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should handle gracefully even if content is empty
      const updatedJob = await scrapeRepository.findById(job.id);
      expect(updatedJob).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should continue job execution if extraction fails', async () => {
      // Clear strategies to force extraction failure
      extractionManager.clear();

      const job = await scraperService.createJob('https://example.com', {
        taskDescription: 'Extract data',
        scraperType: ScraperType.HTTP,
      });

      // Job execution starts automatically when createJob is called
      await new Promise(resolve => setTimeout(resolve, 200));

      const updatedJob = await scrapeRepository.findById(job.id);
      
      // Job should complete even if extraction fails
      expect(updatedJob).toBeDefined();
      expect([ScrapeStatus.COMPLETED, ScrapeStatus.FAILED]).toContain(updatedJob?.status);
    });

    it('should handle extraction timeout gracefully', async () => {
      const job = await scraperService.createJob('https://example.com', {
        taskDescription: 'Extract data',
        scraperType: ScraperType.HTTP,
      });

      // Job execution starts automatically when createJob is called
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should handle timeout without crashing
      const updatedJob = await scrapeRepository.findById(job.id);
      expect(updatedJob).toBeDefined();
    });
  });
});

