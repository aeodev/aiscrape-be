/**
 * Crawling Queue
 * Breadth-first search queue with depth tracking
 */

import { CrawlPage } from './crawling.types';

export class CrawlingQueue {
  private queue: CrawlPage[] = [];
  private urlSet: Set<string> = new Set();

  /**
   * Add page to queue (BFS order)
   */
  enqueue(page: CrawlPage): void {
    // Skip if already in queue
    if (this.urlSet.has(page.url)) {
      return;
    }

    this.queue.push(page);
    this.urlSet.add(page.url);
  }

  /**
   * Get next page from queue (FIFO for BFS)
   */
  dequeue(): CrawlPage | null {
    if (this.queue.length === 0) {
      return null;
    }

    const page = this.queue.shift()!;
    this.urlSet.delete(page.url);
    return page;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue = [];
    this.urlSet.clear();
  }

  /**
   * Get pages at specific depth
   */
  getByDepth(depth: number): CrawlPage[] {
    return this.queue.filter((page) => page.depth === depth);
  }

  /**
   * Check if URL is in queue
   */
  hasUrl(url: string): boolean {
    return this.urlSet.has(url);
  }

  /**
   * Get all queued URLs
   */
  getQueuedUrls(): string[] {
    return Array.from(this.urlSet);
  }

  /**
   * Remove URL from queue
   */
  removeUrl(url: string): boolean {
    if (!this.urlSet.has(url)) {
      return false;
    }

    this.queue = this.queue.filter((page) => page.url !== url);
    this.urlSet.delete(url);
    return true;
  }

  /**
   * Get next page without removing it (peek)
   */
  peek(): CrawlPage | null {
    return this.queue.length > 0 ? this.queue[0] : null;
  }
}



