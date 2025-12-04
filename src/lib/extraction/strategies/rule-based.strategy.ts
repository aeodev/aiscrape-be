/**
 * Rule-Based Extraction Strategy
 * Uses CSS selectors, XPath, and regex patterns to extract entities
 */

import { BaseExtractionStrategy } from '../extraction.strategy';
import {
  ExtractionStrategyType,
  ExtractionContext,
  ExtractionResult,
} from '../extraction.types';
import { IExtractedEntity, EntityType } from '../../../modules/scraper/scraper.types';
import { env } from '../../../config/env';
import { RuleSet, ExtractionRule } from './rule-based.types';
import { evaluateRule } from './rule-based.utils';
import { getDefaultRuleSets } from './rule-based.rules';

export class RuleBasedStrategy extends BaseExtractionStrategy {
  name = 'Rule-Based';
  type = ExtractionStrategyType.RULE_BASED;

  private ruleSets: Map<string, RuleSet> = new Map();
  private defaultConfidence: number;
  private strictMode: boolean;

  constructor() {
    super();
    this.defaultConfidence =
      parseFloat(process.env.RULE_BASED_DEFAULT_CONFIDENCE || '0.8') || 0.8;
    this.strictMode = process.env.RULE_BASED_STRICT_MODE === 'true';

    // Load default rule sets
    const defaultRuleSets = getDefaultRuleSets();
    for (const ruleSet of defaultRuleSets) {
      this.addRuleSet(ruleSet);
    }
  }

  /**
   * Check if strategy is available (always available)
   */
  isAvailable(): boolean {
    return env.RULE_BASED_ENABLED !== false;
  }

  /**
   * Add a rule set
   */
  addRuleSet(ruleSet: RuleSet): void {
    this.ruleSets.set(ruleSet.name, ruleSet);
  }

  /**
   * Remove a rule set
   */
  removeRuleSet(name: string): boolean {
    return this.ruleSets.delete(name);
  }

  /**
   * Get a rule set by name
   */
  getRuleSet(name: string): RuleSet | null {
    return this.ruleSets.get(name) || null;
  }

  /**
   * Get all rule sets
   */
  getAllRuleSets(): RuleSet[] {
    return Array.from(this.ruleSets.values());
  }

  /**
   * Extract entities using rule-based extraction
   */
  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      // Get HTML content
      const html = context.html || '';

      if (!html || html.trim().length === 0) {
        return this.createErrorResult('Empty HTML content provided', Date.now() - startTime);
      }

      // Filter rule sets by entity types if specified
      let activeRuleSets = Array.from(this.ruleSets.values())
        .filter((rs) => rs.enabled !== false)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));

      // If entity types are specified, filter rules
      if (context.entityTypes && context.entityTypes.length > 0) {
        activeRuleSets = activeRuleSets.filter((rs) =>
          rs.rules.some((rule) => context.entityTypes!.includes(rule.entityType))
        );
      }

      // Extract entities from all rule sets
      const allEntities: IExtractedEntity[] = [];
      const failedRequiredRules: string[] = [];

      for (const ruleSet of activeRuleSets) {
        for (const rule of ruleSet.rules) {
          // Skip if entity type doesn't match filter
          if (context.entityTypes && !context.entityTypes.includes(rule.entityType)) {
            continue;
          }

          try {
            const values = evaluateRule(html, rule);

            if (values.length === 0) {
              if (rule.required && this.strictMode) {
                failedRequiredRules.push(`${ruleSet.name}.${rule.name}`);
              }
              continue;
            }

            // Create entities from extracted values
            for (const value of values) {
              const entity: IExtractedEntity = {
                type: rule.entityType,
                data: this.buildEntityData(rule, value),
                confidence: rule.confidence || this.defaultConfidence,
                source: `rule:${ruleSet.name}.${rule.name}`,
              };

              allEntities.push(entity);
            }
          } catch (error: any) {
            console.error(`Error evaluating rule ${ruleSet.name}.${rule.name}:`, error);
            if (rule.required && this.strictMode) {
              failedRequiredRules.push(`${ruleSet.name}.${rule.name}`);
            }
          }
        }
      }

      // Check for failed required rules
      if (failedRequiredRules.length > 0 && this.strictMode) {
        return this.createErrorResult(
          `Required rules failed: ${failedRequiredRules.join(', ')}`,
          Date.now() - startTime
        );
      }

      // Remove duplicates
      const uniqueEntities = this.deduplicateEntities(allEntities);

      return this.createSuccessResult(uniqueEntities, Date.now() - startTime, {
        ruleSetsUsed: activeRuleSets.map((rs) => rs.name),
        rulesEvaluated: allEntities.length,
        failedRequiredRules: failedRequiredRules.length,
      });
    } catch (error: any) {
      console.error('Rule-based extraction error:', error);
      return this.createErrorResult(
        error.message || 'Unknown error during rule-based extraction',
        Date.now() - startTime
      );
    }
  }

  /**
   * Build entity data from rule and value
   */
  private buildEntityData(rule: ExtractionRule, value: any): Record<string, any> {
    const data: Record<string, any> = {};

    // Determine data structure based on entity type
    switch (rule.entityType) {
      case EntityType.CONTACT:
        if (typeof value === 'string') {
          if (value.includes('@')) {
            data.email = value;
            data.type = 'email';
          } else if (/[\d-()]/.test(value)) {
            data.phone = value;
            data.type = 'phone';
          } else {
            data.value = value;
          }
        } else {
          data.value = value;
        }
        break;

      case EntityType.COMPANY:
        data.name = value;
        break;

      case EntityType.PRODUCT:
        data.name = value;
        break;

      case EntityType.PRICING:
        if (typeof value === 'number') {
          data.price = value;
        } else {
          data.value = value;
        }
        break;

      case EntityType.ARTICLE:
        data.title = value;
        break;

      case EntityType.PERSON:
        data.name = value;
        break;

      default:
        data.value = value;
        if (rule.metadata) {
          Object.assign(data, rule.metadata);
        }
    }

    return data;
  }

  /**
   * Remove duplicate entities
   */
  private deduplicateEntities(entities: IExtractedEntity[]): IExtractedEntity[] {
    const seen = new Set<string>();
    const unique: IExtractedEntity[] = [];

    for (const entity of entities) {
      const key = `${entity.type}:${JSON.stringify(entity.data)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(entity);
      }
    }

    return unique;
  }

  /**
   * Get strategy configuration
   */
  getConfig(): Record<string, any> {
    return {
      defaultConfidence: this.defaultConfidence,
      strictMode: this.strictMode,
      enabled: this.isAvailable(),
      ruleSets: Array.from(this.ruleSets.keys()),
      ruleSetCount: this.ruleSets.size,
    };
  }
}


