/**
 * Extraction System
 * Main export file for extraction strategies
 */

export * from './extraction.types';
export * from './extraction.strategy';
export * from './extraction.manager';
export * from './strategies';

export { extractionManager } from './extraction.manager';
export { registerLLMStrategies, registerCosineSimilarityStrategy, registerRuleBasedStrategy, registerAllStrategies } from './strategies';
export { customStrategyRegistry } from './strategies/custom-strategy.registry';

