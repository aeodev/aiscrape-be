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
  linkedinAuth?: {
    cookies?: Array<{
      name: string;
      value: string;
      domain?: string;
      path?: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>;
    sessionStorage?: Record<string, string>;
    localStorage?: Record<string, string>;
  };
}

export type ProgressEmitter = (jobId: string, event: IScrapeProgressEvent) => void;




