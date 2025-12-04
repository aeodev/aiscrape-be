/**
 * Crawler Orchestrator
 * Main orchestrator class for managing scraper execution strategies
 */

import {
  OrchestrationContext,
  OrchestrationResult,
  OrchestrationStrategy,
  OrchestrationStatistics,
} from './orchestrator.types';
import { IOrchestrationStrategy } from './orchestrator.strategy';
import { ScraperType } from '../../modules/scraper/scraper.types';
import { createStrategy, getAvailableStrategies } from './strategies';
import { env } from '../../config/env';

export class CrawlerOrchestrator {
  private strategies: Map<OrchestrationStrategy, IOrchestrationStrategy> = new Map();
  private statistics: OrchestrationStatistics;
  private defaultStrategy: OrchestrationStrategy;

  constructor() {
    // Initialize default strategy
    const defaultStrategyName = (env.CRAWLER_ORCHESTRATION_STRATEGY || 'speed_first').toLowerCase();
    this.defaultStrategy =
      (Object.values(OrchestrationStrategy).find(
        (s) => s === defaultStrategyName
      ) as OrchestrationStrategy) || OrchestrationStrategy.SPEED_FIRST;

    // Initialize statistics
    this.statistics = {
      totalOrchestrations: 0,
      successRateByStrategy: {} as Record<OrchestrationStrategy, number>,
      avgExecutionTimeByStrategy: {} as Record<OrchestrationStrategy, number>,
      scraperUsageCounts: {} as Record<ScraperType, number>,
      scraperSuccessRates: {} as Record<ScraperType, number>,
    };

    // Initialize default strategies
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default strategies
   */
  private initializeDefaultStrategies(): void {
    const availableStrategies = getAvailableStrategies();
    for (const strategy of availableStrategies) {
      this.strategies.set(strategy, createStrategy(strategy));
    }
  }

  /**
   * Orchestrate scraping with optional strategy
   */
  async orchestrate(
    context: OrchestrationContext,
    strategy?: OrchestrationStrategy
  ): Promise<OrchestrationResult> {
    const selectedStrategy = strategy || this.defaultStrategy;
    const strategyImpl = this.strategies.get(selectedStrategy);

    if (!strategyImpl) {
      throw new Error(`Unknown orchestration strategy: ${selectedStrategy}`);
    }

    const startTime = Date.now();

    try {
      // Execute strategy
      const result = await strategyImpl.execute(context);

      // Update statistics
      this.updateStatistics(result, Date.now() - startTime, true);

      return result;
    } catch (error: any) {
      // Update statistics
      this.updateStatistics(
        {
          result: {} as any,
          scraperUsed: ScraperType.HTTP,
          attempts: [],
          totalTime: Date.now() - startTime,
          strategy: selectedStrategy,
        },
        Date.now() - startTime,
        false
      );

      throw error;
    }
  }

  /**
   * Register a custom strategy
   */
  registerStrategy(strategy: OrchestrationStrategy, implementation: IOrchestrationStrategy): void {
    this.strategies.set(strategy, implementation);
  }

  /**
   * Get a strategy implementation
   */
  getStrategy(strategy: OrchestrationStrategy): IOrchestrationStrategy | null {
    return this.strategies.get(strategy) || null;
  }

  /**
   * Get default strategy
   */
  getDefaultStrategy(): OrchestrationStrategy {
    return this.defaultStrategy;
  }

  /**
   * Set default strategy
   */
  setDefaultStrategy(strategy: OrchestrationStrategy): boolean {
    if (this.strategies.has(strategy)) {
      this.defaultStrategy = strategy;
      return true;
    }
    return false;
  }

  /**
   * Get statistics
   */
  getStatistics(): OrchestrationStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statistics = {
      totalOrchestrations: 0,
      successRateByStrategy: {} as Record<OrchestrationStrategy, number>,
      avgExecutionTimeByStrategy: {} as Record<OrchestrationStrategy, number>,
      scraperUsageCounts: {} as Record<ScraperType, number>,
      scraperSuccessRates: {} as Record<ScraperType, number>,
    };
  }

  /**
   * Update statistics after orchestration
   */
  private updateStatistics(
    result: OrchestrationResult,
    executionTime: number,
    success: boolean
  ): void {
    this.statistics.totalOrchestrations++;

    // Update strategy statistics
    const strategy = result.strategy;
    if (!this.statistics.successRateByStrategy[strategy]) {
      this.statistics.successRateByStrategy[strategy] = 0;
      this.statistics.avgExecutionTimeByStrategy[strategy] = 0;
    }

    // Calculate success rate (simplified - would need more tracking for accurate rate)
    const currentSuccessRate = this.statistics.successRateByStrategy[strategy];
    const newSuccessRate = success ? currentSuccessRate + 1 : currentSuccessRate;
    this.statistics.successRateByStrategy[strategy] = newSuccessRate;

    // Update average execution time
    const currentAvgTime = this.statistics.avgExecutionTimeByStrategy[strategy];
    const totalExecutions = this.statistics.totalOrchestrations;
    this.statistics.avgExecutionTimeByStrategy[strategy] =
      (currentAvgTime * (totalExecutions - 1) + executionTime) / totalExecutions;

    // Update scraper usage counts
    for (const attempt of result.attempts) {
      const scraperType = attempt.scraperType;
      if (!this.statistics.scraperUsageCounts[scraperType]) {
        this.statistics.scraperUsageCounts[scraperType] = 0;
        this.statistics.scraperSuccessRates[scraperType] = 0;
      }
      this.statistics.scraperUsageCounts[scraperType]++;

      if (attempt.success) {
        this.statistics.scraperSuccessRates[scraperType]++;
      }
    }
  }

  /**
   * Get available strategies
   */
  getAvailableStrategies(): OrchestrationStrategy[] {
    return Array.from(this.strategies.keys());
  }
}

// Export singleton instance
export const crawlerOrchestrator = new CrawlerOrchestrator();


