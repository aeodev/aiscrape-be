/**
 * Extraction Strategy
 * Base interface and abstract class for extraction strategies
 */

import {
  ExtractionStrategyType,
  ExtractionContext,
  ExtractionResult,
} from './extraction.types';
import { IExtractedEntity, EntityType } from '../../modules/scraper/scraper.types';

/**
 * Extraction strategy interface
 */
export interface IExtractionStrategy {
  /**
   * Strategy name
   */
  name: string;

  /**
   * Strategy type
   */
  type: ExtractionStrategyType;

  /**
   * Extract entities from context
   */
  extract(context: ExtractionContext): Promise<ExtractionResult>;

  /**
   * Check if strategy is available/configured
   */
  isAvailable(): boolean;

  /**
   * Get strategy configuration (optional)
   */
  getConfig?(): Record<string, any>;
}

/**
 * Base extraction strategy class
 * Provides common functionality for all strategies
 */
export abstract class BaseExtractionStrategy implements IExtractionStrategy {
  abstract name: string;
  abstract type: ExtractionStrategyType;

  /**
   * Extract entities from context
   */
  abstract extract(context: ExtractionContext): Promise<ExtractionResult>;

  /**
   * Check if strategy is available
   */
  abstract isAvailable(): boolean;

  /**
   * Validate extracted entity
   */
  protected validateEntity(entity: IExtractedEntity): boolean {
    if (!entity || !entity.type || !entity.data) {
      return false;
    }

    // Validate entity type is valid
    if (!Object.values(EntityType).includes(entity.type)) {
      return false;
    }

    // Validate data is not empty
    if (typeof entity.data === 'object' && Object.keys(entity.data).length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Validate and filter entities
   */
  protected validateEntities(entities: IExtractedEntity[]): IExtractedEntity[] {
    return entities.filter((entity) => this.validateEntity(entity));
  }

  /**
   * Calculate overall confidence from entities
   */
  protected calculateConfidence(entities: IExtractedEntity[]): number {
    if (entities.length === 0) {
      return 0;
    }

    const confidences = entities
      .map((e) => e.confidence || 0.5)
      .filter((c) => c > 0);

    if (confidences.length === 0) {
      return 0.5; // Default confidence
    }

    // Average confidence
    const sum = confidences.reduce((a, b) => a + b, 0);
    return sum / confidences.length;
  }

  /**
   * Create error result
   */
  protected createErrorResult(error: string, executionTime: number = 0): ExtractionResult {
    return {
      entities: [],
      success: false,
      strategy: this.type,
      executionTime,
      error,
    };
  }

  /**
   * Create success result
   */
  protected createSuccessResult(
    entities: IExtractedEntity[],
    executionTime: number,
    metadata?: Record<string, any>
  ): ExtractionResult {
    const validatedEntities = this.validateEntities(entities);
    const confidence = this.calculateConfidence(validatedEntities);

    return {
      entities: validatedEntities,
      success: true,
      confidence,
      strategy: this.type,
      executionTime,
      metadata,
    };
  }

  /**
   * Get strategy configuration (optional)
   */
  getConfig?(): Record<string, any>;
}



