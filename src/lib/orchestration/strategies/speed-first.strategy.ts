/**
 * Speed-First Orchestration Strategy
 * Prioritizes speed: HTTP (~100ms) → Jina (~1-3s) → Smart Playwright (~10-15s) → Standard Playwright
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
  scrapeWithJina,
  scrapeWithSmartPlaywright,
  scrapeWithPlaywright,
} from '../../../modules/scraper/scrapers';

export class SpeedFirstStrategy extends BaseOrchestrationStrategy {
  getStrategyName(): string {
    return 'Speed-First';
  }

  getDescription(): string {
    return 'Prioritizes speed: tries fastest scrapers first (HTTP → Jina → Smart Playwright → Standard Playwright)';
  }

  async execute(context: OrchestrationContext): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const attempts: ScraperExecutionResult[] = [];
    const userQuestion = context.taskDescription || 'Extract all relevant information';

    // Tier 1: HTTP + Cheerio (fastest, ~100ms)
    this.emitProgress(context, 'Trying Tier 1 - HTTP scraper...', 30);
    console.log(`Job ${context.jobId}: Trying Tier 1 - HTTP scraper...`);

    const httpAttempt = await this.executeScraper(context, ScraperType.HTTP, () =>
      scrapeWithHttp(context.url, context.jobId, context.emitProgress, context.options)
    );
    attempts.push(httpAttempt);

    if (httpAttempt.success && httpAttempt.result && this.isValidContent(httpAttempt.result)) {
      console.log(`Job ${context.jobId}: ✓ HTTP scraper got content, validating quality...`);

      // Validate content quality
      this.emitProgress(context, 'Validating content quality...', 50);
      const validation = await this.validateContent(context, httpAttempt.result);

      httpAttempt.qualityScore = validation.qualityScore;
      httpAttempt.validationReason = validation.reason;

      console.log(
        `Job ${context.jobId}: Content validation - sufficient: ${validation.sufficient}, reason: ${validation.reason}, quality score: ${validation.qualityScore.toFixed(2)}`
      );

      if (validation.sufficient) {
        console.log(`Job ${context.jobId}: ✓ Content is sufficient for the question`);
        return this.createSuccessResult(attempts, OrchestrationStrategy.SPEED_FIRST, startTime);
      }

      // Content insufficient - escalate to Smart Playwright
      console.log(`Job ${context.jobId}: Content insufficient, escalating to Smart Playwright...`);
      console.log(`Job ${context.jobId}: Reason: ${validation.reason}`);
    }

    // Tier 2: Smart Playwright with AI-guided interactions
    this.emitProgress(context, 'Trying Tier 2 - Smart Playwright (AI-guided)...', 55);
    console.log(`Job ${context.jobId}: Trying Tier 2 - Smart Playwright (AI-guided)...`);

    const smartPlaywrightAttempt = await this.executeScraper(
      context,
      ScraperType.PLAYWRIGHT,
      () => scrapeWithSmartPlaywright(context.url, context.jobId, userQuestion, context.emitProgress)
    );
    attempts.push(smartPlaywrightAttempt);

    if (smartPlaywrightAttempt.success && smartPlaywrightAttempt.result) {
      console.log(`Job ${context.jobId}: ✓ Smart Playwright completed`);
      return this.createSuccessResult(attempts, OrchestrationStrategy.SPEED_FIRST, startTime);
    }

    console.log(
      `Job ${context.jobId}: Smart Playwright failed: ${smartPlaywrightAttempt.error?.message}, falling back to standard Playwright`
    );

    // Tier 3: Standard Playwright (fallback)
    this.emitProgress(context, 'Trying Tier 3 - Standard Playwright (fallback)...', 70);
    console.log(`Job ${context.jobId}: Trying Tier 3 - Standard Playwright (fallback)...`);

    const playwrightAttempt = await this.executeScraper(context, ScraperType.PLAYWRIGHT, () =>
      scrapeWithPlaywright(context.url, context.jobId, context.options, context.emitProgress)
    );
    attempts.push(playwrightAttempt);

    if (playwrightAttempt.success && playwrightAttempt.result) {
      console.log(`Job ${context.jobId}: ✓ Playwright completed`);
      return this.createSuccessResult(attempts, OrchestrationStrategy.SPEED_FIRST, startTime);
    }

    // All attempts failed - throw error
    const lastError = attempts[attempts.length - 1]?.error;
    throw new Error(
      `All scrapers failed. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }
}


