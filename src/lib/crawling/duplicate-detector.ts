/**
 * Duplicate Detector
 * Efficient duplicate URL detection using normalized URLs
 */

import { normalizeUrl } from './url-normalizer';

export class DuplicateDetector {
  private visitedUrls: Set<string> = new Set();
  private duplicatesCount: number = 0;

  /**
   * Add a URL and return true if it's a duplicate
   */
  addUrl(url: string, baseUrl?: string): boolean {
    const normalized = normalizeUrl(url, baseUrl);
    
    if (this.visitedUrls.has(normalized)) {
      this.duplicatesCount++;
      return true;
    }
    
    this.visitedUrls.add(normalized);
    return false;
  }

  /**
   * Check if URL has already been visited
   */
  hasUrl(url: string, baseUrl?: string): boolean {
    const normalized = normalizeUrl(url, baseUrl);
    return this.visitedUrls.has(normalized);
  }

  /**
   * Get normalized version of URL
   */
  getNormalizedUrl(url: string, baseUrl?: string): string {
    return normalizeUrl(url, baseUrl);
  }

  /**
   * Clear all visited URLs
   */
  clear(): void {
    this.visitedUrls.clear();
    this.duplicatesCount = 0;
  }

  /**
   * Get statistics
   */
  getStats(): { total: number; duplicates: number } {
    return {
      total: this.visitedUrls.size,
      duplicates: this.duplicatesCount,
    };
  }

  /**
   * Get all visited URLs
   */
  getVisitedUrls(): string[] {
    return Array.from(this.visitedUrls);
  }

  /**
   * Get size of visited URLs set
   */
  size(): number {
    return this.visitedUrls.size;
  }
}


