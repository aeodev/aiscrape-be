/**
 * Scraper interface and shared types
 */

import { IScrapeProgressEvent, ScrapeStatus } from '../scraper.types';

export interface ScrapedResult {
  html: string;
  markdown: string;
  text: string;
  finalUrl: string;
  statusCode: number;
  contentType?: string;
  pageTitle: string;
  pageDescription: string;
  screenshots?: string[];
  requestCount: number;
}

export interface ScraperOptions {
  useProxy?: boolean;
  blockResources?: boolean;
  includeScreenshots?: boolean;
}

export type ProgressEmitter = (jobId: string, event: IScrapeProgressEvent) => void;

