/**
 * Custom Strategy Examples
 * Example implementations of custom extraction strategies
 */

import { CustomStrategyTemplate } from './custom-strategy.template';
import {
  ExtractionContext,
  ExtractionResult,
} from '../extraction.types';
import { IExtractedEntity, EntityType } from '../../../modules/scraper/scraper.types';

/**
 * Example 1: Simple Custom Strategy
 * Demonstrates basic structure and usage
 */
export class ExampleCustomStrategy extends CustomStrategyTemplate {
  name = 'Example Custom Strategy';

  constructor(config?: Record<string, any>) {
    super(config);
  }

  isAvailable(): boolean {
    // Always available, or check config
    return this.getConfig('enabled', true) !== false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    this.logExtraction('Starting extraction');

    try {
      const html = context.html || '';
      if (!html) {
        return this.createErrorResult('Empty HTML content', Date.now() - startTime);
      }

      const entities: IExtractedEntity[] = [];

      // Example: Extract title
      const $ = this.parseHtml(html);
      const title = $('title').text().trim();

      if (title) {
        entities.push({
          type: EntityType.ARTICLE,
          data: { title },
          confidence: 0.9,
          source: 'example-strategy',
        });
      }

      // Example: Extract meta description
      const description = $('meta[name="description"]').attr('content');
      if (description) {
        entities.push({
          type: EntityType.ARTICLE,
          data: { description },
          confidence: 0.8,
          source: 'example-strategy',
        });
      }

      return this.createSuccessResult(entities, Date.now() - startTime, {
        extractedFields: ['title', 'description'],
      });
    } catch (error: any) {
      this.logExtraction('Extraction error', error);
      return this.createErrorResult(
        error.message || 'Unknown error',
        Date.now() - startTime
      );
    }
  }
}

/**
 * Example 2: JSON-LD Strategy
 * Extracts structured data from JSON-LD script tags
 */
export class JsonLdStrategy extends CustomStrategyTemplate {
  name = 'JSON-LD Extractor';

  constructor(config?: Record<string, any>) {
    super(config);
  }

  isAvailable(): boolean {
    return true; // Always available
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    this.logExtraction('Extracting JSON-LD data');

    try {
      const html = context.html || '';
      if (!html) {
        return this.createErrorResult('Empty HTML content', Date.now() - startTime);
      }

      const jsonLdData = this.extractJsonLd(html);
      const entities: IExtractedEntity[] = [];

      for (const data of jsonLdData) {
        const entity = this.convertJsonLdToEntity(data);
        if (entity) {
          entities.push(entity);
        }
      }

      return this.createSuccessResult(entities, Date.now() - startTime, {
        jsonLdItemsFound: jsonLdData.length,
      });
    } catch (error: any) {
      this.logExtraction('JSON-LD extraction error', error);
      return this.createErrorResult(
        error.message || 'Unknown error',
        Date.now() - startTime
      );
    }
  }

  /**
   * Convert JSON-LD data to entity
   */
  private convertJsonLdToEntity(data: any): IExtractedEntity | null {
    if (!data || !data['@type']) {
      return null;
    }

    const type = data['@type'].toLowerCase();
    let entityType: EntityType;
    let entityData: any = {};

    // Map schema.org types to entity types
    if (type.includes('organization') || type.includes('corporation')) {
      entityType = EntityType.COMPANY;
      entityData = {
        name: data.name,
        url: data.url,
        logo: data.logo,
        address: data.address,
        contactPoint: data.contactPoint,
      };
    } else if (type.includes('product')) {
      entityType = EntityType.PRODUCT;
      entityData = {
        name: data.name,
        description: data.description,
        price: data.offers?.price,
        currency: data.offers?.priceCurrency,
        image: data.image,
      };
    } else if (type.includes('article') || type.includes('blogposting')) {
      entityType = EntityType.ARTICLE;
      entityData = {
        title: data.headline || data.name,
        description: data.description,
        author: data.author?.name,
        datePublished: data.datePublished,
        dateModified: data.dateModified,
      };
    } else if (type.includes('person')) {
      entityType = EntityType.PERSON;
      entityData = {
        name: data.name,
        email: data.email,
        jobTitle: data.jobTitle,
        worksFor: data.worksFor?.name,
      };
    } else {
      // Default to custom
      entityType = EntityType.CUSTOM;
      entityData = data;
    }

    // Remove undefined values
    Object.keys(entityData).forEach((key) => {
      if (entityData[key] === undefined) {
        delete entityData[key];
      }
    });

    return {
      type: entityType,
      data: entityData,
      confidence: 0.95, // High confidence for structured data
      source: 'json-ld',
    };
  }
}

/**
 * Example 3: Microdata Strategy
 * Extracts structured data from HTML microdata attributes
 */
export class MicrodataStrategy extends CustomStrategyTemplate {
  name = 'Microdata Extractor';

  constructor(config?: Record<string, any>) {
    super(config);
  }

  isAvailable(): boolean {
    return true; // Always available
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    this.logExtraction('Extracting microdata');

    try {
      const html = context.html || '';
      if (!html) {
        return this.createErrorResult('Empty HTML content', Date.now() - startTime);
      }

      const microdataItems = this.extractMicrodata(html);
      const entities: IExtractedEntity[] = [];

      for (const item of microdataItems) {
        const entity = this.convertMicrodataToEntity(item);
        if (entity) {
          entities.push(entity);
        }
      }

      return this.createSuccessResult(entities, Date.now() - startTime, {
        microdataItemsFound: microdataItems.length,
      });
    } catch (error: any) {
      this.logExtraction('Microdata extraction error', error);
      return this.createErrorResult(
        error.message || 'Unknown error',
        Date.now() - startTime
      );
    }
  }

  /**
   * Convert microdata item to entity
   */
  private convertMicrodataToEntity(item: any): IExtractedEntity | null {
    if (!item || !item['@type']) {
      return null;
    }

    const type = item['@type'].toLowerCase();
    let entityType: EntityType;
    let entityData: any = {};

    // Map schema.org types to entity types
    if (type.includes('organization')) {
      entityType = EntityType.COMPANY;
      entityData = {
        name: item.name,
        url: item.url,
        logo: item.logo,
      };
    } else if (type.includes('product')) {
      entityType = EntityType.PRODUCT;
      entityData = {
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.priceCurrency,
      };
    } else if (type.includes('article')) {
      entityType = EntityType.ARTICLE;
      entityData = {
        title: item.headline || item.name,
        author: item.author,
        datePublished: item.datePublished,
      };
    } else if (type.includes('person')) {
      entityType = EntityType.PERSON;
      entityData = {
        name: item.name,
        email: item.email,
        jobTitle: item.jobTitle,
      };
    } else {
      entityType = EntityType.CUSTOM;
      entityData = item;
    }

    // Remove undefined values
    Object.keys(entityData).forEach((key) => {
      if (entityData[key] === undefined) {
        delete entityData[key];
      }
    });

    return {
      type: entityType,
      data: entityData,
      confidence: 0.85, // High confidence for structured data
      source: 'microdata',
    };
  }
}


