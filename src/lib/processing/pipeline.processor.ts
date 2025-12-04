/**
 * Processing Pipeline
 * Unified pipeline for orchestrating HTML processing, markdown conversion, and text extraction
 */

import { htmlProcessor, HtmlProcessorConfig, ProcessedHtml } from './html.processor';
import { markdownProcessor, htmlStringToMarkdown } from './markdown.processor';
import { textProcessor, TextProcessorConfig, ProcessedText } from './text.processor';

// Use any for $ to support different Cheerio versions
type CheerioFunction = any;
type CheerioSelection = any;

export interface PipelineConfig {
  enableHtmlProcessing?: boolean;
  enableMarkdownConversion?: boolean;
  enableTextExtraction?: boolean;
  htmlConfig?: HtmlProcessorConfig;
  markdownConfig?: any; // MarkdownProcessor doesn't expose config interface
  textConfig?: TextProcessorConfig;
  preserveOriginalHtml?: boolean;
  stopOnError?: boolean;
  extractMainContent?: boolean;
}

export interface PipelineMetadata {
  stagesExecuted: string[];
  executionTime: number;
  stageTimings: Record<string, number>;
  errors: Array<{ stage: string; error: string }>;
  htmlStats?: {
    originalLength: number;
    cleanLength?: number;
    mainContentLength?: number;
  };
  textStats?: {
    originalLength: number;
    processedLength: number;
  };
}

export interface PipelineResult {
  html: string;
  cleanHtml?: string;
  mainContent?: string;
  markdown: string;
  text: string;
  metadata: PipelineMetadata;
}

export class ProcessingPipeline {
  private config: Required<Omit<PipelineConfig, 'htmlConfig' | 'markdownConfig' | 'textConfig'>> & {
    htmlConfig?: HtmlProcessorConfig;
    markdownConfig?: any;
    textConfig?: TextProcessorConfig;
  };
  private stats = {
    totalExecutions: 0,
    totalErrors: 0,
    averageExecutionTime: 0,
  };

  constructor(config?: PipelineConfig) {
    this.config = {
      enableHtmlProcessing: config?.enableHtmlProcessing !== false,
      enableMarkdownConversion: config?.enableMarkdownConversion !== false,
      enableTextExtraction: config?.enableTextExtraction !== false,
      preserveOriginalHtml: config?.preserveOriginalHtml !== false,
      stopOnError: config?.stopOnError || false,
      extractMainContent: config?.extractMainContent !== false,
      htmlConfig: config?.htmlConfig,
      markdownConfig: config?.markdownConfig,
      textConfig: config?.textConfig,
    };
  }

  /**
   * Process HTML string through pipeline
   */
  async process(html: string, options?: Partial<PipelineConfig>): Promise<PipelineResult> {
    const startTime = Date.now();
    const config = { ...this.config, ...options };
    const stagesExecuted: string[] = [];
    const stageTimings: Record<string, number> = {};
    const errors: Array<{ stage: string; error: string }> = [];

    let currentHtml = html;
    let cleanHtml: string | undefined;
    let mainContent: string | undefined;
    let markdown = '';
    let text = '';
    let htmlStats: PipelineMetadata['htmlStats'] | undefined;
    let textStats: PipelineMetadata['textStats'] | undefined;

    // Stage 1: HTML Processing
    if (config.enableHtmlProcessing && html) {
      const stageStart = Date.now();
      try {
        const htmlConfig = config.htmlConfig || {
          removeScripts: true,
          removeStyles: true,
          removeComments: true,
          removeNoise: true,
          extractMainContent: config.extractMainContent,
        };

        const processed = htmlProcessor.process(currentHtml, htmlConfig);
        cleanHtml = processed.cleanHtml;
        mainContent = processed.mainContent;
        currentHtml = config.preserveOriginalHtml ? html : (cleanHtml || html);
        htmlStats = {
          originalLength: processed.metadata.originalLength,
          cleanLength: processed.metadata.cleanLength,
          mainContentLength: processed.metadata.mainContentLength,
        };

        stagesExecuted.push('html-processing');
        stageTimings['html-processing'] = Date.now() - stageStart;
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        errors.push({ stage: 'html-processing', error: errorMsg });
        console.error('Pipeline HTML processing error:', errorMsg);
        
        if (config.stopOnError) {
          throw error;
        }
        // Continue with original HTML
      }
    }

    // Stage 2: Markdown Conversion
    if (config.enableMarkdownConversion && currentHtml) {
      const stageStart = Date.now();
      try {
        // Use clean HTML if available, otherwise original
        const htmlForMarkdown = cleanHtml || currentHtml;
        markdown = htmlStringToMarkdown(htmlForMarkdown);
        
        stagesExecuted.push('markdown-conversion');
        stageTimings['markdown-conversion'] = Date.now() - stageStart;
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        errors.push({ stage: 'markdown-conversion', error: errorMsg });
        console.error('Pipeline markdown conversion error:', errorMsg);
        
        if (config.stopOnError) {
          throw error;
        }
        // Continue without markdown
      }
    }

    // Stage 3: Text Extraction
    if (config.enableTextExtraction) {
      const stageStart = Date.now();
      try {
        const textConfig = config.textConfig || {
          normalizeUnicode: true,
          cleanWhitespace: true,
          removeControlChars: true,
          normalizeLineBreaks: true,
          preserveParagraphs: true,
        };

        // Extract text from HTML (prefer clean HTML if available)
        const htmlForText = cleanHtml || mainContent || currentHtml;
        const extractedText = textProcessor.extractFromHtml(htmlForText, textConfig.preserveParagraphs);
        
        // Process the extracted text
        const processed = textProcessor.process(extractedText, textConfig);
        text = processed.text;
        textStats = {
          originalLength: processed.originalLength,
          processedLength: processed.processedLength,
        };

        stagesExecuted.push('text-extraction');
        stageTimings['text-extraction'] = Date.now() - stageStart;
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        errors.push({ stage: 'text-extraction', error: errorMsg });
        console.error('Pipeline text extraction error:', errorMsg);
        
        // Fallback: extract text directly from HTML
        try {
          text = textProcessor.extractFromHtml(currentHtml, false);
        } catch (fallbackError: any) {
          console.error('Pipeline text extraction fallback error:', fallbackError.message);
          text = '';
        }
        
        if (config.stopOnError && errors.length > 0) {
          throw error;
        }
      }
    }

    const executionTime = Date.now() - startTime;

    // Update statistics
    this.stats.totalExecutions++;
    if (errors.length > 0) {
      this.stats.totalErrors += errors.length;
    }
    this.stats.averageExecutionTime =
      (this.stats.averageExecutionTime * (this.stats.totalExecutions - 1) + executionTime) /
      this.stats.totalExecutions;

    return {
      html: config.preserveOriginalHtml ? html : (cleanHtml || html),
      cleanHtml,
      mainContent,
      markdown,
      text,
      metadata: {
        stagesExecuted,
        executionTime,
        stageTimings,
        errors,
        htmlStats,
        textStats,
      },
    };
  }

  /**
   * Process HTML from Cheerio element
   */
  async processWithCheerio(
    $: CheerioFunction,
    element: CheerioSelection,
    options?: Partial<PipelineConfig>
  ): Promise<PipelineResult> {
    try {
      // Get HTML from Cheerio element
      const html = $.html(element) || element.html() || '';
      return await this.process(html, options);
    } catch (error: any) {
      console.error('Pipeline Cheerio processing error:', error.message);
      // Fallback: extract text directly
      const text = element.text() || '';
      return {
        html: '',
        markdown: '',
        text,
        metadata: {
          stagesExecuted: [],
          executionTime: 0,
          stageTimings: {},
          errors: [{ stage: 'cheerio-extraction', error: error.message }],
        },
      };
    }
  }

  /**
   * Get pipeline statistics
   */
  getStats(): {
    totalExecutions: number;
    totalErrors: number;
    averageExecutionTime: number;
  } {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalExecutions: 0,
      totalErrors: 0,
      averageExecutionTime: 0,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export singleton instance with default configuration
export const processingPipeline = new ProcessingPipeline();

// Export convenience function
export function processContent(html: string, config?: PipelineConfig): Promise<PipelineResult> {
  const pipeline = config ? new ProcessingPipeline(config) : processingPipeline;
  return pipeline.process(html);
}

export function processContentWithCheerio(
  $: CheerioFunction,
  element: CheerioSelection,
  config?: PipelineConfig
): Promise<PipelineResult> {
  const pipeline = config ? new ProcessingPipeline(config) : processingPipeline;
  return pipeline.processWithCheerio($, element);
}



