/**
 * Content Validation Types
 * Type definitions for enhanced content validation system
 */

/**
 * Validation strategy enumeration
 */
export enum ValidationStrategy {
  HEURISTIC = 'heuristic',
  RULE_BASED = 'rule_based',
  AI = 'ai',
  HYBRID = 'hybrid',
}

/**
 * Content quality score interface
 */
export interface ContentQualityScore {
  /**
   * Overall quality score (0-1)
   */
  overall: number;

  /**
   * Content completeness score (0-1)
   */
  completeness: number;

  /**
   * Relevance to task score (0-1)
   */
  relevance: number;

  /**
   * Structural quality score (0-1)
   */
  structure: number;

  /**
   * Content freshness score (0-1, optional)
   */
  freshness?: number;
}

/**
 * Validation rule interface
 */
export interface ValidationRule {
  /**
   * Rule name/identifier
   */
  name: string;

  /**
   * Rule type
   */
  type: 'heuristic' | 'pattern' | 'ai';

  /**
   * Check function
   */
  check: (context: ValidationContext) => RuleValidationResult;

  /**
   * Rule weight (0-1)
   */
  weight: number;

  /**
   * Whether rule is enabled
   */
  enabled: boolean;

  /**
   * Rule description
   */
  description?: string;
}

/**
 * Rule validation result
 */
export interface RuleValidationResult {
  /**
   * Whether rule passed
   */
  passed: boolean;

  /**
   * Score (0-1)
   */
  score: number;

  /**
   * Reason/message
   */
  reason?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Validation context interface
 */
export interface ValidationContext {
  /**
   * HTML content
   */
  html: string;

  /**
   * Text content
   */
  text: string;

  /**
   * Markdown content
   */
  markdown: string;

  /**
   * Source URL
   */
  url: string;

  /**
   * User's task/question
   */
  taskDescription?: string;

  /**
   * Page title
   */
  pageTitle?: string;

  /**
   * Content type
   */
  contentType?: string;
}

/**
 * Validation metrics interface
 */
export interface ValidationMetrics {
  /**
   * Content length (characters)
   */
  contentLength: number;

  /**
   * Number of HTML tags
   */
  htmlTags: number;

  /**
   * Number of words in text
   */
  textWords: number;

  /**
   * Number of links
   */
  linkCount: number;

  /**
   * Number of images
   */
  imageCount: number;

  /**
   * Number of forms
   */
  formCount: number;

  /**
   * Number of scripts
   */
  scriptCount: number;

  /**
   * Number of tables
   */
  tableCount?: number;

  /**
   * Number of lists
   */
  listCount?: number;
}

/**
 * Enhanced validation result interface
 */
export interface EnhancedValidationResult {
  /**
   * Whether content is sufficient
   */
  sufficient: boolean;

  /**
   * Reason for validation result
   */
  reason: string;

  /**
   * Whether interaction is needed
   */
  needsInteraction: boolean;

  /**
   * Suggested actions (if insufficient)
   */
  suggestedActions?: string[];

  /**
   * Quality scores
   */
  qualityScore: ContentQualityScore;

  /**
   * Validation strategy used
   */
  validationStrategy: ValidationStrategy;

  /**
   * Rules that were checked
   */
  rulesChecked: string[];

  /**
   * Validation metrics
   */
  metrics: ValidationMetrics;

  /**
   * Execution time in milliseconds
   */
  executionTime?: number;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Legacy content validation result (for backward compatibility)
 */
export interface ContentValidationResult {
  sufficient: boolean;
  reason: string;
  needsInteraction: boolean;
  suggestedActions?: string[];
}


