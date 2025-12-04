/**
 * Quality-First Orchestration Strategy
 * Prioritizes content quality: Smart Playwright → Jina → HTTP
 */

import { BaseOrchestrationStrategy } from '../orchestrator.strategy';
import {
  OrchestrationContext,
  OrchestrationResult,
  ScraperExecutionResult,
  OrchestrationStrategy,
} from '../orchestrator.types';
import { ScraperType } from '../../../modules/scraper/scraper.types';
import {
  scrapeWithSmartPlaywright,
  scrapeWithJina,
  scrapeWithHttp,
} from '../../../modules/scraper/scrapers';

export class QualityFirstStrategy extends BaseOrchestrationStrategy {
  getStrategyName(): string {
    return 'Quality-First';
  }

  getDescription(): string {
    return 'Prioritizes content quality: starts with best quality scrapers (Smart Playwright → Jina → HTTP)';
  }

  async execute(context: OrchestrationContext): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const attempts: ScraperExecutionResult[] = [];
    const userQuestion = context.taskDescription || 'Extract all relevant information';

    // Tier 1: Smart Playwright (best quality)
    this.emitProgress(context, 'Trying Tier 1 - Smart Playwright (best quality)...', 30);
    console.log(`Job ${context.jobId}: Trying Tier 1 - Smart Playwright (best quality)...`);

    const smartPlaywrightAttempt = await this.executeScraper(
      context,
      ScraperType.PLAYWRIGHT,
      () => scrapeWithSmartPlaywright(context.url, context.jobId, userQuestion, context.emitProgress)
    );
    attempts.push(smartPlaywrightAttempt);

    if (smartPlaywrightAttempt.success && smartPlaywrightAttempt.result) {
      // Validate quality
      const validation = await this.validateContent(context, smartPlaywrightAttempt.result);
      smartPlaywrightAttempt.qualityScore = validation.qualityScore;
      smartPlaywrightAttempt.validationReason = validation.reason;

      if (validation.qualityScore >= 0.7) {
        console.log(`Job ${context.jobId}: ✓ Smart Playwright completed with high quality`);
        return this.createSuccessResult(attempts, OrchestrationStrategy.QUALITY_FIRST, startTime);
      }
    }

    console.log(
      `Job ${context.jobId}: Smart Playwright failed or low quality, trying Jina Reader...`
    );

    // Tier 2: Jina Reader (good quality, fast)
    this.emitProgress(context, 'Trying Tier 2 - Jina Reader...', 50);
    console.log(`Job ${context.jobId}: Trying Tier 2 - Jina Reader...`);

    const jinaAttempt = await this.executeScraper(context, ScraperType.JINA, () =>
      scrapeWithJina(context.url, context.jobId, context.emitProgress)
    );
    attempts.push(jinaAttempt);

    if (jinaAttempt.success && jinaAttempt.result) {
      // Validate quality
      const validation = await this.validateContent(context, jinaAttempt.result);
      jinaAttempt.qualityScore = validation.qualityScore;
      jinaAttempt.validationReason = validation.reason;

      if (validation.qualityScore >= 0.6) {
        console.log(`Job ${context.jobId}: ✓ Jina Reader completed with good quality`);
        return this.createSuccessResult(attempts, OrchestrationStrategy.QUALITY_FIRST, startTime);
      }
    }

    console.log(`Job ${context.jobId}: Jina Reader failed or low quality, trying HTTP scraper...`);

    // Tier 3: HTTP scraper (fallback)
    this.emitProgress(context, 'Trying Tier 3 - HTTP scraper (fallback)...', 70);
    console.log(`Job ${context.jobId}: Trying Tier 3 - HTTP scraper (fallback)...`);

    const httpAttempt = await this.executeScraper(context, ScraperType.HTTP, () =>
      scrapeWithHttp(context.url, context.jobId, context.emitProgress)
    );
    attempts.push(httpAttempt);

    if (httpAttempt.success && httpAttempt.result) {
      console.log(`Job ${context.jobId}: ✓ HTTP scraper completed`);
      return this.createSuccessResult(attempts, OrchestrationStrategy.QUALITY_FIRST, startTime);
    }

    // All attempts failed - throw error
    const lastError = attempts[attempts.length - 1]?.error;
    throw new Error(
      `All scrapers failed. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }
}


