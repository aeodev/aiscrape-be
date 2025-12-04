/**
 * Extraction Types
 * Type definitions for the extraction strategy system
 */

import { EntityType, IExtractedEntity } from '../../modules/scraper/scraper.types';

/**
 * Extraction strategy type enumeration
 */
export enum ExtractionStrategyType {
  LLM = 'llm',
  COSINE_SIMILARITY = 'cosine_similarity',
  RULE_BASED = 'rule_based',
  CUSTOM = 'custom',
}

/**
 * Extraction context - input data for extraction
 */
export interface ExtractionContext {
  html: string;
  markdown: string;
  text: string;
  url: string;
  taskDescription?: string;
  entityTypes?: EntityType[];
}

/**
 * Extraction result - output from extraction strategy
 */
export interface ExtractionResult {
  entities: IExtractedEntity[];
  success: boolean;
  confidence?: number; // Overall confidence score (0-1)
  strategy: ExtractionStrategyType;
  executionTime: number; // Execution time in milliseconds
  error?: string;
  metadata?: Record<string, any>; // Strategy-specific metadata
}


