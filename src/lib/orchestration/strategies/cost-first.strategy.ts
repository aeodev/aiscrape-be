/**
 * Cost-First Orchestration Strategy
 * Minimizes resource usage: HTTP → Cheerio → Jina → Playwright (only if necessary)
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
  scrapeWithHttp,
  scrapeWithCheerio,
  scrapeWithJina,
  scrapeWithPlaywright,
} from '../../../modules/scraper/scrapers';

export class CostFirstStrategy extends BaseOrchestrationStrategy {
  getStrategyName(): string {
    return 'Cost-First';
  }

  getDescription(): string {
    return 'Minimizes resource usage: avoids expensive scrapers, only uses Playwright if absolutely necessary';
  }

  async execute(context: OrchestrationContext): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const attempts: ScraperExecutionResult[] = [];

    // Tier 1: HTTP scraper (cheapest, fastest)
    this.emitProgress(context, 'Trying Tier 1 - HTTP scraper (cheapest)...', 30);
    console.log(`Job ${context.jobId}: Trying Tier 1 - HTTP scraper (cheapest)...`);

    const httpAttempt = await this.executeScraper(context, ScraperType.HTTP, () =>
      scrapeWithHttp(context.url, context.jobId, context.emitProgress, context.options)
    );
    attempts.push(httpAttempt);

    if (httpAttempt.success && httpAttempt.result && this.isValidContent(httpAttempt.result)) {
      // Validate content quality
      const validation = await this.validateContent(context, httpAttempt.result);
      httpAttempt.qualityScore = validation.qualityScore;
      httpAttempt.validationReason = validation.reason;

      if (validation.sufficient) {
        console.log(`Job ${context.jobId}: ✓ HTTP scraper completed successfully`);
        return this.createSuccessResult(attempts, OrchestrationStrategy.COST_FIRST, startTime);
      }
    }

    console.log(`Job ${context.jobId}: HTTP scraper insufficient, trying Cheerio...`);

    // Tier 2: Cheerio scraper (lightweight)
    this.emitProgress(context, 'Trying Tier 2 - Cheerio scraper...', 45);
    console.log(`Job ${context.jobId}: Trying Tier 2 - Cheerio scraper...`);

    const cheerioAttempt = await this.executeScraper(context, ScraperType.CHEERIO, () =>
      scrapeWithCheerio(context.url, context.jobId, context.emitProgress, context.options)
    );
    attempts.push(cheerioAttempt);

    if (cheerioAttempt.success && cheerioAttempt.result && this.isValidContent(cheerioAttempt.result)) {
      const validation = await this.validateContent(context, cheerioAttempt.result);
      cheerioAttempt.qualityScore = validation.qualityScore;
      cheerioAttempt.validationReason = validation.reason;

      if (validation.sufficient) {
        console.log(`Job ${context.jobId}: ✓ Cheerio scraper completed successfully`);
        return this.createSuccessResult(attempts, OrchestrationStrategy.COST_FIRST, startTime);
      }
    }

    console.log(`Job ${context.jobId}: Cheerio scraper insufficient, trying Jina Reader...`);

    // Tier 3: Jina Reader (moderate cost)
    this.emitProgress(context, 'Trying Tier 3 - Jina Reader...', 60);
    console.log(`Job ${context.jobId}: Trying Tier 3 - Jina Reader...`);

    const jinaAttempt = await this.executeScraper(context, ScraperType.JINA, () =>
      scrapeWithJina(context.url, context.jobId, context.emitProgress, context.options)
    );
    attempts.push(jinaAttempt);

    if (jinaAttempt.success && jinaAttempt.result) {
      const validation = await this.validateContent(context, jinaAttempt.result);
      jinaAttempt.qualityScore = validation.qualityScore;
      jinaAttempt.validationReason = validation.reason;

      if (validation.sufficient) {
        console.log(`Job ${context.jobId}: ✓ Jina Reader completed successfully`);
        return this.createSuccessResult(attempts, OrchestrationStrategy.COST_FIRST, startTime);
      }
    }

    console.log(`Job ${context.jobId}: Jina Reader insufficient, using Playwright as last resort...`);

    // Tier 4: Playwright (expensive, only if necessary)
    this.emitProgress(context, 'Trying Tier 4 - Playwright (last resort)...', 75);
    console.log(`Job ${context.jobId}: Trying Tier 4 - Playwright (last resort)...`);

    const playwrightAttempt = await this.executeScraper(context, ScraperType.PLAYWRIGHT, () =>
      scrapeWithPlaywright(context.url, context.jobId, context.options, context.emitProgress)
    );
    attempts.push(playwrightAttempt);

    if (playwrightAttempt.success && playwrightAttempt.result) {
      console.log(`Job ${context.jobId}: ✓ Playwright completed (used as last resort)`);
      return this.createSuccessResult(attempts, OrchestrationStrategy.COST_FIRST, startTime);
    }

    // All attempts failed - throw error
    const lastError = attempts[attempts.length - 1]?.error;
    throw new Error(
      `All scrapers failed. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }
}


