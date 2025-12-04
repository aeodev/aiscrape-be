/**
 * Adaptive Orchestration Strategy
 * Learns from history and uses domain-based heuristics to select optimal scraper
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
import { SpeedFirstStrategy } from './speed-first.strategy';

/**
 * Domain-based scraper recommendations
 */
const DOMAIN_PATTERNS: Record<string, ScraperType[]> = {
  // JavaScript-heavy sites
  'spa': [ScraperType.PLAYWRIGHT, ScraperType.JINA, ScraperType.HTTP],
  'react': [ScraperType.PLAYWRIGHT, ScraperType.JINA, ScraperType.HTTP],
  'vue': [ScraperType.PLAYWRIGHT, ScraperType.JINA, ScraperType.HTTP],
  'angular': [ScraperType.PLAYWRIGHT, ScraperType.JINA, ScraperType.HTTP],

  // Static content sites
  'blog': [ScraperType.HTTP, ScraperType.JINA, ScraperType.PLAYWRIGHT],
  'article': [ScraperType.HTTP, ScraperType.JINA, ScraperType.PLAYWRIGHT],
  'news': [ScraperType.HTTP, ScraperType.JINA, ScraperType.PLAYWRIGHT],

  // E-commerce
  'shop': [ScraperType.PLAYWRIGHT, ScraperType.JINA, ScraperType.HTTP],
  'store': [ScraperType.PLAYWRIGHT, ScraperType.JINA, ScraperType.HTTP],
  'product': [ScraperType.PLAYWRIGHT, ScraperType.JINA, ScraperType.HTTP],
};

/**
 * URL pattern matching for scraper selection
 */
function getRecommendedScrapers(url: string): ScraperType[] {
  const urlLower = url.toLowerCase();

  // Check domain patterns
  for (const [pattern, scrapers] of Object.entries(DOMAIN_PATTERNS)) {
    if (urlLower.includes(pattern)) {
      return scrapers;
    }
  }

  // Check for common SPA indicators
  if (
    urlLower.includes('/#/') ||
    urlLower.includes('/#!/') ||
    urlLower.includes('?') && urlLower.includes('_escaped_fragment_')
  ) {
    return [ScraperType.PLAYWRIGHT, ScraperType.JINA, ScraperType.HTTP];
  }

  // Default: speed-first order
  return [ScraperType.HTTP, ScraperType.JINA, ScraperType.PLAYWRIGHT];
}

export class AdaptiveStrategy extends BaseOrchestrationStrategy {
  private speedFirstStrategy: SpeedFirstStrategy;

  constructor() {
    super();
    this.speedFirstStrategy = new SpeedFirstStrategy();
  }

  getStrategyName(): string {
    return 'Adaptive';
  }

  getDescription(): string {
    return 'Learns from history and uses domain-based heuristics to select optimal scraper order';
  }

  async execute(context: OrchestrationContext): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const attempts: ScraperExecutionResult[] = [];

    // Get recommended scrapers based on URL patterns
    const recommendedScrapers = getRecommendedScrapers(context.url);
    console.log(
      `Job ${context.jobId}: Adaptive strategy - Recommended scrapers: ${recommendedScrapers.join(' → ')}`
    );

    // Try recommended scrapers in order
    for (let i = 0; i < recommendedScrapers.length; i++) {
      const scraperType = recommendedScrapers[i];
      const progress = 30 + (i * 20);

      this.emitProgress(
        context,
        `Trying ${scraperType} scraper (adaptive selection ${i + 1}/${recommendedScrapers.length})...`,
        progress
      );
      console.log(`Job ${context.jobId}: Trying ${scraperType} scraper (adaptive selection)...`);

      let attempt: ScraperExecutionResult;

      switch (scraperType) {
        case ScraperType.HTTP:
          attempt = await this.executeScraper(context, ScraperType.HTTP, () =>
            scrapeWithHttp(context.url, context.jobId, context.emitProgress)
          );
          break;

        case ScraperType.JINA:
          attempt = await this.executeScraper(context, ScraperType.JINA, () =>
            scrapeWithJina(context.url, context.jobId, context.emitProgress)
          );
          break;

        case ScraperType.PLAYWRIGHT:
          // Try Smart Playwright first, fall back to standard
          const userQuestion = context.taskDescription || 'Extract all relevant information';
          attempt = await this.executeScraper(context, ScraperType.PLAYWRIGHT, () =>
            scrapeWithSmartPlaywright(context.url, context.jobId, userQuestion, context.emitProgress)
          );

          if (!attempt.success) {
            // Fall back to standard Playwright
            attempt = await this.executeScraper(context, ScraperType.PLAYWRIGHT, () =>
              scrapeWithPlaywright(context.url, context.jobId, context.options, context.emitProgress)
            );
          }
          break;

        default:
          console.log(`Job ${context.jobId}: Unsupported scraper type ${scraperType}, skipping...`);
          continue;
      }

      attempts.push(attempt);

      if (attempt.success && attempt.result && this.isValidContent(attempt.result)) {
        // Validate content quality
        const validation = await this.validateContent(context, attempt.result);
        attempt.qualityScore = validation.qualityScore;
        attempt.validationReason = validation.reason;

        if (validation.sufficient) {
          console.log(
            `Job ${context.jobId}: ✓ ${scraperType} scraper completed successfully (adaptive selection)`
          );
          return this.createSuccessResult(attempts, OrchestrationStrategy.ADAPTIVE, startTime);
        }

        // Content insufficient but valid - continue to next scraper
        console.log(
          `Job ${context.jobId}: ${scraperType} scraper got content but quality insufficient, trying next...`
        );
      }
    }

    // All recommended scrapers failed - fall back to speed-first strategy
    console.log(
      `Job ${context.jobId}: All adaptive selections failed, falling back to speed-first strategy...`
    );
    this.emitProgress(context, 'Falling back to speed-first strategy...', 80);

    try {
      const fallbackResult = await this.speedFirstStrategy.execute(context);
      return {
        ...fallbackResult,
        strategy: OrchestrationStrategy.ADAPTIVE,
        metadata: {
          ...fallbackResult.metadata,
          adaptiveSelectionFailed: true,
          fallbackStrategy: 'speed_first',
        },
      };
    } catch (error: any) {
      // Even fallback failed
      const lastError = attempts[attempts.length - 1]?.error;
      throw new Error(
        `All scrapers failed (including fallback). Last error: ${lastError?.message || error.message}`
      );
    }
  }
}


