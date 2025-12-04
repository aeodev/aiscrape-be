/**
 * Link Discoverer
 * Enhanced link discovery from HTML content
 */

import * as cheerio from 'cheerio';
import { CrawlingConfig, CrawlPage } from './crawling.types';
import { normalizeUrl, resolveUrl, shouldFollowLink, isValidUrl } from './url-normalizer';

export class LinkDiscoverer {
  /**
   * Discover all links from HTML
   */
  discoverLinks(
    html: string,
    baseUrl: string,
    config: CrawlingConfig,
    currentDepth: number,
    visited: Set<string>
  ): CrawlPage[] {
    const $ = cheerio.load(html);
    const links: CrawlPage[] = [];

    // Find all anchor tags
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const absoluteUrl = resolveUrl(href, baseUrl);
        
        if (!isValidUrl(absoluteUrl)) {
          return;
        }

        const normalizedUrl = normalizeUrl(absoluteUrl, baseUrl);

        // Skip if already visited
        if (visited.has(normalizedUrl)) {
          return;
        }

        // Check if should follow
        if (!shouldFollowLink(absoluteUrl, baseUrl, config)) {
          return;
        }

        // Skip if beyond max depth
        if (currentDepth >= config.maxDepth) {
          return;
        }

        const linkText = $(el).text().trim();
        const linkTitle = $(el).attr('title') || linkText;

        links.push({
          url: normalizedUrl,
          depth: currentDepth + 1,
          parentUrl: baseUrl,
          discoveredAt: new Date(),
          status: 'pending',
          priority: this.calculatePriority(linkText, linkTitle, href),
        });
      } catch {
        // Skip invalid URLs
      }
    });

    return links;
  }

  /**
   * Discover AJAX endpoints from scripts and triggers
   */
  discoverAjaxEndpoints(
    baseUrl: string,
    scripts: string[],
    ajaxTriggers: Array<{ text: string; dataAttr?: string }>
  ): string[] {
    const endpoints: string[] = [];
    const seen = new Set<string>();

    // Extract from scripts
    for (const script of scripts) {
      // Look for common AJAX patterns
      const patterns = [
        /fetch\(['"]([^'"]+)['"]/g,
        /\.get\(['"]([^'"]+)['"]/g,
        /\.post\(['"]([^'"]+)['"]/g,
        /ajax\(['"]([^'"]+)['"]/g,
        /url:\s*['"]([^'"]+)['"]/g,
        /endpoint:\s*['"]([^'"]+)['"]/g,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(script)) !== null) {
          const endpoint = match[1];
          if (endpoint && !endpoint.startsWith('javascript:') && !endpoint.startsWith('#')) {
            try {
              const absoluteUrl = resolveUrl(endpoint, baseUrl);
              const normalized = normalizeUrl(absoluteUrl, baseUrl);
              if (!seen.has(normalized)) {
                seen.add(normalized);
                endpoints.push(normalized);
              }
            } catch {
              // Skip invalid URLs
            }
          }
        }
      }
    }

    // Extract from data attributes in ajaxTriggers
    for (const trigger of ajaxTriggers) {
      if (trigger.dataAttr) {
        // Try to extract URL from data attribute
        const urlMatch = trigger.dataAttr.match(/['"](https?:\/\/[^'"]+)['"]/);
        if (urlMatch) {
          try {
            const normalized = normalizeUrl(urlMatch[1], baseUrl);
            if (!seen.has(normalized)) {
              seen.add(normalized);
              endpoints.push(normalized);
            }
          } catch {
            // Skip invalid URLs
          }
        }
      }
    }

    return endpoints;
  }

  /**
   * Discover iframe/frame URLs
   */
  discoverFrameUrls(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const frameUrls: string[] = [];
    const seen = new Set<string>();

    $('iframe[src], frame[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (!src) return;

      try {
        const absoluteUrl = resolveUrl(src, baseUrl);
        const normalized = normalizeUrl(absoluteUrl, baseUrl);
        
        if (!seen.has(normalized) && isValidUrl(absoluteUrl)) {
          seen.add(normalized);
          frameUrls.push(normalized);
        }
      } catch {
        // Skip invalid URLs
      }
    });

    return frameUrls;
  }

  /**
   * Filter links based on config and visited set
   */
  filterLinks(
    links: CrawlPage[],
    config: CrawlingConfig,
    visited: Set<string>,
    baseUrl: string
  ): CrawlPage[] {
    return links.filter((link) => {
      // Skip if already visited
      if (visited.has(link.url)) {
        return false;
      }

      // Skip if beyond max depth
      if (link.depth > config.maxDepth) {
        return false;
      }

      // Check if should follow
      return shouldFollowLink(link.url, baseUrl, config);
    });
  }

  /**
   * Prioritize links based on relevance to task
   */
  prioritizeLinks(links: CrawlPage[], taskDescription?: string): CrawlPage[] {
    if (!taskDescription || taskDescription.trim().length === 0) {
      // If no task description, return links sorted by priority (if set)
      return links.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    const taskWords = taskDescription
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Calculate relevance score for each link
    const scoredLinks = links.map((link) => {
      const urlLower = link.url.toLowerCase();
      const urlWords = urlLower.split(/[/\-_\.]/).filter((w) => w.length > 2);

      // Count matching words
      let relevanceScore = 0;
      for (const taskWord of taskWords) {
        if (urlWords.some((urlWord) => urlWord.includes(taskWord) || taskWord.includes(urlWord))) {
          relevanceScore += 2;
        }
        if (urlLower.includes(taskWord)) {
          relevanceScore += 1;
        }
      }

      return {
        ...link,
        priority: (link.priority || 0) + relevanceScore,
      };
    });

    // Sort by priority (highest first)
    return scoredLinks.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Calculate base priority for a link
   */
  private calculatePriority(linkText: string, linkTitle: string, href: string): number {
    let priority = 0;

    // Higher priority for links with meaningful text
    if (linkText.length > 5 && linkText.length < 100) {
      priority += 1;
    }

    // Higher priority for common content indicators
    const contentIndicators = ['read', 'more', 'view', 'details', 'article', 'post', 'page'];
    const textLower = (linkText + ' ' + linkTitle).toLowerCase();
    if (contentIndicators.some((indicator) => textLower.includes(indicator))) {
      priority += 2;
    }

    // Lower priority for common non-content links
    const nonContentIndicators = ['login', 'signup', 'register', 'logout', 'cart', 'checkout'];
    if (nonContentIndicators.some((indicator) => textLower.includes(indicator))) {
      priority -= 2;
    }

    // Higher priority for numeric patterns (often pagination or IDs)
    if (/\d+/.test(href)) {
      priority += 1;
    }

    return priority;
  }
}



