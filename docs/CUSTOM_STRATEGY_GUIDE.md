# Custom Strategy Guide

## Overview

Custom strategies allow you to create your own extraction logic tailored to specific websites, data formats, or use cases. This guide will walk you through creating, implementing, and using custom extraction strategies.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Creating a Custom Strategy](#creating-a-custom-strategy)
3. [Template Class Reference](#template-class-reference)
4. [Examples](#examples)
5. [Best Practices](#best-practices)
6. [Common Patterns](#common-patterns)
7. [Troubleshooting](#troubleshooting)

## Quick Start

### Basic Example

```typescript
import { CustomStrategyTemplate } from './lib/extraction/strategies/custom-strategy.template';
import { ExtractionContext, ExtractionResult } from './lib/extraction/extraction.types';
import { EntityType } from './modules/scraper/scraper.types';

export class MyCustomStrategy extends CustomStrategyTemplate {
  name = 'My Custom Strategy';

  isAvailable(): boolean {
    return true; // Or check configuration
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    
    try {
      const html = context.html || '';
      const $ = this.parseHtml(html);
      
      const entities = [];
      
      // Your extraction logic here
      const title = $('h1').text().trim();
      if (title) {
        entities.push({
          type: EntityType.ARTICLE,
          data: { title },
          confidence: 0.9,
          source: 'my-custom-strategy',
        });
      }
      
      return this.createSuccessResult(entities, Date.now() - startTime);
    } catch (error: any) {
      return this.createErrorResult(error.message, Date.now() - startTime);
    }
  }
}
```

### Registering Your Strategy

```typescript
import { customStrategyRegistry } from './lib/extraction/strategies/custom-strategy.registry';
import { MyCustomStrategy } from './my-custom-strategy';

// Register your strategy
const myStrategy = new MyCustomStrategy();
customStrategyRegistry.registerCustomStrategy(myStrategy);

// Use it via extraction manager
import { extractionManager } from './lib/extraction';
const result = await extractionManager.extract(context, ExtractionStrategyType.CUSTOM);
```

## Creating a Custom Strategy

### Step 1: Extend the Template Class

```typescript
import { CustomStrategyTemplate } from './lib/extraction/strategies/custom-strategy.template';

export class MyStrategy extends CustomStrategyTemplate {
  name = 'My Strategy Name';
  
  // Implement required methods
  isAvailable(): boolean { }
  async extract(context: ExtractionContext): Promise<ExtractionResult> { }
}
```

### Step 2: Implement Required Methods

#### `isAvailable()`

Check if your strategy is available/configured:

```typescript
isAvailable(): boolean {
  // Check configuration, API keys, etc.
  return this.getConfig('enabled', true) !== false;
}
```

#### `extract(context: ExtractionContext)`

Main extraction logic:

```typescript
async extract(context: ExtractionContext): Promise<ExtractionResult> {
  const startTime = Date.now();
  
  try {
    // Your extraction logic
    const entities = [];
    
    // Use helper methods
    const html = context.html || '';
    const $ = this.parseHtml(html);
    
    // Extract entities
    // ...
    
    return this.createSuccessResult(entities, Date.now() - startTime);
  } catch (error: any) {
    return this.createErrorResult(error.message, Date.now() - startTime);
  }
}
```

### Step 3: Use Helper Methods

The template provides many helper methods:

```typescript
// Parse HTML
const $ = this.parseHtml(html);

// Extract text
const text = this.extractText(html);

// Extract JSON-LD
const jsonLd = this.extractJsonLd(html);

// Extract microdata
const microdata = this.extractMicrodata(html);

// Extract meta tags
const metaTags = this.extractMetaTags(html);

// Extract Open Graph tags
const ogTags = this.extractOpenGraph(html);

// Extract Twitter Card tags
const twitterTags = this.extractTwitterCard(html);

// Logging (only in development)
this.logExtraction('Processing...', data);

// Configuration
const value = this.getConfig('key', defaultValue);
const exists = this.hasConfig('key');
```

## Template Class Reference

### Abstract Methods (Must Implement)

- `name: string` - Strategy name
- `extract(context: ExtractionContext): Promise<ExtractionResult>` - Main extraction method
- `isAvailable(): boolean` - Availability check

### Protected Methods (Available in Subclass)

#### HTML Parsing
- `parseHtml(html: string): CheerioAPI` - Parse HTML with Cheerio
- `extractText(html: string): string` - Extract text content

#### Structured Data Extraction
- `extractJsonLd(html: string): any[]` - Extract JSON-LD data
- `extractMicrodata(html: string): any[]` - Extract microdata
- `extractJson(html: string): any[]` - Extract JSON from script tags

#### Meta Tags
- `extractMetaTags(html: string): Record<string, string>` - Extract all meta tags
- `extractOpenGraph(html: string): Record<string, string>` - Extract Open Graph tags
- `extractTwitterCard(html: string): Record<string, string>` - Extract Twitter Card tags

#### Utilities
- `logExtraction(message: string, data?: any): void` - Logging helper
- `getConfig(key: string, defaultValue?: any): any` - Get config value
- `hasConfig(key: string): boolean` - Check if config key exists

#### Result Creation (Inherited from BaseExtractionStrategy)
- `createSuccessResult(entities, executionTime, metadata?)` - Create success result
- `createErrorResult(error, executionTime)` - Create error result
- `validateEntities(entities)` - Validate entities
- `calculateConfidence(entities)` - Calculate confidence

## Examples

### Example 1: Simple Title Extractor

```typescript
export class TitleExtractorStrategy extends CustomStrategyTemplate {
  name = 'Title Extractor';

  isAvailable(): boolean {
    return true;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    
    const html = context.html || '';
    const $ = this.parseHtml(html);
    
    const title = $('title').text().trim() || 
                  $('h1').first().text().trim() ||
                  $('meta[property="og:title"]').attr('content') || '';
    
    if (!title) {
      return this.createErrorResult('No title found', Date.now() - startTime);
    }
    
    return this.createSuccessResult(
      [{
        type: EntityType.ARTICLE,
        data: { title },
        confidence: 0.9,
        source: 'title-extractor',
      }],
      Date.now() - startTime
    );
  }
}
```

### Example 2: JSON-LD Extractor

See `custom-strategy.example.ts` for a complete JSON-LD extraction example.

### Example 3: Microdata Extractor

See `custom-strategy.example.ts` for a complete microdata extraction example.

## Best Practices

### 1. Error Handling

Always wrap extraction logic in try-catch:

```typescript
async extract(context: ExtractionContext): Promise<ExtractionResult> {
  const startTime = Date.now();
  
  try {
    // Your logic
  } catch (error: any) {
    return this.createErrorResult(error.message, Date.now() - startTime);
  }
}
```

### 2. Confidence Scores

Use appropriate confidence scores:
- 0.9-1.0: Very reliable (structured data, exact matches)
- 0.7-0.9: Reliable (pattern matches, common selectors)
- 0.5-0.7: Moderate (heuristics, fuzzy matches)
- 0.0-0.5: Low (guesses, fallbacks)

### 3. Entity Validation

Use the built-in validation:

```typescript
const entities = this.validateEntities(rawEntities);
```

### 4. Logging

Use the logging helper for debugging:

```typescript
this.logExtraction('Processing step 1', { count: entities.length });
```

### 5. Configuration

Make strategies configurable:

```typescript
constructor(config?: Record<string, any>) {
  super(config);
}

isAvailable(): boolean {
  return this.getConfig('enabled', true) !== false;
}
```

## Common Patterns

### Pattern 1: Multi-Step Extraction

```typescript
async extract(context: ExtractionContext): Promise<ExtractionResult> {
  const startTime = Date.now();
  const entities = [];
  
  // Step 1: Extract from JSON-LD
  const jsonLd = this.extractJsonLd(context.html);
  entities.push(...this.parseJsonLd(jsonLd));
  
  // Step 2: Extract from HTML
  const $ = this.parseHtml(context.html);
  entities.push(...this.parseHtml($));
  
  // Step 3: Extract from meta tags
  const metaTags = this.extractMetaTags(context.html);
  entities.push(...this.parseMetaTags(metaTags));
  
  return this.createSuccessResult(entities, Date.now() - startTime);
}
```

### Pattern 2: Fallback Chain

```typescript
async extract(context: ExtractionContext): Promise<ExtractionResult> {
  const startTime = Date.now();
  const $ = this.parseHtml(context.html);
  
  // Try multiple selectors in order
  const title = $('meta[property="og:title"]').attr('content') ||
                $('meta[name="twitter:title"]').attr('content') ||
                $('title').text().trim() ||
                $('h1').first().text().trim();
  
  if (!title) {
    return this.createErrorResult('No title found', Date.now() - startTime);
  }
  
  // ...
}
```

### Pattern 3: Configuration-Based Extraction

```typescript
constructor(config?: Record<string, any>) {
  super(config);
  this.selectors = this.getConfig('selectors', {
    title: 'h1',
    description: 'meta[name="description"]',
  });
}

async extract(context: ExtractionContext): Promise<ExtractionResult> {
  const $ = this.parseHtml(context.html);
  const entities = [];
  
  if (this.selectors.title) {
    const title = $(this.selectors.title).text().trim();
    // ...
  }
  
  // ...
}
```

## Troubleshooting

### Issue: Strategy Not Found

**Problem:** Custom strategy not being used.

**Solution:**
1. Ensure strategy is registered: `customStrategyRegistry.registerCustomStrategy(strategy)`
2. Check strategy name is set correctly
3. Verify `isAvailable()` returns `true`

### Issue: Empty Results

**Problem:** Strategy returns no entities.

**Solution:**
1. Check HTML content is not empty
2. Verify selectors/XPath/regex are correct
3. Use `logExtraction()` to debug
4. Check entity validation isn't filtering out results

### Issue: Type Errors

**Problem:** TypeScript errors when extending template.

**Solution:**
1. Ensure all abstract methods are implemented
2. Check imports are correct
3. Verify entity types match `EntityType` enum

### Issue: Performance Problems

**Problem:** Strategy is slow.

**Solution:**
1. Cache parsed HTML if extracting multiple times
2. Use efficient selectors (avoid complex XPath)
3. Limit extraction to necessary data only
4. Consider async processing for large datasets

## Additional Resources

- See `custom-strategy.example.ts` for complete examples
- Check `extraction.types.ts` for type definitions
- Review `extraction.strategy.ts` for base class methods


