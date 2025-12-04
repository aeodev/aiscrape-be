/**
 * Orchestration Strategies
 * Export all strategy classes and factory functions
 */

import { IOrchestrationStrategy } from '../orchestrator.strategy';
import { OrchestrationStrategy } from '../orchestrator.types';
import { SpeedFirstStrategy } from './speed-first.strategy';
import { QualityFirstStrategy } from './quality-first.strategy';
import { CostFirstStrategy } from './cost-first.strategy';
import { AdaptiveStrategy } from './adaptive.strategy';

export { SpeedFirstStrategy } from './speed-first.strategy';
export { QualityFirstStrategy } from './quality-first.strategy';
export { CostFirstStrategy } from './cost-first.strategy';
export { AdaptiveStrategy } from './adaptive.strategy';

/**
 * Create a strategy instance
 */
export function createStrategy(strategy: OrchestrationStrategy): IOrchestrationStrategy {
  switch (strategy) {
    case OrchestrationStrategy.SPEED_FIRST:
      return new SpeedFirstStrategy();

    case OrchestrationStrategy.QUALITY_FIRST:
      return new QualityFirstStrategy();

    case OrchestrationStrategy.COST_FIRST:
      return new CostFirstStrategy();

    case OrchestrationStrategy.ADAPTIVE:
      return new AdaptiveStrategy();

    default:
      throw new Error(`Unknown orchestration strategy: ${strategy}`);
  }
}

/**
 * Get all available strategies
 */
export function getAvailableStrategies(): OrchestrationStrategy[] {
  return [
    OrchestrationStrategy.SPEED_FIRST,
    OrchestrationStrategy.QUALITY_FIRST,
    OrchestrationStrategy.COST_FIRST,
    OrchestrationStrategy.ADAPTIVE,
  ];
}


