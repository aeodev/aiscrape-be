/**
 * Crawling Types
 * Type definitions for multi-page crawling system
 */

/**
 * Crawling configuration interface
 */
export interface CrawlingConfig {
  /**
   * Maximum pages to visit
   */
  maxPages: number;

  /**
   * Maximum crawl depth
   */
  maxDepth: number;

  /**
   * Maximum AJAX endpoints to fetch
   */
  maxAjaxEndpoints: number;

  /**
   * Whether to follow external links
   */
  followExternalLinks: boolean;

  /**
   * Allowed domains (empty means same domain only)
   */
  allowedDomains: string[];

  /**
   * URL patterns to block (regex patterns)
   */
  blockedPatterns: string[];

  /**
   * Whether to respect robots.txt
   */
  respectRobotsTxt: boolean;

  /**
   * Delay in milliseconds between requests
   */
  delayBetweenRequests: number;

  /**
   * Request timeout in milliseconds
   */
  timeout: number;
}

/**
 * Crawling statistics interface
 */
export interface CrawlingStatistics {
  /**
   * Number of pages visited
   */
  pagesVisited: number;

  /**
   * Number of pages skipped
   */
  pagesSkipped: number;

  /**
   * Number of AJAX endpoints fetched
   */
  ajaxEndpointsFetched: number;

  /**
   * Number of links discovered
   */
  linksDiscovered: number;

  /**
   * Number of duplicates detected
   */
  duplicatesDetected: number;

  /**
   * Maximum depth reached
   */
  depthReached: number;

  /**
   * Total crawling time in milliseconds
   */
  totalTime: number;

  /**
   * Average time per page in milliseconds
   */
  averagePageTime: number;

  /**
   * Success rate (0-1)
   */
  successRate: number;
}

/**
 * Crawl page interface
 */
export interface CrawlPage {
  /**
   * Page URL
   */
  url: string;

  /**
   * Crawl depth (0 = starting page)
   */
  depth: number;

  /**
   * Parent URL (where this link was discovered)
   */
  parentUrl?: string;

  /**
   * When this page was discovered
   */
  discoveredAt: Date;

  /**
   * When this page was visited (if visited)
   */
  visitedAt?: Date;

  /**
   * Page status
   */
  status: 'pending' | 'visited' | 'skipped' | 'failed';

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Priority score (higher = more important)
   */
  priority?: number;
}



