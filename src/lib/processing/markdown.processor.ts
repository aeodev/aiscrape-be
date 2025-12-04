/**
 * Markdown Processor
 * Enhanced HTML to Markdown converter using Turndown with GFM support
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// Use any for $ to support different Cheerio versions from Crawlee and standalone
type CheerioFunction = any;
type CheerioSelection = any;

export class MarkdownProcessor {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx', // Use # for headings
      codeBlockStyle: 'fenced', // Use ``` for code blocks
      bulletListMarker: '-', // Use - for bullet lists
      emDelimiter: '*', // Use * for emphasis
      strongDelimiter: '**', // Use ** for strong
      linkStyle: 'inlined', // Use inline links [text](url)
      linkReferenceStyle: 'full', // Use full reference links
      preformattedCode: false, // Don't preserve preformatted code blocks
    });

    // Add GFM plugin for GitHub Flavored Markdown support
    this.turndownService.use(gfm);

    // Configure custom rules for better conversion
    this.configureRules();
  }

  /**
   * Configure custom Turndown rules
   */
  private configureRules(): void {
    // Preserve tables (GFM plugin handles this, but we ensure it's enabled)
    this.turndownService.addRule('table', {
      filter: 'table',
      replacement: (content: string, node: any) => {
        return '\n\n' + content + '\n\n';
      },
    });

    // Better handling of images
    this.turndownService.addRule('image', {
      filter: 'img',
      replacement: (content: string, node: any) => {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        const title = node.getAttribute('title');
        const titlePart = title ? ` "${title}"` : '';
        return src ? `![${alt}](${src}${titlePart})` : '';
      },
    });

    // Better handling of code blocks
    this.turndownService.addRule('codeBlock', {
      filter: (node: any) => {
        return node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
      },
      replacement: (content: string, node: any) => {
        const code = node.firstChild.textContent || '';
        const language = node.firstChild.getAttribute('class')?.match(/language-(\w+)/)?.[1] || '';
        return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
      },
    });

    // Better handling of inline code
    this.turndownService.addRule('inlineCode', {
      filter: 'code',
      replacement: (content: string) => {
        return `\`${content}\``;
      },
    });

    // Preserve line breaks in paragraphs
    this.turndownService.addRule('paragraph', {
      filter: 'p',
      replacement: (content: string) => {
        return '\n\n' + content + '\n\n';
      },
    });

    // Better handling of blockquotes
    this.turndownService.addRule('blockquote', {
      filter: 'blockquote',
      replacement: (content: string) => {
        return '\n\n> ' + content.trim().replace(/\n/g, '\n> ') + '\n\n';
      },
    });

    // Better handling of horizontal rules
    this.turndownService.addRule('horizontalRule', {
      filter: 'hr',
      replacement: () => {
        return '\n\n---\n\n';
      },
    });
  }

  /**
   * Convert HTML string to Markdown
   */
  convert(html: string): string {
    if (!html || html.trim().length === 0) {
      return '';
    }

    try {
      const markdown = this.turndownService.turndown(html);
      return this.cleanMarkdown(markdown);
    } catch (error: any) {
      console.error('Markdown conversion error:', error.message);
      // Fallback to basic text extraction
      return this.fallbackConversion(html);
    }
  }

  /**
   * Convert Cheerio element to Markdown
   */
  convertFromCheerio($: CheerioFunction, element: CheerioSelection): string {
    try {
      // Get HTML string from Cheerio element
      const html = $.html(element) || element.html() || '';
      return this.convert(html);
    } catch (error: any) {
      console.error('Cheerio markdown conversion error:', error.message);
      // Fallback to basic text extraction
      return this.fallbackConversionFromCheerio($, element);
    }
  }

  /**
   * Clean up markdown output
   */
  private cleanMarkdown(markdown: string): string {
    return markdown
      // Remove excessive blank lines (more than 2 consecutive)
      .replace(/\n{3,}/g, '\n\n')
      // Remove leading/trailing whitespace
      .trim()
      // Clean up spaces around headings
      .replace(/\n(#{1,6})\s+/g, '\n$1 ')
      .replace(/\s+\n(#{1,6})/g, '\n$1')
      // Ensure proper spacing around lists
      .replace(/(\n)([-*+]|\d+\.)\s/g, '\n$2 ')
      // Clean up code blocks
      .replace(/```\s*\n/g, '```\n')
      .replace(/\n\s*```/g, '\n```');
  }

  /**
   * Fallback conversion for error cases
   */
  private fallbackConversion(html: string): string {
    // Basic HTML tag removal
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Fallback conversion from Cheerio element
   */
  private fallbackConversionFromCheerio($: CheerioFunction, element: CheerioSelection): string {
    return element.text() || '';
  }

  /**
   * Update Turndown configuration
   */
  updateConfig(options: Partial<TurndownService.Options>): void {
    // Create new instance with updated options
    const currentOptions = {
      headingStyle: this.turndownService.options.headingStyle,
      codeBlockStyle: this.turndownService.options.codeBlockStyle,
      bulletListMarker: this.turndownService.options.bulletListMarker,
      emDelimiter: this.turndownService.options.emDelimiter,
      strongDelimiter: this.turndownService.options.strongDelimiter,
      linkStyle: this.turndownService.options.linkStyle,
      linkReferenceStyle: this.turndownService.options.linkReferenceStyle,
      ...options,
    };

    this.turndownService = new TurndownService(currentOptions);
    this.turndownService.use(gfm);
    this.configureRules();
  }
}

// Export singleton instance
export const markdownProcessor = new MarkdownProcessor();

// Export convenience function for backward compatibility
export function htmlToMarkdown($: CheerioFunction, element: CheerioSelection): string {
  return markdownProcessor.convertFromCheerio($, element);
}

// Export function for HTML string conversion
export function htmlStringToMarkdown(html: string): string {
  return markdownProcessor.convert(html);
}




