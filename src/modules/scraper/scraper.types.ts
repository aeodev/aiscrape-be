/**
 * Scraper Module Types
 * Comprehensive TypeScript interfaces for the AI scraping system
 */

import { Document } from 'mongoose';

// ============================================================================
// Enums
// ============================================================================

export enum ScrapeStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum ScraperType {
  HTTP = 'http',                   // Fastest: got-scraping + Cheerio (~100ms)
  JINA = 'jina',                   // Fast: Jina Reader API (~1-3s)
  PLAYWRIGHT = 'playwright',       // Slow: Full browser for JS-heavy sites (~10-15s)
  CHEERIO = 'cheerio',             // Legacy: Lightweight static pages
  AUTO = 'auto',                   // Cascade: HTTP → Jina → Playwright
  AI_AGENT = 'ai-agent',           // Smart: AI decides what to click and extract
}

export interface IChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export enum EntityType {
  COMPANY = 'company',
  PERSON = 'person',
  PRODUCT = 'product',
  ARTICLE = 'article',
  CONTACT = 'contact',
  PRICING = 'pricing',
  CUSTOM = 'custom',
}

// ============================================================================
// Core Interfaces
// ============================================================================

export interface IScrapeJob extends Document {
  url: string;
  taskDescription: string;
  status: ScrapeStatus;
  scraperType: ScraperType;

  // User context
  userId?: string;
  sessionId?: string;

  // Options used for this job
  scrapeOptions?: {
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
  };

  // Raw scraped data
  html?: string;
  markdown?: string;
  text?: string;
  screenshots?: string[];

  // Extracted structured data
  extractedEntities: IExtractedEntity[];

  // Metadata
  metadata: IScrapeMetadata;

  // AI processing
  aiProcessing?: IAIProcessing;
  chatHistory?: IChatMessage[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface IExtractedEntity {
  type: EntityType;
  data: ICompany | IPerson | IProduct | IArticle | IContact | IPricing | Record<string, any>;
  confidence?: number;
  source?: string;
}

export interface IScrapeMetadata {
  finalUrl?: string;              // After redirects
  statusCode?: number;
  contentType?: string;
  pageTitle?: string;
  pageDescription?: string;
  duration: number;                // In milliseconds
  requestCount: number;
  dataSize: number;                // In bytes
  screenshotCount: number;
  errorMessage?: string;
  retryCount: number;
  scraperUsed?: ScraperType;
  fromCache?: boolean;            // Whether result was served from cache
  circuitBreakerStats?: {         // Circuit breaker statistics
    scraper?: any;
    jina?: any;
    gemini?: any;
  };
}

export interface IAIProcessing {
  model: string;                   // e.g., "gpt-4", "claude-3-sonnet"
  prompt: string;
  response?: string;
  tokensUsed?: number;
  processingTime?: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// Entity Interfaces (Examples - customize based on your needs)
// ============================================================================

export interface ICompany {
  name: string;
  website?: string;
  description?: string;
  industry?: string;
  location?: string;
  foundedYear?: number;
  employeeCount?: string;
  logo?: string;
  socialMedia?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
  contacts?: IContact[];
}

export interface IPerson {
  name: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  twitter?: string;
  bio?: string;
  photo?: string;
}

export interface IProduct {
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  availability?: string;
  images?: string[];
  features?: string[];
  specifications?: Record<string, any>;
  url?: string;
}

export interface IArticle {
  title: string;
  author?: string;
  publishedDate?: Date;
  content?: string;
  summary?: string;
  tags?: string[];
  category?: string;
  images?: string[];
  url?: string;
}

export interface IContact {
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  postalCode?: string;
}

export interface IPricing {
  planName: string;
  price: number;
  currency: string;
  interval?: 'monthly' | 'yearly' | 'one-time';
  features?: string[];
  popular?: boolean;
}

// ============================================================================
// Request/Response Interfaces
// ============================================================================

export interface ICreateScrapeJobRequest {
  url: string;
  taskDescription?: string;
  scraperType?: ScraperType;
  extractEntities?: EntityType[];
  useAI?: boolean;
  aiModel?: string;
  includeScreenshots?: boolean;
  includeMarkdown?: boolean;
  useProxy?: boolean;
  blockResources?: boolean;
}

export interface IScrapeJobResponse {
  success: boolean;
  job?: IScrapeJob;
  error?: string;
}

export interface IScrapeListResponse {
  success: boolean;
  jobs?: IScrapeJob[];
  total?: number;
  page?: number;
  limit?: number;
  error?: string;
}

// ============================================================================
// Socket Event Interfaces
// ============================================================================

export interface IScrapeProgressEvent {
  jobId: string;
  status: ScrapeStatus;
  message: string;
  progress: number;              // 0-100
  metadata?: Partial<IScrapeMetadata>;
}

export interface IScrapeCompleteEvent {
  jobId: string;
  status: ScrapeStatus;
  job: IScrapeJob;
}

export interface IScrapeErrorEvent {
  jobId: string;
  error: string;
  status: ScrapeStatus;
}

export type ScrapeActionType = 
  | 'OBSERVATION' 
  | 'ACTION' 
  | 'EXTRACTION' 
  | 'ANALYSIS' 
  | 'NAVIGATION' 
  | 'CLICK' 
  | 'WAIT';

export interface IScrapeActionEvent {
  jobId: string;
  type: ScrapeActionType;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

// ============================================================================
// Crawlee Configuration Interfaces
// ============================================================================

export interface ICrawleeConfig {
  maxRequestsPerCrawl?: number;
  maxConcurrency?: number;
  requestHandlerTimeoutSecs?: number;
  navigationTimeoutSecs?: number;
  useProxy?: boolean;
  proxyUrls?: string[];
  userAgent?: string;
  headless?: boolean;
  screenshots?: boolean;
}

// ============================================================================
// Service Method Options
// ============================================================================

export interface IScrapeOptions {
  scraperType?: ScraperType;
  includeHtml?: boolean;
  includeMarkdown?: boolean;
  includeScreenshots?: boolean;
  waitForSelector?: string;
  scrollToBottom?: boolean;
  extractLinks?: boolean;
  timeout?: number;
  useProxy?: boolean;
  blockResources?: boolean;
  
  // Authentication options
  auth?: IAuthOptions;
}

export interface IAuthOptions {
  type: 'none' | 'basic' | 'bearer' | 'form' | 'cookie';
  
  // For basic auth
  username?: string;
  password?: string;
  
  // For bearer token
  token?: string;
  
  // For form-based login
  loginUrl?: string;
  formSelector?: string;
  usernameField?: string;
  passwordField?: string;
  extraFields?: Record<string, string>;
  successIndicator?: {
    type: 'url' | 'selector' | 'cookie';
    value: string;
  };
  
  // For cookie-based auth
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>;
}

export interface IAIExtractionOptions {
  model?: string;
  entityTypes?: EntityType[];
  prompt?: string;
  maxTokens?: number;
}


