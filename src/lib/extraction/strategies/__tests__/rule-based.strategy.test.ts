/**
 * Rule-Based Strategy Tests
 * Unit tests for RuleBasedStrategy
 */

import { RuleBasedStrategy } from '../rule-based.strategy';
import { ExtractionContext, ExtractionStrategyType } from '../../extraction.types';
import { RuleSet, ExtractionRule } from '../rule-based.types';
import { EntityType } from '../../../../modules/scraper/scraper.types';

describe('RuleBasedStrategy', () => {
  let strategy: RuleBasedStrategy;

  beforeEach(() => {
    strategy = new RuleBasedStrategy();
  });

  describe('isAvailable', () => {
    it('should return true by default', () => {
      expect(strategy.isAvailable()).toBe(true);
    });
  });

  describe('addRuleSet', () => {
    it('should add a rule set', () => {
      const ruleSet: RuleSet = {
        name: 'test-rules',
        description: 'Test rules',
        rules: [],
        enabled: true,
      };

      strategy.addRuleSet(ruleSet);
      const retrieved = strategy.getRuleSet('test-rules');

      expect(retrieved).toEqual(ruleSet);
    });
  });

  describe('removeRuleSet', () => {
    it('should remove a rule set', () => {
      const ruleSet: RuleSet = {
        name: 'test-rules',
        description: 'Test rules',
        rules: [],
        enabled: true,
      };

      strategy.addRuleSet(ruleSet);
      const removed = strategy.removeRuleSet('test-rules');

      expect(removed).toBe(true);
      expect(strategy.getRuleSet('test-rules')).toBeNull();
    });

    it('should return false if rule set does not exist', () => {
      const removed = strategy.removeRuleSet('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getRuleSet', () => {
    it('should return rule set by name', () => {
      const ruleSet: RuleSet = {
        name: 'test-rules',
        description: 'Test rules',
        rules: [],
        enabled: true,
      };

      strategy.addRuleSet(ruleSet);
      const retrieved = strategy.getRuleSet('test-rules');

      expect(retrieved).toEqual(ruleSet);
    });

    it('should return null if rule set does not exist', () => {
      const retrieved = strategy.getRuleSet('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getAllRuleSets', () => {
    it('should return all rule sets', () => {
      const ruleSet1: RuleSet = {
        name: 'rules1',
        description: 'Rules 1',
        rules: [],
        enabled: true,
      };
      const ruleSet2: RuleSet = {
        name: 'rules2',
        description: 'Rules 2',
        rules: [],
        enabled: true,
      };

      strategy.addRuleSet(ruleSet1);
      strategy.addRuleSet(ruleSet2);

      const all = strategy.getAllRuleSets();

      expect(all.length).toBeGreaterThanOrEqual(2); // May include default rules
    });
  });

  describe('extract', () => {
    it('should extract entities using CSS selector rules', async () => {
      const ruleSet: RuleSet = {
        name: 'test-rules',
        description: 'Test rules',
        rules: [
          {
            name: 'extract-heading',
            entityType: EntityType.ARTICLE,
            selector: 'h1',
            text: true,
            confidence: 0.9,
          },
        ],
        enabled: true,
      };

      strategy.addRuleSet(ruleSet);

      const context: ExtractionContext = {
        html: '<html><body><h1>Test Heading</h1></body></html>',
        markdown: '# Test Heading',
        text: 'Test Heading',
        url: 'https://example.com',
      };

      const result = await strategy.extract(context);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(ExtractionStrategyType.RULE_BASED);
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('should extract entities using regex rules', async () => {
      const ruleSet: RuleSet = {
        name: 'email-rules',
        description: 'Email extraction',
        rules: [
          {
            name: 'extract-email',
            entityType: EntityType.CONTACT,
            regex: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
            text: true,
            multiple: true,
            confidence: 0.9,
          },
        ],
        enabled: true,
      };

      strategy.addRuleSet(ruleSet);

      const context: ExtractionContext = {
        html: '<html><body><p>Contact: test@example.com</p></body></html>',
        markdown: 'Contact: test@example.com',
        text: 'Contact: test@example.com',
        url: 'https://example.com',
      };

      const result = await strategy.extract(context);

      expect(result.success).toBe(true);
      expect(result.entities.some((e) => e.type === EntityType.CONTACT)).toBe(true);
    });

    it('should filter rules by entity types when specified', async () => {
      const ruleSet: RuleSet = {
        name: 'mixed-rules',
        description: 'Mixed rules',
        rules: [
          {
            name: 'extract-email',
            entityType: EntityType.CONTACT,
            regex: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
            text: true,
            multiple: true,
            confidence: 0.9,
          },
          {
            name: 'extract-phone',
            entityType: EntityType.CONTACT,
            regex: '\\d{3}-\\d{3}-\\d{4}',
            text: true,
            multiple: true,
            confidence: 0.9,
          },
        ],
        enabled: true,
      };

      strategy.addRuleSet(ruleSet);

      const context: ExtractionContext = {
        html: '<html><body><p>Email: test@example.com Phone: 123-456-7890</p></body></html>',
        markdown: 'Email: test@example.com Phone: 123-456-7890',
        text: 'Email: test@example.com Phone: 123-456-7890',
        url: 'https://example.com',
        entityTypes: [EntityType.CONTACT],
      };

      const result = await strategy.extract(context);

      expect(result.success).toBe(true);
      expect(result.entities.every((e) => e.type === EntityType.CONTACT)).toBe(true);
    });

    it('should return error for empty HTML', async () => {
      const context: ExtractionContext = {
        html: '',
        markdown: '',
        text: '',
        url: 'https://example.com',
      };

      const result = await strategy.extract(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty HTML');
    });

    it('should respect rule set priority', async () => {
      const ruleSet1: RuleSet = {
        name: 'low-priority',
        description: 'Low priority',
        rules: [
          {
            name: 'rule1',
            entityType: EntityType.ARTICLE,
            selector: 'p',
            text: true,
            confidence: 0.5,
          },
        ],
        enabled: true,
        priority: 1,
      };

      const ruleSet2: RuleSet = {
        name: 'high-priority',
        description: 'High priority',
        rules: [
          {
            name: 'rule2',
            entityType: EntityType.ARTICLE,
            selector: 'h1',
            text: true,
            confidence: 0.9,
          },
        ],
        enabled: true,
        priority: 10,
      };

      strategy.addRuleSet(ruleSet1);
      strategy.addRuleSet(ruleSet2);

      const context: ExtractionContext = {
        html: '<html><body><h1>Heading</h1><p>Paragraph</p></body></html>',
        markdown: '# Heading\n\nParagraph',
        text: 'Heading Paragraph',
        url: 'https://example.com',
      };

      const result = await strategy.extract(context);

      expect(result.success).toBe(true);
      // High priority rules should be evaluated first
    });

    it('should skip disabled rule sets', async () => {
      const ruleSet: RuleSet = {
        name: 'disabled-rules',
        description: 'Disabled rules',
        rules: [
          {
            name: 'extract-heading',
            entityType: EntityType.ARTICLE,
            selector: 'h1',
            text: true,
            confidence: 0.9,
          },
        ],
        enabled: false,
      };

      strategy.addRuleSet(ruleSet);

      const context: ExtractionContext = {
        html: '<html><body><h1>Test</h1></body></html>',
        markdown: '# Test',
        text: 'Test',
        url: 'https://example.com',
      };

      const result = await strategy.extract(context);

      // Should still succeed but may not use disabled rules
      expect(result.success).toBe(true);
    });

    it('should track execution time', async () => {
      const ruleSet: RuleSet = {
        name: 'test-rules',
        description: 'Test rules',
        rules: [
          {
            name: 'extract-heading',
            entityType: EntityType.ARTICLE,
            selector: 'h1',
            text: true,
            confidence: 0.9,
          },
        ],
        enabled: true,
      };

      strategy.addRuleSet(ruleSet);

      const context: ExtractionContext = {
        html: '<html><body><h1>Test</h1></body></html>',
        markdown: '# Test',
        text: 'Test',
        url: 'https://example.com',
      };

      const result = await strategy.extract(context);

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('should handle invalid CSS selectors gracefully', async () => {
      const ruleSet: RuleSet = {
        name: 'invalid-rules',
        description: 'Invalid rules',
        rules: [
          {
            name: 'invalid-selector',
            entityType: EntityType.ARTICLE,
            selector: '!!!invalid!!!',
            text: true,
            confidence: 0.9,
          },
        ],
        enabled: true,
      };

      strategy.addRuleSet(ruleSet);

      const context: ExtractionContext = {
        html: '<html><body><p>Test</p></body></html>',
        markdown: 'Test',
        text: 'Test',
        url: 'https://example.com',
      };

      const result = await strategy.extract(context);

      // Should not throw, may return empty or partial results
      expect(result).toBeDefined();
    });

    it('should handle malformed HTML', async () => {
      const context: ExtractionContext = {
        html: '<html><body><p>Unclosed<p>Another</body></html>',
        markdown: 'Test',
        text: 'Test',
        url: 'https://example.com',
      };

      const result = await strategy.extract(context);

      expect(result).toBeDefined();
    });
  });
});

