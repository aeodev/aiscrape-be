/**
 * Crawler Orchestration Strategy
 * Base interface and abstract class for orchestration strategies
 */

import {
  OrchestrationContext,
  OrchestrationResult,
  ScraperExecutionResult,
} from './orchestrator.types';
import { ScraperType } from '../../modules/scraper/scraper.types';
import { ScrapedResult } from '../../modules/scraper/scrapers/types';
import { ScrapeStatus } from '../../modules/scraper/scraper.types';

/**
 * Orchestration strategy interface
 */
export interface IOrchestrationStrategy {
  /**
   * Execute orchestration
   */
  execute(context: OrchestrationContext): Promise<OrchestrationResult>;

  /**
   * Get strategy name
   */
  getStrategyName(): string;

  /**
   * Get strategy description
   */
  getDescription(): string;
}

/**
 * Base orchestration strategy abstract class
 * Provides common functionality for all strategies
 */
export abstract class BaseOrchestrationStrategy implements IOrchestrationStrategy {
  /**
   * Execute orchestration (must be implemented by subclasses)
   */
  abstract execute(context: OrchestrationContext): Promise<OrchestrationResult>;

  /**
   * Get strategy name (must be implemented by subclasses)
   */
  abstract getStrategyName(): string;

  /**
   * Get strategy description (must be implemented by subclasses)
   */
  abstract getDescription(): string;

  /**
   * Execute a scraper and return result
   */
  protected async executeScraper(
    context: OrchestrationContext,
    scraperType: ScraperType,
    scraperFn: () => Promise<ScrapedResult | null>
  ): Promise<ScraperExecutionResult> {
    const startTime = Date.now();

    try {
      const result = await scraperFn();

      if (!result) {
        return {
          success: false,
          scraperType,
          executionTime: Date.now() - startTime,
          error: new Error(`${scraperType} scraper returned null`),
        };
      }

      return {
        success: true,
        result,
        scraperType,
        executionTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        scraperType,
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Validate content using enhanced validator
   */
  protected async validateContent(
    context: OrchestrationContext,
    result: ScrapedResult
  ): Promise<{ sufficient: boolean; qualityScore: number; reason: string }> {
    try {
      const { contentValidator } = await import('../validation');
      const validationContext = {
        html: result.html || '',
        text: result.text || result.html || '',
        markdown: result.markdown || '',
        url: context.url,
        taskDescription: context.taskDescription,
        pageTitle: result.pageTitle,
      };

      const validationResult = await contentValidator.validateWithCache(validationContext);

      return {
        sufficient: validationResult.sufficient,
        qualityScore: validationResult.qualityScore.overall,
        reason: validationResult.reason,
      };
    } catch (error: any) {
      console.error(`Content validation error: ${error.message}`);
      // Default to sufficient if validation fails
      return {
        sufficient: true,
        qualityScore: 0.5,
        reason: 'Validation failed, assuming sufficient',
      };
    }
  }

  /**
   * Check if content is valid (basic check)
   */
  protected isValidContent(result: ScrapedResult | null): boolean {
    if (!result) return false;
    const hasContent = !!(result.html || result.text || result.markdown);
    const hasMinimumLength = (result.text || result.html || '').length > 100;
    return hasContent && hasMinimumLength;
  }

  /**
   * Emit progress update
   */
  protected emitProgress(
    context: OrchestrationContext,
    message: string,
    progress: number
  ): void {
    context.emitProgress(context.jobId, {
      jobId: context.jobId,
      status: ScrapeStatus.RUNNING,
      message,
      progress,
    });
  }

  /**
   * Create orchestration result from successful attempt
   */
  protected createSuccessResult(
    attempts: ScraperExecutionResult[],
    strategy: import('./orchestrator.types').OrchestrationStrategy,
    startTime: number
  ): OrchestrationResult {
    const successfulAttempt = attempts.find((a) => a.success);
    if (!successfulAttempt || !successfulAttempt.result) {
      throw new Error('No successful attempt found');
    }

    return {
      result: successfulAttempt.result,
      scraperUsed: successfulAttempt.scraperType,
      attempts,
      totalTime: Date.now() - startTime,
      strategy,
    };
  }
}



