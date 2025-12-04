/**
 * Rule-Based Extraction Types
 * Type definitions for rule-based extraction strategy
 */

import { EntityType } from '../../../modules/scraper/scraper.types';

/**
 * Extraction rule interface
 */
export interface ExtractionRule {
  /**
   * Rule identifier
   */
  name: string;

  /**
   * Target entity type
   */
  entityType: EntityType;

  /**
   * CSS selector (mutually exclusive with xpath and regex)
   */
  selector?: string;

  /**
   * XPath expression (mutually exclusive with selector and regex)
   */
  xpath?: string;

  /**
   * Regex pattern (mutually exclusive with selector and xpath)
   */
  regex?: string;

  /**
   * HTML attribute to extract (href, src, data-*, etc.)
   * If not specified, extracts text content
   */
  attribute?: string;

  /**
   * Extract text content (default: true if no attribute specified)
   */
  text?: boolean;

  /**
   * Transformation function or transformer name
   */
  transform?: string | ((value: string) => any);

  /**
   * Rule confidence (0-1)
   */
  confidence?: number;

  /**
   * Whether rule must match (strict mode)
   */
  required?: boolean;

  /**
   * Extract multiple matches (default: false)
   */
  multiple?: boolean;

  /**
   * Additional metadata for the rule
   */
  metadata?: Record<string, any>;
}

/**
 * Rule set interface
 */
export interface RuleSet {
  /**
   * Rule set name
   */
  name: string;

  /**
   * Rule set description
   */
  description?: string;

  /**
   * Array of extraction rules
   */
  rules: ExtractionRule[];

  /**
   * Rule set priority (higher = evaluated first)
   */
  priority?: number;

  /**
   * Whether this rule set is enabled
   */
  enabled?: boolean;
}

/**
 * Rule-based configuration interface
 */
export interface RuleBasedConfig {
  /**
   * Available rule sets
   */
  ruleSets: RuleSet[];

  /**
   * Default confidence for rules (0-1)
   */
  defaultConfidence?: number;

  /**
   * Fail if required rules don't match
   */
  strictMode?: boolean;
}



