/**
 * Enhanced Content Validator
 * Main validator class with strategy selection, caching, and metrics
 */

import {
  ValidationStrategy,
  ValidationContext,
  EnhancedValidationResult,
  ValidationRule,
} from './content-validator.types';
import {
  IValidationStrategy,
  HeuristicValidationStrategy,
  RuleBasedValidationStrategy,
  AIValidationStrategy,
  HybridValidationStrategy,
} from './content-validator.strategies';
import { getAllRules } from './content-validator.rules';
import { cacheManager } from '../cache/cache.manager';
import { generateContentHash } from './content-validator.utils';
import { env } from '../../config/env';

export class ContentValidator {
  private strategies: Map<ValidationStrategy, IValidationStrategy> = new Map();
  private rules: Map<string, ValidationRule> = new Map();
  private defaultStrategy: ValidationStrategy;

  constructor() {
    // Initialize strategies
    this.strategies.set(ValidationStrategy.HEURISTIC, new HeuristicValidationStrategy());
    this.strategies.set(ValidationStrategy.RULE_BASED, new RuleBasedValidationStrategy());
    this.strategies.set(ValidationStrategy.AI, new AIValidationStrategy());
    this.strategies.set(ValidationStrategy.HYBRID, new HybridValidationStrategy());

    // Set default strategy
    const defaultStrategyName = (env.CONTENT_VALIDATION_STRATEGY || 'hybrid').toLowerCase();
    this.defaultStrategy =
      Object.values(ValidationStrategy).find((s) => s === defaultStrategyName) ||
      ValidationStrategy.HYBRID;

    // Load default rules
    const defaultRules = getAllRules();
    for (const rule of defaultRules) {
      this.rules.set(rule.name, rule);
    }
  }

  /**
   * Validate content with optional strategy
   */
  async validate(
    context: ValidationContext,
    strategy?: ValidationStrategy
  ): Promise<EnhancedValidationResult> {
    const selectedStrategy = strategy || this.defaultStrategy;
    const validationStrategy = this.strategies.get(selectedStrategy);

    if (!validationStrategy) {
      throw new Error(`Unknown validation strategy: ${selectedStrategy}`);
    }

    if (!validationStrategy.isAvailable()) {
      // Fallback to heuristic if selected strategy unavailable
      const heuristicStrategy = this.strategies.get(ValidationStrategy.HEURISTIC);
      if (heuristicStrategy) {
        return await heuristicStrategy.validate(context);
      }
      throw new Error('No available validation strategies');
    }

    return await validationStrategy.validate(context);
  }

  /**
   * Validate content with caching
   */
  async validateWithCache(
    context: ValidationContext,
    strategy?: ValidationStrategy
  ): Promise<EnhancedValidationResult> {
    if (!env.CONTENT_VALIDATION_CACHE_ENABLED) {
      return await this.validate(context, strategy);
    }

    const cacheKey = `validation:${generateContentHash(context)}:${strategy || this.defaultStrategy}`;

    // Try cache first
    const cached = await cacheManager.get<EnhancedValidationResult>(cacheKey);
    if (cached.data) {
      return cached.data;
    }

    // Validate
    const result = await this.validate(context, strategy);

    // Cache result (1 hour TTL)
    await cacheManager.set(cacheKey, result, 3600);

    return result;
  }

  /**
   * Add a custom validation rule
   */
  addRule(rule: ValidationRule): void {
    this.rules.set(rule.name, rule);
  }

  /**
   * Remove a validation rule
   */
  removeRule(name: string): boolean {
    return this.rules.delete(name);
  }

  /**
   * Enable a validation rule
   */
  enableRule(name: string): boolean {
    const rule = this.rules.get(name);
    if (rule) {
      rule.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a validation rule
   */
  disableRule(name: string): boolean {
    const rule = this.rules.get(name);
    if (rule) {
      rule.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Get a validation rule
   */
  getRule(name: string): ValidationRule | null {
    return this.rules.get(name) || null;
  }

  /**
   * Get all validation rules
   */
  getAllRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get enabled validation rules
   */
  getEnabledRules(): ValidationRule[] {
    return Array.from(this.rules.values()).filter((r) => r.enabled);
  }

  /**
   * Get validation strategy
   */
  getStrategy(strategy: ValidationStrategy): IValidationStrategy | null {
    return this.strategies.get(strategy) || null;
  }

  /**
   * Get default strategy
   */
  getDefaultStrategy(): ValidationStrategy {
    return this.defaultStrategy;
  }

  /**
   * Set default strategy
   */
  setDefaultStrategy(strategy: ValidationStrategy): boolean {
    if (this.strategies.has(strategy)) {
      this.defaultStrategy = strategy;
      return true;
    }
    return false;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    availableStrategies: string[];
    defaultStrategy: ValidationStrategy;
  } {
    return {
      totalRules: this.rules.size,
      enabledRules: this.getEnabledRules().length,
      availableStrategies: Array.from(this.strategies.values())
        .filter((s) => s.isAvailable())
        .map((s) => s.getStrategyName()),
      defaultStrategy: this.defaultStrategy,
    };
  }
}

// Export singleton instance
export const contentValidator = new ContentValidator();

