/**
 * Cosine Similarity Extraction Strategy
 * Uses TF-IDF vectorization and cosine similarity to extract entities
 */

import { BaseExtractionStrategy } from '../extraction.strategy';
import {
  ExtractionStrategyType,
  ExtractionContext,
  ExtractionResult,
} from '../extraction.types';
import { IExtractedEntity, EntityType } from '../../../modules/scraper/scraper.types';
import { env } from '../../../config/env';
import {
  preprocessText,
  buildVocabulary,
  buildTFIDFVector,
  cosineSimilarity,
  splitIntoSentences,
  splitIntoParagraphs,
  extractEntitiesByPattern,
  calculateSegmentSimilarity,
} from './cosine-similarity.utils';

export class CosineSimilarityStrategy extends BaseExtractionStrategy {
  name = 'Cosine Similarity';
  type = ExtractionStrategyType.COSINE_SIMILARITY;

  private similarityThreshold: number;
  private maxEntities: number;
  private minSegmentLength: number;

  constructor() {
    super();
    this.similarityThreshold =
      parseFloat(process.env.COSINE_SIMILARITY_THRESHOLD || '0.3') || 0.3;
    this.maxEntities = parseInt(process.env.COSINE_SIMILARITY_MAX_ENTITIES || '50', 10) || 50;
    this.minSegmentLength =
      parseInt(process.env.COSINE_SIMILARITY_MIN_SEGMENT_LENGTH || '20', 10) || 20;
  }

  /**
   * Check if strategy is available (always available, no API key needed)
   */
  isAvailable(): boolean {
    return env.COSINE_SIMILARITY_ENABLED !== false;
  }

  /**
   * Extract entities using cosine similarity
   */
  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      // Get content (prefer text, fallback to markdown, then HTML)
      const content = context.text || context.markdown || context.html;

      if (!content || content.trim().length === 0) {
        return this.createErrorResult('Empty content provided', Date.now() - startTime);
      }

      // If no task description, extract all entities
      if (!context.taskDescription || context.taskDescription.trim().length === 0) {
        return this.extractAllEntities(content, Date.now() - startTime);
      }

      // Preprocess content and task description
      const contentTokens = preprocessText(content);
      const taskTokens = preprocessText(context.taskDescription);

      if (contentTokens.length === 0) {
        return this.createErrorResult('Content has no extractable tokens', Date.now() - startTime);
      }

      if (taskTokens.length === 0) {
        // Fallback to extracting all entities
        return this.extractAllEntities(content, Date.now() - startTime);
      }

      // Build vocabulary from both texts
      const vocabulary = buildVocabulary([contentTokens, taskTokens]);

      if (vocabulary.size === 0) {
        return this.createErrorResult('No vocabulary could be built', Date.now() - startTime);
      }

      // Build TF-IDF vectors
      const allDocuments = [contentTokens, taskTokens];
      const contentVector = buildTFIDFVector(contentTokens, vocabulary, allDocuments);
      const taskVector = buildTFIDFVector(taskTokens, vocabulary, allDocuments);

      // Calculate overall similarity
      const overallSimilarity = cosineSimilarity(contentVector, taskVector);

      // If overall similarity is below threshold, try segment-based extraction
      if (overallSimilarity < this.similarityThreshold) {
        return this.extractFromSegments(
          content,
          context.taskDescription,
          vocabulary,
          allDocuments,
          Date.now() - startTime
        );
      }

      // Extract entities from entire content
      const entities = this.extractEntitiesFromText(content, context.entityTypes, overallSimilarity);

      return this.createSuccessResult(entities, Date.now() - startTime, {
        overallSimilarity,
        extractionMethod: 'full_content',
      });
    } catch (error: any) {
      console.error('Cosine similarity extraction error:', error);
      return this.createErrorResult(
        error.message || 'Unknown error during cosine similarity extraction',
        Date.now() - startTime
      );
    }
  }

  /**
   * Extract entities from text segments
   */
  private extractFromSegments(
    content: string,
    taskDescription: string,
    vocabulary: Map<string, number>,
    allDocuments: string[][],
    startTime: number
  ): ExtractionResult {
    // Split content into sentences
    const sentences = splitIntoSentences(content);

    // Score each sentence
    const scoredSegments = sentences
      .map((sentence) => ({
        text: sentence,
        similarity: calculateSegmentSimilarity(sentence, taskDescription, vocabulary, allDocuments),
      }))
      .filter((segment) => segment.similarity >= this.similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10); // Top 10 segments

    if (scoredSegments.length === 0) {
      return this.createErrorResult(
        `No segments found with similarity >= ${this.similarityThreshold}`,
        Date.now() - startTime
      );
    }

    // Extract entities from top segments
    const allEntities: IExtractedEntity[] = [];
    for (const segment of scoredSegments) {
      const entities = this.extractEntitiesFromText(
        segment.text,
        undefined,
        segment.similarity
      );
      allEntities.push(...entities);
    }

    // Remove duplicates and limit
    const uniqueEntities = this.deduplicateEntities(allEntities).slice(0, this.maxEntities);

    const avgSimilarity =
      scoredSegments.reduce((sum, s) => sum + s.similarity, 0) / scoredSegments.length;

    return this.createSuccessResult(uniqueEntities, Date.now() - startTime, {
      overallSimilarity: avgSimilarity,
      extractionMethod: 'segments',
      segmentsAnalyzed: scoredSegments.length,
    });
  }

  /**
   * Extract all entities from text without task description filtering
   */
  private extractAllEntities(content: string, executionTime: number): ExtractionResult {
    const entities = this.extractEntitiesFromText(content, undefined, 0.5); // Default confidence

    return this.createSuccessResult(entities, executionTime, {
      overallSimilarity: 0.5,
      extractionMethod: 'pattern_matching',
    });
  }

  /**
   * Extract entities from text using pattern matching
   */
  private extractEntitiesFromText(
    text: string,
    entityTypes?: EntityType[],
    baseConfidence: number = 0.7
  ): IExtractedEntity[] {
    const entities: IExtractedEntity[] = [];
    const extracted = extractEntitiesByPattern(text);

    // Extract emails
    if (!entityTypes || entityTypes.includes(EntityType.CONTACT)) {
      for (const email of extracted.emails) {
        entities.push({
          type: EntityType.CONTACT,
          data: { email, type: 'email' },
          confidence: baseConfidence,
          source: 'pattern_match',
        });
      }
    }

    // Extract phones
    if (!entityTypes || entityTypes.includes(EntityType.CONTACT)) {
      for (const phone of extracted.phones) {
        entities.push({
          type: EntityType.CONTACT,
          data: { phone, type: 'phone' },
          confidence: baseConfidence,
          source: 'pattern_match',
        });
      }
    }

    // Extract URLs
    if (!entityTypes || entityTypes.includes(EntityType.CUSTOM)) {
      for (const url of extracted.urls) {
        entities.push({
          type: EntityType.CUSTOM,
          data: { url, type: 'url' },
          confidence: baseConfidence,
          source: 'pattern_match',
        });
      }
    }

    // Extract prices
    if (!entityTypes || entityTypes.includes(EntityType.PRICING)) {
      for (const price of extracted.prices) {
        entities.push({
          type: EntityType.PRICING,
          data: { price, value: price.replace(/[^0-9.]/g, '') },
          confidence: baseConfidence,
          source: 'pattern_match',
        });
      }
    }

    // Extract companies
    if (!entityTypes || entityTypes.includes(EntityType.COMPANY)) {
      for (const company of extracted.companies) {
        entities.push({
          type: EntityType.COMPANY,
          data: { name: company },
          confidence: baseConfidence * 0.9, // Slightly lower confidence for company names
          source: 'pattern_match',
        });
      }
    }

    // Extract dates
    if (!entityTypes || entityTypes.includes(EntityType.CUSTOM)) {
      for (const date of extracted.dates) {
        entities.push({
          type: EntityType.CUSTOM,
          data: { date, type: 'date' },
          confidence: baseConfidence,
          source: 'pattern_match',
        });
      }
    }

    return entities;
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
      similarityThreshold: this.similarityThreshold,
      maxEntities: this.maxEntities,
      minSegmentLength: this.minSegmentLength,
      enabled: this.isAvailable(),
    };
  }
}


