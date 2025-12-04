/**
 * Crawler Orchestration Types
 * Type definitions for crawler orchestration system
 */

import { ScraperType, ScrapeStatus } from '../../modules/scraper/scraper.types';
import { ScrapedResult, ScraperOptions, ProgressEmitter } from '../../modules/scraper/scrapers/types';
import { IScrapeProgressEvent } from '../../modules/scraper/scraper.types';

/**
 * Orchestration strategy enumeration
 */
export enum OrchestrationStrategy {
  SPEED_FIRST = 'speed_first',
  QUALITY_FIRST = 'quality_first',
  COST_FIRST = 'cost_first',
  ADAPTIVE = 'adaptive',
  CUSTOM = 'custom',
}

/**
 * Orchestration context interface
 */
export interface OrchestrationContext {
  /**
   * URL to scrape
   */
  url: string;

  /**
   * Job ID
   */
  jobId: string;

  /**
   * Task description/question
   */
  taskDescription?: string;

  /**
   * Scraper options
   */
  options: ScraperOptions;

  /**
   * Progress emitter function
   */
  emitProgress: ProgressEmitter;
}

/**
 * Scraper execution result interface
 */
export interface ScraperExecutionResult {
  /**
   * Whether execution was successful
   */
  success: boolean;

  /**
   * Scraped result (if successful)
   */
  result?: ScrapedResult;

  /**
   * Scraper type used
   */
  scraperType: ScraperType;

  /**
   * Execution time in milliseconds
   */
  executionTime: number;

  /**
   * Error (if failed)
   */
  error?: Error;

  /**
   * Quality score (0-1) if validation was performed
   */
  qualityScore?: number;

  /**
   * Validation reason
   */
  validationReason?: string;
}

/**
 * Orchestration result interface
 */
export interface OrchestrationResult {
  /**
   * Final scraped result
   */
  result: ScrapedResult;

  /**
   * Scraper type that succeeded
   */
  scraperUsed: ScraperType;

  /**
   * All scraper attempts
   */
  attempts: ScraperExecutionResult[];

  /**
   * Total orchestration time in milliseconds
   */
  totalTime: number;

  /**
   * Strategy used
   */
  strategy: OrchestrationStrategy;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Orchestration statistics interface
 */
export interface OrchestrationStatistics {
  /**
   * Total orchestrations performed
   */
  totalOrchestrations: number;

  /**
   * Success rate by strategy
   */
  successRateByStrategy: Record<OrchestrationStrategy, number>;

  /**
   * Average execution time by strategy
   */
  avgExecutionTimeByStrategy: Record<OrchestrationStrategy, number>;

  /**
   * Scraper usage counts
   */
  scraperUsageCounts: Record<ScraperType, number>;

  /**
   * Success rate by scraper
   */
  scraperSuccessRates: Record<ScraperType, number>;
}


