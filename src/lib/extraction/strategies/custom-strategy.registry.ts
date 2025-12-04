/**
 * Custom Strategy Registry
 * Manages user-defined custom extraction strategies
 */

import { IExtractionStrategy } from '../extraction.strategy';
import { extractionManager } from '../extraction.manager';
import { ExtractionStrategyType } from '../extraction.types';

/**
 * Registry for custom strategies
 * Allows multiple custom strategies with unique names
 */
class CustomStrategyRegistry {
  private strategies: Map<string, IExtractionStrategy> = new Map();

  /**
   * Register a custom strategy
   */
  registerCustomStrategy(
    strategy: IExtractionStrategy,
    name?: string
  ): void {
    const strategyName = name || strategy.name;

    if (!strategyName || strategyName.trim().length === 0) {
      throw new Error('Custom strategy must have a name');
    }

    // Ensure strategy type is CUSTOM
    if (strategy.type !== ExtractionStrategyType.CUSTOM) {
      console.warn(
        `Warning: Strategy "${strategyName}" type is ${strategy.type}, but will be registered as CUSTOM`
      );
    }

    this.strategies.set(strategyName, strategy);

    // Also register with extraction manager
    // Note: ExtractionManager uses type as key, so we need to handle multiple custom strategies
    // For now, we'll register the first one with the CUSTOM type
    // Users can access specific strategies by name using getCustomStrategy()
    if (this.strategies.size === 1) {
      extractionManager.registerStrategy(strategy);
    }

    console.log(`✅ Registered custom strategy: ${strategyName}`);
  }

  /**
   * Get a custom strategy by name
   */
  getCustomStrategy(name: string): IExtractionStrategy | null {
    return this.strategies.get(name) || null;
  }

  /**
   * Get all custom strategies
   */
  getAllCustomStrategies(): IExtractionStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get all custom strategy names
   */
  getAllCustomStrategyNames(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Unregister a custom strategy
   */
  unregisterCustomStrategy(name: string): boolean {
    const removed = this.strategies.delete(name);

    if (removed) {
      console.log(`❌ Unregistered custom strategy: ${name}`);

      // If this was the strategy registered with extraction manager, unregister it
      const remainingStrategies = Array.from(this.strategies.values());
      if (remainingStrategies.length > 0) {
        // Re-register the first remaining strategy
        extractionManager.registerStrategy(remainingStrategies[0]);
      } else {
        // No more custom strategies, unregister from extraction manager
        extractionManager.unregisterStrategy(ExtractionStrategyType.CUSTOM);
      }
    }

    return removed;
  }

  /**
   * Check if a custom strategy exists
   */
  hasCustomStrategy(name: string): boolean {
    return this.strategies.has(name);
  }

  /**
   * Get count of registered custom strategies
   */
  getCount(): number {
    return this.strategies.size;
  }

  /**
   * Clear all custom strategies
   */
  clear(): void {
    this.strategies.clear();
    extractionManager.unregisterStrategy(ExtractionStrategyType.CUSTOM);
    console.log('🧹 Cleared all custom strategies');
  }

  /**
   * Get statistics about custom strategies
   */
  getStats(): {
    totalStrategies: number;
    availableStrategies: number;
    strategies: Array<{
      name: string;
      type: string;
      available: boolean;
    }>;
  } {
    const strategies = Array.from(this.strategies.values()).map((s) => ({
      name: s.name,
      type: s.type,
      available: s.isAvailable(),
    }));

    return {
      totalStrategies: this.strategies.size,
      availableStrategies: strategies.filter((s) => s.available).length,
      strategies,
    };
  }
}

// Export singleton instance
export const customStrategyRegistry = new CustomStrategyRegistry();


