/**
 * Extraction Strategies
 * Export all extraction strategies
 */

export * from './llm-base.strategy';
export * from './gemini.strategy';
export * from './openai.strategy';
export * from './anthropic.strategy';
export * from './cosine-similarity.strategy';
export * from './rule-based.strategy';
export * from './rule-based.types';
export * from './rule-based.rules';
export * from './custom-strategy.template';
export * from './custom-strategy.example';
export * from './custom-strategy.registry';

import { GeminiLLMStrategy } from './gemini.strategy';
import { OpenAILLMStrategy } from './openai.strategy';
import { AnthropicLLMStrategy } from './anthropic.strategy';
import { CosineSimilarityStrategy } from './cosine-similarity.strategy';
import { RuleBasedStrategy } from './rule-based.strategy';
import { extractionManager } from '../extraction.manager';
import { ExtractionStrategyType } from '../extraction.types';

/**
 * Register all available LLM strategies with the extraction manager
 */
export function registerLLMStrategies(): void {
  // Register Gemini strategy (if available)
  const geminiStrategy = new GeminiLLMStrategy();
  if (geminiStrategy.isAvailable()) {
    extractionManager.registerStrategy(geminiStrategy, true); // Set as default
    console.log('✅ Registered Gemini LLM extraction strategy');
  }

  // Register OpenAI strategy (if available)
  const openaiStrategy = new OpenAILLMStrategy();
  if (openaiStrategy.isAvailable()) {
    extractionManager.registerStrategy(openaiStrategy);
    console.log('✅ Registered OpenAI LLM extraction strategy');
  }

  // Register Anthropic strategy (if available)
  const anthropicStrategy = new AnthropicLLMStrategy();
  if (anthropicStrategy.isAvailable()) {
    extractionManager.registerStrategy(anthropicStrategy);
    console.log('✅ Registered Anthropic LLM extraction strategy');
  }

  // Log available strategies
  const availableStrategies = extractionManager.getAvailableStrategies();
  if (availableStrategies.length === 0) {
    console.warn('⚠️  No LLM extraction strategies available. Configure API keys to enable extraction.');
  } else {
    console.log(`📊 Available extraction strategies: ${availableStrategies.join(', ')}`);
  }
}

/**
 * Register cosine similarity strategy (always available, no API key needed)
 */
export function registerCosineSimilarityStrategy(): void {
  const cosineStrategy = new CosineSimilarityStrategy();
  if (cosineStrategy.isAvailable()) {
    extractionManager.registerStrategy(cosineStrategy);
    console.log('✅ Registered Cosine Similarity extraction strategy');
  }
}

/**
 * Register rule-based strategy (always available, no API key needed)
 */
export function registerRuleBasedStrategy(): void {
  const ruleBasedStrategy = new RuleBasedStrategy();
  if (ruleBasedStrategy.isAvailable()) {
    extractionManager.registerStrategy(ruleBasedStrategy);
    console.log('✅ Registered Rule-Based extraction strategy');
  }
}

/**
 * Register all available extraction strategies
 */
export function registerAllStrategies(): void {
  // Register LLM strategies
  registerLLMStrategies();

  // Register cosine similarity strategy
  registerCosineSimilarityStrategy();

  // Register rule-based strategy
  registerRuleBasedStrategy();

  // Log all available strategies
  const availableStrategies = extractionManager.getAvailableStrategies();
  console.log(`📊 Total available extraction strategies: ${availableStrategies.length}`);
}

