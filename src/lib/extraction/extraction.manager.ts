/**
 * Extraction Manager
 * Manages extraction strategies and orchestrates extraction execution
 */

import {
  ExtractionStrategyType,
  ExtractionContext,
  ExtractionResult,
} from './extraction.types';
import { IExtractionStrategy } from './extraction.strategy';

export class ExtractionManager {
  private strategies: Map<ExtractionStrategyType, IExtractionStrategy> = new Map();
  private defaultStrategyType?: ExtractionStrategyType;

  /**
   * Register an extraction strategy
   */
  registerStrategy(strategy: IExtractionStrategy, setAsDefault: boolean = false): void {
    this.strategies.set(strategy.type, strategy);

    if (setAsDefault || !this.defaultStrategyType) {
      this.defaultStrategyType = strategy.type;
    }
  }

  /**
   * Unregister a strategy
   */
  unregisterStrategy(type: ExtractionStrategyType): boolean {
    const removed = this.strategies.delete(type);

    // Update default if it was removed
    if (removed && this.defaultStrategyType === type) {
      const available = this.getAvailableStrategies();
      this.defaultStrategyType = available.length > 0 ? available[0] : undefined;
    }

    return removed;
  }

  /**
   * Get strategy by type
   */
  getStrategy(type: ExtractionStrategyType): IExtractionStrategy | null {
    return this.strategies.get(type) || null;
  }

  /**
   * Get list of available strategies
   */
  getAvailableStrategies(): ExtractionStrategyType[] {
    return Array.from(this.strategies.values())
      .filter((strategy) => strategy.isAvailable())
      .map((strategy) => strategy.type);
  }

  /**
   * Get default strategy type
   */
  getDefaultStrategyType(): ExtractionStrategyType | undefined {
    return this.defaultStrategyType;
  }

  /**
   * Set default strategy type
   */
  setDefaultStrategyType(type: ExtractionStrategyType): boolean {
    const strategy = this.strategies.get(type);
    if (strategy && strategy.isAvailable()) {
      this.defaultStrategyType = type;
      return true;
    }
    return false;
  }

  /**
   * Execute extraction with specified strategy
   */
  async extract(
    context: ExtractionContext,
    strategyType?: ExtractionStrategyType
  ): Promise<ExtractionResult> {
    // Determine which strategy to use
    const type = strategyType || this.defaultStrategyType;

    if (!type) {
      return {
        entities: [],
        success: false,
        strategy: ExtractionStrategyType.CUSTOM,
        executionTime: 0,
        error: 'No extraction strategy available',
      };
    }

    const strategy = this.strategies.get(type);

    if (!strategy) {
      return {
        entities: [],
        success: false,
        strategy: type,
        executionTime: 0,
        error: `Strategy ${type} not registered`,
      };
    }

    if (!strategy.isAvailable()) {
      return {
        entities: [],
        success: false,
        strategy: type,
        executionTime: 0,
        error: `Strategy ${type} is not available`,
      };
    }

    // Execute extraction
    const startTime = Date.now();
    try {
      const result = await strategy.extract(context);
      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      return {
        entities: [],
        success: false,
        strategy: type,
        executionTime,
        error: error.message || 'Unknown error during extraction',
      };
    }
  }

  /**
   * Execute extraction with fallback chain
   * Tries strategies in order until one succeeds
   */
  async extractWithFallback(
    context: ExtractionContext,
    preferredStrategies: ExtractionStrategyType[]
  ): Promise<ExtractionResult> {
    // Try preferred strategies in order
    for (const strategyType of preferredStrategies) {
      const result = await this.extract(context, strategyType);
      if (result.success) {
        return result;
      }
    }

    // If all preferred strategies failed, try any available strategy
    const availableStrategies = this.getAvailableStrategies();
    for (const strategyType of availableStrategies) {
      if (!preferredStrategies.includes(strategyType)) {
        const result = await this.extract(context, strategyType);
        if (result.success) {
          return result;
        }
      }
    }

    // All strategies failed
    return {
      entities: [],
      success: false,
      strategy: ExtractionStrategyType.CUSTOM,
      executionTime: 0,
      error: 'All extraction strategies failed',
    };
  }

  /**
   * Get all registered strategies (including unavailable ones)
   */
  getAllStrategies(): ExtractionStrategyType[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Check if a strategy is registered
   */
  hasStrategy(type: ExtractionStrategyType): boolean {
    return this.strategies.has(type);
  }

  /**
   * Clear all strategies
   */
  clear(): void {
    this.strategies.clear();
    this.defaultStrategyType = undefined;
  }

  /**
   * Get statistics about registered strategies
   */
  getStats(): {
    totalStrategies: number;
    availableStrategies: number;
    defaultStrategy?: ExtractionStrategyType;
    strategies: Array<{
      type: ExtractionStrategyType;
      name: string;
      available: boolean;
    }>;
  } {
    const strategies = Array.from(this.strategies.values()).map((s) => ({
      type: s.type,
      name: s.name,
      available: s.isAvailable(),
    }));

    return {
      totalStrategies: this.strategies.size,
      availableStrategies: strategies.filter((s) => s.available).length,
      defaultStrategy: this.defaultStrategyType,
      strategies,
    };
  }
}

// Export singleton instance
export const extractionManager = new ExtractionManager();



