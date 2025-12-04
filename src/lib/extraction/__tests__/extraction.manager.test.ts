/**
 * Extraction Manager Tests
 * Comprehensive unit tests for ExtractionManager
 */

import { ExtractionManager } from '../extraction.manager';
import { ExtractionStrategyType, ExtractionContext, ExtractionResult } from '../extraction.types';
import { IExtractionStrategy } from '../extraction.strategy';
import { testExtractionContext } from '../../../__tests__/helpers/fixtures';

// Mock strategy implementation
class MockStrategy implements IExtractionStrategy {
  name: string;
  type: ExtractionStrategyType;
  private available: boolean;
  private shouldSucceed: boolean;

  constructor(
    type: ExtractionStrategyType,
    name: string,
    available: boolean = true,
    shouldSucceed: boolean = true
  ) {
    this.type = type;
    this.name = name;
    this.available = available;
    this.shouldSucceed = shouldSucceed;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    if (!this.shouldSucceed) {
      return {
        entities: [],
        success: false,
        strategy: this.type,
        executionTime: 10,
        error: 'Mock strategy failed',
      };
    }

    return {
      entities: [
        {
          type: 'article' as any,
          data: { text: 'Mock entity' },
          confidence: 0.9,
        },
      ],
      success: true,
      strategy: this.type,
      executionTime: 10,
      confidence: 0.9,
    };
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  setShouldSucceed(shouldSucceed: boolean): void {
    this.shouldSucceed = shouldSucceed;
  }
}

describe('ExtractionManager', () => {
  let manager: ExtractionManager;
  let mockStrategy1: MockStrategy;
  let mockStrategy2: MockStrategy;

  beforeEach(() => {
    manager = new ExtractionManager();
    mockStrategy1 = new MockStrategy(ExtractionStrategyType.RULE_BASED, 'Rule-Based');
    mockStrategy2 = new MockStrategy(ExtractionStrategyType.COSINE_SIMILARITY, 'Cosine Similarity');
  });

  describe('registerStrategy', () => {
    it('should register a strategy', () => {
      manager.registerStrategy(mockStrategy1);
      expect(manager.hasStrategy(ExtractionStrategyType.RULE_BASED)).toBe(true);
    });

    it('should set strategy as default if setAsDefault is true', () => {
      manager.registerStrategy(mockStrategy1, true);
      expect(manager.getDefaultStrategyType()).toBe(ExtractionStrategyType.RULE_BASED);
    });

    it('should set first strategy as default if no default exists', () => {
      manager.registerStrategy(mockStrategy1);
      expect(manager.getDefaultStrategyType()).toBe(ExtractionStrategyType.RULE_BASED);
    });

    it('should not override existing default if setAsDefault is false', () => {
      manager.registerStrategy(mockStrategy1, true);
      manager.registerStrategy(mockStrategy2, false);
      expect(manager.getDefaultStrategyType()).toBe(ExtractionStrategyType.RULE_BASED);
    });
  });

  describe('unregisterStrategy', () => {
    it('should unregister a strategy', () => {
      manager.registerStrategy(mockStrategy1);
      const removed = manager.unregisterStrategy(ExtractionStrategyType.RULE_BASED);
      
      expect(removed).toBe(true);
      expect(manager.hasStrategy(ExtractionStrategyType.RULE_BASED)).toBe(false);
    });

    it('should return false if strategy not registered', () => {
      const removed = manager.unregisterStrategy(ExtractionStrategyType.RULE_BASED);
      expect(removed).toBe(false);
    });

    it('should update default if default strategy is removed', () => {
      manager.registerStrategy(mockStrategy1, true);
      manager.registerStrategy(mockStrategy2);
      manager.unregisterStrategy(ExtractionStrategyType.RULE_BASED);
      
      expect(manager.getDefaultStrategyType()).toBe(ExtractionStrategyType.COSINE_SIMILARITY);
    });

    it('should clear default if no strategies remain', () => {
      manager.registerStrategy(mockStrategy1, true);
      manager.unregisterStrategy(ExtractionStrategyType.RULE_BASED);
      
      expect(manager.getDefaultStrategyType()).toBeUndefined();
    });
  });

  describe('getStrategy', () => {
    it('should return registered strategy', () => {
      manager.registerStrategy(mockStrategy1);
      const strategy = manager.getStrategy(ExtractionStrategyType.RULE_BASED);
      
      expect(strategy).toBe(mockStrategy1);
    });

    it('should return null for unregistered strategy', () => {
      const strategy = manager.getStrategy(ExtractionStrategyType.RULE_BASED);
      expect(strategy).toBeNull();
    });
  });

  describe('getAvailableStrategies', () => {
    it('should return only available strategies', () => {
      const unavailableStrategy = new MockStrategy(
        ExtractionStrategyType.CUSTOM,
        'Unavailable',
        false
      );
      
      manager.registerStrategy(mockStrategy1);
      manager.registerStrategy(unavailableStrategy);
      
      const available = manager.getAvailableStrategies();
      
      expect(available).toContain(ExtractionStrategyType.RULE_BASED);
      expect(available).not.toContain(ExtractionStrategyType.CUSTOM);
    });

    it('should return empty array if no strategies registered', () => {
      const available = manager.getAvailableStrategies();
      expect(available).toEqual([]);
    });
  });

  describe('setDefaultStrategyType', () => {
    it('should set default strategy type if available', () => {
      manager.registerStrategy(mockStrategy1);
      manager.registerStrategy(mockStrategy2);
      
      const success = manager.setDefaultStrategyType(ExtractionStrategyType.COSINE_SIMILARITY);
      
      expect(success).toBe(true);
      expect(manager.getDefaultStrategyType()).toBe(ExtractionStrategyType.COSINE_SIMILARITY);
    });

    it('should return false if strategy not registered', () => {
      const success = manager.setDefaultStrategyType(ExtractionStrategyType.COSINE_SIMILARITY);
      expect(success).toBe(false);
    });

    it('should return false if strategy not available', () => {
      const unavailableStrategy = new MockStrategy(
        ExtractionStrategyType.CUSTOM,
        'Unavailable',
        false
      );
      manager.registerStrategy(unavailableStrategy);
      
      const success = manager.setDefaultStrategyType(ExtractionStrategyType.CUSTOM);
      expect(success).toBe(false);
    });
  });

  describe('extract', () => {
    it('should execute extraction with specified strategy', async () => {
      manager.registerStrategy(mockStrategy1);
      const result = await manager.extract(testExtractionContext, ExtractionStrategyType.RULE_BASED);
      
      expect(result.success).toBe(true);
      expect(result.strategy).toBe(ExtractionStrategyType.RULE_BASED);
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('should use default strategy if none specified', async () => {
      manager.registerStrategy(mockStrategy1, true);
      const result = await manager.extract(testExtractionContext);
      
      expect(result.success).toBe(true);
      expect(result.strategy).toBe(ExtractionStrategyType.RULE_BASED);
    });

    it('should return error if no strategy available', async () => {
      const result = await manager.extract(testExtractionContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No extraction strategy available');
    });

    it('should return error if strategy not registered', async () => {
      const result = await manager.extract(
        testExtractionContext,
        ExtractionStrategyType.COSINE_SIMILARITY
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not registered');
    });

    it('should return error if strategy not available', async () => {
      const unavailableStrategy = new MockStrategy(
        ExtractionStrategyType.CUSTOM,
        'Unavailable',
        false
      );
      manager.registerStrategy(unavailableStrategy);
      
      const result = await manager.extract(testExtractionContext, ExtractionStrategyType.CUSTOM);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should handle strategy errors gracefully', async () => {
      const failingStrategy = new MockStrategy(
        ExtractionStrategyType.CUSTOM,
        'Failing',
        true,
        false
      );
      manager.registerStrategy(failingStrategy);
      
      const result = await manager.extract(testExtractionContext, ExtractionStrategyType.CUSTOM);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should catch and handle exceptions', async () => {
      const throwingStrategy: IExtractionStrategy = {
        name: 'Throwing',
        type: ExtractionStrategyType.CUSTOM,
        isAvailable: () => true,
        extract: async () => {
          throw new Error('Strategy threw error');
        },
      };
      
      manager.registerStrategy(throwingStrategy);
      const result = await manager.extract(testExtractionContext, ExtractionStrategyType.CUSTOM);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Strategy threw error');
    });
  });

  describe('extractWithFallback', () => {
    it('should try strategies in order until one succeeds', async () => {
      const failingStrategy = new MockStrategy(
        ExtractionStrategyType.RULE_BASED,
        'Failing',
        true,
        false
      );
      manager.registerStrategy(failingStrategy);
      manager.registerStrategy(mockStrategy2);
      
      const result = await manager.extractWithFallback(testExtractionContext, [
        ExtractionStrategyType.RULE_BASED,
        ExtractionStrategyType.COSINE_SIMILARITY,
      ]);
      
      expect(result.success).toBe(true);
      expect(result.strategy).toBe(ExtractionStrategyType.COSINE_SIMILARITY);
    });

    it('should try available strategies if preferred strategies fail', async () => {
      const failingStrategy1 = new MockStrategy(
        ExtractionStrategyType.RULE_BASED,
        'Failing1',
        true,
        false
      );
      const failingStrategy2 = new MockStrategy(
        ExtractionStrategyType.COSINE_SIMILARITY,
        'Failing2',
        true,
        false
      );
      const successStrategy = new MockStrategy(ExtractionStrategyType.CUSTOM, 'Success');
      
      manager.registerStrategy(failingStrategy1);
      manager.registerStrategy(failingStrategy2);
      manager.registerStrategy(successStrategy);
      
      const result = await manager.extractWithFallback(testExtractionContext, [
        ExtractionStrategyType.RULE_BASED,
        ExtractionStrategyType.COSINE_SIMILARITY,
      ]);
      
      expect(result.success).toBe(true);
      expect(result.strategy).toBe(ExtractionStrategyType.CUSTOM);
    });

    it('should return error if all strategies fail', async () => {
      const failingStrategy1 = new MockStrategy(
        ExtractionStrategyType.RULE_BASED,
        'Failing1',
        true,
        false
      );
      const failingStrategy2 = new MockStrategy(
        ExtractionStrategyType.COSINE_SIMILARITY,
        'Failing2',
        true,
        false
      );
      
      manager.registerStrategy(failingStrategy1);
      manager.registerStrategy(failingStrategy2);
      
      const result = await manager.extractWithFallback(testExtractionContext, [
        ExtractionStrategyType.RULE_BASED,
        ExtractionStrategyType.COSINE_SIMILARITY,
      ]);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('All extraction strategies failed');
    });
  });

  describe('getAllStrategies', () => {
    it('should return all registered strategies', () => {
      manager.registerStrategy(mockStrategy1);
      manager.registerStrategy(mockStrategy2);
      
      const all = manager.getAllStrategies();
      
      expect(all).toContain(ExtractionStrategyType.RULE_BASED);
      expect(all).toContain(ExtractionStrategyType.COSINE_SIMILARITY);
    });
  });

  describe('hasStrategy', () => {
    it('should return true if strategy is registered', () => {
      manager.registerStrategy(mockStrategy1);
      expect(manager.hasStrategy(ExtractionStrategyType.RULE_BASED)).toBe(true);
    });

    it('should return false if strategy is not registered', () => {
      expect(manager.hasStrategy(ExtractionStrategyType.RULE_BASED)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all strategies', () => {
      manager.registerStrategy(mockStrategy1);
      manager.registerStrategy(mockStrategy2);
      manager.clear();
      
      expect(manager.getAllStrategies().length).toBe(0);
      expect(manager.getDefaultStrategyType()).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return statistics about strategies', () => {
      const unavailableStrategy = new MockStrategy(
        ExtractionStrategyType.CUSTOM,
        'Unavailable',
        false
      );
      
      manager.registerStrategy(mockStrategy1, true);
      manager.registerStrategy(unavailableStrategy);
      
      const stats = manager.getStats();
      
      expect(stats.totalStrategies).toBe(2);
      expect(stats.availableStrategies).toBe(1);
      expect(stats.defaultStrategy).toBe(ExtractionStrategyType.RULE_BASED);
      expect(stats.strategies.length).toBe(2);
    });
  });
});

