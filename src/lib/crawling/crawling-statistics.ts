/**
 * Crawling Statistics Tracker
 * Track comprehensive crawling statistics
 */

import { CrawlingStatistics } from './crawling.types';

export class CrawlingStatisticsTracker {
  private startTime: number;
  private pagesVisited: number = 0;
  private pagesSkipped: number = 0;
  private pagesFailed: number = 0;
  private ajaxEndpointsFetched: number = 0;
  private linksDiscovered: number = 0;
  private duplicatesDetected: number = 0;
  private maxDepthReached: number = 0;
  private pageTimes: number[] = [];

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Record a page visit
   */
  recordPageVisit(depth: number, time: number): void {
    this.pagesVisited++;
    this.maxDepthReached = Math.max(this.maxDepthReached, depth);
    this.pageTimes.push(time);
  }

  /**
   * Record a skipped page
   */
  recordSkipped(): void {
    this.pagesSkipped++;
  }

  /**
   * Record a failed page
   */
  recordFailed(): void {
    this.pagesFailed++;
  }

  /**
   * Record an AJAX endpoint fetch
   */
  recordAjaxFetch(): void {
    this.ajaxEndpointsFetched++;
  }

  /**
   * Record link discovery
   */
  recordLinkDiscovery(count: number): void {
    this.linksDiscovered += count;
  }

  /**
   * Record duplicate detection
   */
  recordDuplicate(): void {
    this.duplicatesDetected++;
  }

  /**
   * Get final statistics
   */
  getStatistics(): CrawlingStatistics {
    const totalTime = Date.now() - this.startTime;
    const averagePageTime =
      this.pageTimes.length > 0
        ? this.pageTimes.reduce((sum, time) => sum + time, 0) / this.pageTimes.length
        : 0;

    const totalAttempts = this.pagesVisited + this.pagesFailed;
    const successRate = totalAttempts > 0 ? this.pagesVisited / totalAttempts : 0;

    return {
      pagesVisited: this.pagesVisited,
      pagesSkipped: this.pagesSkipped,
      ajaxEndpointsFetched: this.ajaxEndpointsFetched,
      linksDiscovered: this.linksDiscovered,
      duplicatesDetected: this.duplicatesDetected,
      depthReached: this.maxDepthReached,
      totalTime,
      averagePageTime,
      successRate,
    };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.startTime = Date.now();
    this.pagesVisited = 0;
    this.pagesSkipped = 0;
    this.pagesFailed = 0;
    this.ajaxEndpointsFetched = 0;
    this.linksDiscovered = 0;
    this.duplicatesDetected = 0;
    this.maxDepthReached = 0;
    this.pageTimes = [];
  }
}



