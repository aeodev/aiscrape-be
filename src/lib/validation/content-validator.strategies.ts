/**
 * Content Validation Strategies
 * Different validation strategies for content quality assessment
 */

import {
  ValidationStrategy,
  ValidationContext,
  EnhancedValidationResult,
  ContentQualityScore,
  ValidationMetrics,
  RuleValidationResult,
} from './content-validator.types';
import { ValidationRule, getAllRules } from './content-validator.rules';
import { geminiService } from '../gemini';
import { getMetrics } from './content-validator.utils';

/**
 * Base validation strategy interface
 */
export interface IValidationStrategy {
  /**
   * Validate content
   */
  validate(context: ValidationContext): Promise<EnhancedValidationResult>;

  /**
   * Get strategy name
   */
  getStrategyName(): string;

  /**
   * Check if strategy is available
   */
  isAvailable(): boolean;
}

/**
 * Heuristic validation strategy
 * Fast rule-based validation using heuristics only
 */
export class HeuristicValidationStrategy implements IValidationStrategy {
  private rules: ValidationRule[];

  constructor() {
    this.rules = getAllRules().filter((r) => r.type === 'heuristic' && r.enabled);
  }

  getStrategyName(): string {
    return 'Heuristic';
  }

  isAvailable(): boolean {
    return true; // Always available
  }

  async validate(context: ValidationContext): Promise<EnhancedValidationResult> {
    const startTime = Date.now();
    const metrics = getMetrics(context);
    const ruleResults: Record<string, RuleValidationResult> = {};

    // Evaluate all rules
    for (const rule of this.rules) {
      try {
        ruleResults[rule.name] = rule.check(context);
      } catch (error: any) {
        console.error(`Error evaluating rule ${rule.name}:`, error);
        ruleResults[rule.name] = {
          passed: false,
          score: 0,
          reason: `Error: ${error.message}`,
        };
      }
    }

    // Calculate quality scores
    const qualityScore = this.calculateQualityScore(ruleResults);

    // Determine if sufficient
    const sufficient = qualityScore.overall >= parseFloat(process.env.CONTENT_VALIDATION_MIN_SCORE || '0.5');
    const needsInteraction = qualityScore.overall < 0.4;

    return {
      sufficient,
      reason: this.generateReason(qualityScore, ruleResults),
      needsInteraction,
      suggestedActions: sufficient ? undefined : this.generateSuggestedActions(ruleResults),
      qualityScore,
      validationStrategy: ValidationStrategy.HEURISTIC,
      rulesChecked: Object.keys(ruleResults),
      metrics,
      executionTime: Date.now() - startTime,
    };
  }

  private calculateQualityScore(ruleResults: Record<string, RuleValidationResult>): ContentQualityScore {
    const scores = {
      completeness: 0,
      relevance: 0,
      structure: 0,
      quality: 0,
    };
    const weights = {
      completeness: 0,
      relevance: 0,
      structure: 0,
      quality: 0,
    };

    // Categorize rules and calculate weighted scores
    for (const [ruleName, result] of Object.entries(ruleResults)) {
      const rule = this.rules.find((r) => r.name === ruleName);
      if (!rule) continue;

      const weight = rule.weight;
      const score = result.score;

      if (ruleName.includes('length') || ruleName.includes('word') || ruleName.includes('empty')) {
        scores.completeness += score * weight;
        weights.completeness += weight;
      } else if (ruleName.includes('keyword') || ruleName.includes('relevance') || ruleName.includes('title')) {
        scores.relevance += score * weight;
        weights.relevance += weight;
      } else if (ruleName.includes('structure') || ruleName.includes('semantic') || ruleName.includes('main')) {
        scores.structure += score * weight;
        weights.structure += weight;
      } else {
        scores.quality += score * weight;
        weights.quality += weight;
      }
    }

    // Normalize scores
    const completeness = weights.completeness > 0 ? scores.completeness / weights.completeness : 0.5;
    const relevance = weights.relevance > 0 ? scores.relevance / weights.relevance : 0.5;
    const structure = weights.structure > 0 ? scores.structure / weights.structure : 0.5;
    const quality = weights.quality > 0 ? scores.quality / weights.quality : 0.5;

    // Calculate overall (weighted average)
    const overall = completeness * 0.3 + relevance * 0.25 + structure * 0.2 + quality * 0.15;

    return {
      overall,
      completeness,
      relevance,
      structure,
      quality,
    };
  }

  private generateReason(qualityScore: ContentQualityScore, ruleResults: Record<string, RuleValidationResult>): string {
    const failedRules = Object.entries(ruleResults)
      .filter(([_, result]) => !result.passed)
      .map(([name, _]) => name);

    if (failedRules.length === 0) {
      return `Content quality good (score: ${qualityScore.overall.toFixed(2)})`;
    }

    return `Content quality: ${qualityScore.overall.toFixed(2)}. Failed rules: ${failedRules.slice(0, 3).join(', ')}`;
  }

  private generateSuggestedActions(ruleResults: Record<string, RuleValidationResult>): string[] {
    const actions: string[] = [];
    const failedRules = Object.entries(ruleResults).filter(([_, result]) => !result.passed);

    if (failedRules.some(([name]) => name.includes('dynamic') || name.includes('ajax'))) {
      actions.push('Use browser to render dynamic content');
    }
    if (failedRules.some(([name]) => name.includes('length') || name.includes('word'))) {
      actions.push('Check if content loaded completely');
    }
    if (failedRules.some(([name]) => name.includes('empty') || name.includes('placeholder'))) {
      actions.push('Verify page content is not placeholder');
    }

    return actions.length > 0 ? actions : ['Review content quality'];
  }
}

/**
 * Rule-based validation strategy
 * Comprehensive rule evaluation (all rule types except AI)
 */
export class RuleBasedValidationStrategy implements IValidationStrategy {
  private rules: ValidationRule[];

  constructor() {
    this.rules = getAllRules().filter((r) => r.type !== 'ai' && r.enabled);
  }

  getStrategyName(): string {
    return 'Rule-Based';
  }

  isAvailable(): boolean {
    return true; // Always available
  }

  async validate(context: ValidationContext): Promise<EnhancedValidationResult> {
    const startTime = Date.now();
    const metrics = getMetrics(context);
    const ruleResults: Record<string, RuleValidationResult> = {};

    // Evaluate all rules
    for (const rule of this.rules) {
      try {
        ruleResults[rule.name] = rule.check(context);
      } catch (error: any) {
        console.error(`Error evaluating rule ${rule.name}:`, error);
        ruleResults[rule.name] = {
          passed: false,
          score: 0,
          reason: `Error: ${error.message}`,
        };
      }
    }

    // Calculate quality scores (same as heuristic)
    const heuristicStrategy = new HeuristicValidationStrategy();
    const qualityScore = (heuristicStrategy as any).calculateQualityScore(ruleResults);

    const sufficient = qualityScore.overall >= parseFloat(process.env.CONTENT_VALIDATION_MIN_SCORE || '0.5');
    const needsInteraction = qualityScore.overall < 0.4;

    return {
      sufficient,
      reason: (heuristicStrategy as any).generateReason(qualityScore, ruleResults),
      needsInteraction,
      suggestedActions: sufficient ? undefined : (heuristicStrategy as any).generateSuggestedActions(ruleResults),
      qualityScore,
      validationStrategy: ValidationStrategy.RULE_BASED,
      rulesChecked: Object.keys(ruleResults),
      metrics,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * AI validation strategy
 * Uses AI (Gemini) for validation
 */
export class AIValidationStrategy implements IValidationStrategy {
  getStrategyName(): string {
    return 'AI';
  }

  isAvailable(): boolean {
    return geminiService.isAvailable();
  }

  async validate(context: ValidationContext): Promise<EnhancedValidationResult> {
    const startTime = Date.now();
    const metrics = getMetrics(context);

    if (!this.isAvailable()) {
      return {
        sufficient: true,
        reason: 'AI validation unavailable, proceeding with content',
        needsInteraction: false,
        qualityScore: {
          overall: 0.5,
          completeness: 0.5,
          relevance: 0.5,
          structure: 0.5,
        },
        validationStrategy: ValidationStrategy.AI,
        rulesChecked: [],
        metrics,
        executionTime: Date.now() - startTime,
      };
    }

    try {
      const prompt = `You are a content quality validator for a web scraper. Analyze if the scraped content can answer the user's question.

USER'S QUESTION: ${context.taskDescription || 'Extract all relevant information'}

PAGE TITLE: ${context.pageTitle || 'Unknown'}

SCRAPED CONTENT (first 3000 chars):
${context.text.substring(0, 3000)}

ANALYSIS TASK:
1. Does this content contain the actual DATA needed to answer the question?
2. Or does it only contain navigation/UI elements suggesting the data needs to be loaded dynamically?

Signs the content is INSUFFICIENT:
- Only shows category names but no actual items
- Says "click to view" or "select to load"
- Has empty tables or placeholder text
- Describes how to access data but doesn't contain the data itself
- Lists years/categories to choose from but no actual content for those years/categories

Signs the content is SUFFICIENT:
- Contains actual data items (names, numbers, descriptions)
- Has populated tables or lists with real content
- Directly answers or contains information to answer the question

Respond with ONLY valid JSON:
{
  "sufficient": true/false,
  "reason": "Brief explanation",
  "needsInteraction": true/false,
  "suggestedActions": ["action1", "action2"],
  "qualityScore": {
    "overall": 0.0-1.0,
    "completeness": 0.0-1.0,
    "relevance": 0.0-1.0,
    "structure": 0.0-1.0
  }
}

JSON:`;

      const response = await geminiService.chat('', [], prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        sufficient: result.sufficient ?? true,
        reason: result.reason || 'AI validation complete',
        needsInteraction: result.needsInteraction ?? false,
        suggestedActions: result.suggestedActions,
        qualityScore: result.qualityScore || {
          overall: result.sufficient ? 0.8 : 0.3,
          completeness: 0.7,
          relevance: 0.7,
          structure: 0.7,
        },
        validationStrategy: ValidationStrategy.AI,
        rulesChecked: ['ai-validation'],
        metrics,
        executionTime: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error('AI validation error:', error);
      return {
        sufficient: true,
        reason: 'AI validation failed, proceeding with content',
        needsInteraction: false,
        qualityScore: {
          overall: 0.5,
          completeness: 0.5,
          relevance: 0.5,
          structure: 0.5,
        },
        validationStrategy: ValidationStrategy.AI,
        rulesChecked: [],
        metrics,
        executionTime: Date.now() - startTime,
      };
    }
  }
}

/**
 * Hybrid validation strategy
 * Combines heuristic and AI validation
 */
export class HybridValidationStrategy implements IValidationStrategy {
  private heuristicStrategy: HeuristicValidationStrategy;
  private aiStrategy: AIValidationStrategy;

  constructor() {
    this.heuristicStrategy = new HeuristicValidationStrategy();
    this.aiStrategy = new AIValidationStrategy();
  }

  getStrategyName(): string {
    return 'Hybrid';
  }

  isAvailable(): boolean {
    return true; // Always available (falls back to heuristic if AI unavailable)
  }

  async validate(context: ValidationContext): Promise<EnhancedValidationResult> {
    const startTime = Date.now();

    // Run heuristic validation first (fast)
    const heuristicResult = await this.heuristicStrategy.validate(context);

    // If heuristic says sufficient with high confidence, return early
    if (heuristicResult.sufficient && heuristicResult.qualityScore.overall >= 0.7) {
      return {
        ...heuristicResult,
        validationStrategy: ValidationStrategy.HYBRID,
        executionTime: Date.now() - startTime,
      };
    }

    // If AI is available and heuristic is uncertain, use AI
    if (this.aiStrategy.isAvailable() && heuristicResult.qualityScore.overall < 0.7) {
      const aiResult = await this.aiStrategy.validate(context);

      // Combine results (weighted average)
      const combinedScore = {
        overall: (heuristicResult.qualityScore.overall * 0.4 + aiResult.qualityScore.overall * 0.6),
        completeness: (heuristicResult.qualityScore.completeness * 0.4 + aiResult.qualityScore.completeness * 0.6),
        relevance: (heuristicResult.qualityScore.relevance * 0.4 + aiResult.qualityScore.relevance * 0.6),
        structure: (heuristicResult.qualityScore.structure * 0.4 + aiResult.qualityScore.structure * 0.6),
        quality: (heuristicResult.qualityScore.quality || 0.5) * 0.4 + (aiResult.qualityScore.quality || 0.5) * 0.6,
      };

      return {
        sufficient: aiResult.sufficient && combinedScore.overall >= parseFloat(process.env.CONTENT_VALIDATION_MIN_SCORE || '0.5'),
        reason: `Hybrid validation: ${heuristicResult.reason}; AI: ${aiResult.reason}`,
        needsInteraction: heuristicResult.needsInteraction || aiResult.needsInteraction,
        suggestedActions: aiResult.suggestedActions || heuristicResult.suggestedActions,
        qualityScore: combinedScore,
        validationStrategy: ValidationStrategy.HYBRID,
        rulesChecked: [...heuristicResult.rulesChecked, ...aiResult.rulesChecked],
        metrics: heuristicResult.metrics,
        executionTime: Date.now() - startTime,
      };
    }

    // Fallback to heuristic only
    return {
      ...heuristicResult,
      validationStrategy: ValidationStrategy.HYBRID,
      executionTime: Date.now() - startTime,
    };
  }
}



