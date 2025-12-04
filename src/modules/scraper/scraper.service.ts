/**
 * Scraper Service
 * Job orchestration with speed-first cascade:
 * HTTP+Cheerio (~100ms) → Jina Reader (~1-3s) → Playwright (~10-15s)
 */

import { scrapeRepository } from './scraper.repository';
import { getIO } from '../../lib/socket';
import { geminiService } from '../../lib/gemini';
import { extractionManager, ExtractionStrategyType } from '../../lib/extraction';
import { cacheManager } from '../../lib/cache';
import { createCircuitBreaker, CircuitState } from '../../lib/circuit-breaker';
import { ApiError } from '../../middleware/error-handler';
import { env } from '../../config/env';
import { createHash } from 'crypto';
import {
  IScrapeJob,
  ScrapeStatus,
  ScraperType,
  IExtractedEntity,
  IScrapeProgressEvent,
} from './scraper.types';
import { scraperActionsService } from './scraper-actions.service';
import { retryWithBackoff, addRandomDelay } from './utils';
import {
  scrapeWithHttp,
  scrapeWithJina,
  scrapeWithPlaywright,
  scrapeWithSmartPlaywright,
  scrapeWithCheerio,
  scrapeWithAIAgent,
  scrapeLinkedIn,
  type ScrapedResult,
} from './scrapers';
import { validateContent } from './utils/content-validator';

export class ScraperService {
  // Circuit breakers for critical operations
  private scraperCircuitBreaker = createCircuitBreaker(
    async (url: string, scraperType: ScraperType, options: any, emitProgress: any) => {
      // This will be wrapped around actual scraper calls
      throw new Error('Circuit breaker wrapper - use specific scraper circuit breakers');
    },
    {
      timeout: env.CIRCUIT_BREAKER_TIMEOUT * 3, // 30s for scrapers
      errorThresholdPercentage: env.CIRCUIT_BREAKER_ERROR_THRESHOLD,
      resetTimeout: env.CIRCUIT_BREAKER_RESET_TIMEOUT,
      minimumRequests: env.CIRCUIT_BREAKER_MIN_REQUESTS,
    }
  );

  private jinaCircuitBreaker = createCircuitBreaker(
    async (url: string, jobId: string, emitProgress: any, options: any) => {
      return await scrapeWithJina(url, jobId, emitProgress, options);
    },
    {
      timeout: 20000, // 20s for Jina API
      errorThresholdPercentage: env.CIRCUIT_BREAKER_ERROR_THRESHOLD,
      resetTimeout: env.CIRCUIT_BREAKER_RESET_TIMEOUT,
      minimumRequests: env.CIRCUIT_BREAKER_MIN_REQUESTS,
    }
  );

  private geminiCircuitBreaker = createCircuitBreaker(
    async (text: string, taskDescription: string) => {
      return await geminiService.extractData(text, taskDescription);
    },
    {
      timeout: env.CIRCUIT_BREAKER_TIMEOUT, // 10s for API calls
      errorThresholdPercentage: env.CIRCUIT_BREAKER_ERROR_THRESHOLD,
      resetTimeout: env.CIRCUIT_BREAKER_RESET_TIMEOUT,
      minimumRequests: env.CIRCUIT_BREAKER_MIN_REQUESTS,
    }
  );

  constructor() {
    // Log circuit breaker state changes
    this.scraperCircuitBreaker.on('open', () => {
      console.warn('Scraper circuit breaker opened - too many failures');
    });
    this.scraperCircuitBreaker.on('halfOpen', () => {
      console.log('Scraper circuit breaker half-open - testing recovery');
    });
    this.scraperCircuitBreaker.on('close', () => {
      console.log('Scraper circuit breaker closed - service recovered');
    });

    this.jinaCircuitBreaker.on('open', () => {
      console.warn('Jina API circuit breaker opened');
    });
    this.geminiCircuitBreaker.on('open', () => {
      console.warn('Gemini API circuit breaker opened');
    });
  }

  /**
   * Generate cache key for a scrape job
   */
  private generateCacheKey(url: string, scraperType: ScraperType, taskDescription?: string): string {
    const taskHash = taskDescription 
      ? createHash('sha256').update(taskDescription).digest('hex').substring(0, 8)
      : 'default';
    return `scrape:${url}:${scraperType}:${taskHash}`;
  }

  /**
   * Create a new scrape job
   */
  async createJob(
    url: string,
    options: {
      taskDescription?: string;
      scraperType?: ScraperType;
      userId?: string;
      sessionId?: string;
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
  ): Promise<IScrapeJob> {
    const job = await scrapeRepository.create({
      url,
      taskDescription: options.taskDescription || '',
      scraperType: options.scraperType || ScraperType.AUTO,
      userId: options.userId,
      sessionId: options.sessionId,
      status: ScrapeStatus.QUEUED,
      scrapeOptions: {
        useProxy: options.useProxy,
        blockResources: options.blockResources,
        includeScreenshots: options.includeScreenshots,
        linkedinAuth: options.linkedinAuth,
      },
    });

    this.emitProgress(job.id, {
      jobId: job.id,
      status: ScrapeStatus.QUEUED,
      message: 'Job created and queued',
      progress: 0,
    });

    // Start scraping asynchronously
    this.executeScrapeJob(job.id).catch((error) => {
      console.error(`Error executing job ${job.id}:`, error);
    });

    return job;
  }

  /**
   * Execute a scrape job with retry mechanism
   */
  private async executeScrapeJob(jobId: string): Promise<void> {
    return retryWithBackoff(async () => {
      return this.executeScrapeJobInternal(jobId);
    });
  }

  /**
   * Validate if scraped content is sufficient
   */
  private isValidContent(result: ScrapedResult | null): boolean {
    if (!result) return false;
    const textLength = result.text?.length || 0;
    const htmlLength = result.html?.length || 0;
    return textLength >= env.MIN_CONTENT_LENGTH || htmlLength >= 500;
  }

  /**
   * Execute cascade scraping: HTTP → Quality Check → Smart Playwright
   * Uses AI to validate if content is sufficient before escalating
   */
  private async executeCascadeScraping(
    url: string,
    jobId: string,
    options: { useProxy?: boolean; blockResources?: boolean; includeScreenshots?: boolean },
    taskDescription?: string
  ): Promise<ScrapedResult> {
    const emitProgress = this.emitProgress.bind(this);
    const userQuestion = taskDescription || 'Extract all relevant information';

    // Tier 1: HTTP + Cheerio (fastest, ~100ms)
    console.log(`Job ${jobId}: Trying Tier 1 - HTTP scraper...`);
    const httpResult = await scrapeWithHttp(url, jobId, emitProgress, options);
    
    if (this.isValidContent(httpResult)) {
      console.log(`Job ${jobId}: ✓ HTTP scraper got content, validating quality...`);
      
      // AI Quality Check: Does the content actually answer the question?
      emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: 'Validating content quality with AI...',
        progress: 50,
      });
      
      // Use enhanced validator
      const { contentValidator } = await import('../../lib/validation');
      const validationContext = {
        html: httpResult!.html || '',
        text: httpResult!.text || httpResult!.html || '',
        markdown: httpResult!.markdown || '',
        url: url,
        taskDescription: userQuestion,
        pageTitle: httpResult!.pageTitle,
      };
      
      const validationResult = await contentValidator.validateWithCache(validationContext);
      const validation = {
        sufficient: validationResult.sufficient,
        reason: validationResult.reason,
        needsInteraction: validationResult.needsInteraction,
        suggestedActions: validationResult.suggestedActions,
      };
      
      console.log(`Job ${jobId}: Content validation - sufficient: ${validation.sufficient}, reason: ${validation.reason}, quality score: ${validationResult.qualityScore.overall.toFixed(2)}, strategy: ${validationResult.validationStrategy}`);
      
      if (validation.sufficient) {
        console.log(`Job ${jobId}: ✓ Content is sufficient for the question`);
        return httpResult!;
      }
      
      // Content insufficient - escalate to Smart Playwright
      console.log(`Job ${jobId}: Content insufficient, escalating to Smart Playwright...`);
      console.log(`Job ${jobId}: Reason: ${validation.reason}`);
      if (validation.suggestedActions) {
        console.log(`Job ${jobId}: Suggested actions: ${validation.suggestedActions.join(', ')}`);
      }
    }

    // Tier 2: Smart Playwright with AI-guided interactions
    console.log(`Job ${jobId}: Trying Tier 2 - Smart Playwright (AI-guided)...`);
    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'Launching smart browser with AI guidance...',
      progress: 55,
    });
    
    try {
      const smartResult = await scrapeWithSmartPlaywright(url, jobId, userQuestion, emitProgress);
      console.log(`Job ${jobId}: ✓ Smart Playwright completed`);
      return smartResult;
    } catch (smartError: any) {
      console.log(`Job ${jobId}: Smart Playwright failed: ${smartError.message}, falling back to standard Playwright`);
    }

    // Tier 3: Standard Playwright (fallback)
    console.log(`Job ${jobId}: Trying Tier 3 - Standard Playwright (fallback)...`);
    const playwrightResult = await scrapeWithPlaywright(url, jobId, options, emitProgress);
    console.log(`Job ${jobId}: ✓ Playwright completed`);
    return playwrightResult;
  }

  /**
   * Internal execute scrape job implementation
   */
  private async executeScrapeJobInternal(jobId: string): Promise<void> {
    const startTime = Date.now();

    try {
      await scrapeRepository.updateStatus(jobId, ScrapeStatus.RUNNING);
      this.emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: 'Starting scrape...',
        progress: 10,
      });

      const job = await scrapeRepository.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      const scraperType = job.scraperType || ScraperType.AUTO;
      const emitProgress = this.emitProgress.bind(this);
      let scrapedData: ScrapedResult;
      let scraperUsed: ScraperType;

      // Check cache before scraping
      const cacheKey = this.generateCacheKey(job.url, scraperType, job.taskDescription);
      const cachedResult = await cacheManager.get<ScrapedResult>(cacheKey);
      
      if (cachedResult.data && cachedResult.fromCache) {
        console.log(`Job ${jobId}: Using cached result (TTL: ${cachedResult.ttl}s)`);
        scrapedData = cachedResult.data;
        scraperUsed = scraperType;
        
        // Update job with cached data
        await scrapeRepository.updateScrapedData(jobId, {
          html: scrapedData.html,
          markdown: scrapedData.markdown,
          text: scrapedData.text,
          screenshots: scrapedData.screenshots || [],
          metadata: {
            finalUrl: scrapedData.finalUrl,
            statusCode: scrapedData.statusCode,
            contentType: scrapedData.contentType,
            pageTitle: scrapedData.pageTitle,
            pageDescription: scrapedData.pageDescription,
            duration: 0,
            requestCount: scrapedData.requestCount || 1,
            dataSize: Buffer.byteLength(scrapedData.html || '', 'utf8'),
            screenshotCount: scrapedData.screenshots?.length || 0,
            retryCount: 0,
            scraperUsed,
            fromCache: true,
          },
        });
        
        await scrapeRepository.updateStatus(jobId, ScrapeStatus.COMPLETED);
        this.emitProgress(jobId, {
          jobId,
          status: ScrapeStatus.COMPLETED,
          message: `Job completed from cache`,
          progress: 100,
        });
        
        const completedJob = await scrapeRepository.findById(jobId);
        if (completedJob) {
          getIO().emit('scrape:complete', {
            jobId,
            status: ScrapeStatus.COMPLETED,
            job: completedJob,
          });
        }
        return;
      }

      this.emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: scraperType === ScraperType.AUTO ? 'Using cascade scraper (HTTP → Jina → Playwright)' : `Using ${scraperType} scraper`,
        progress: 20,
      });

      await addRandomDelay();

      // Check if this is a LinkedIn URL and has auth provided
      const isLinkedIn = job.url.includes('linkedin.com');
      const hasLinkedInAuth = job.scrapeOptions?.linkedinAuth?.cookies && job.scrapeOptions.linkedinAuth.cookies.length > 0;

      if (isLinkedIn && hasLinkedInAuth) {
        // Use LinkedIn-specific scraper
        console.log(`Job ${jobId}: Detected LinkedIn URL with authentication, using LinkedIn scraper`);
        emitProgress(jobId, {
          jobId,
          status: ScrapeStatus.RUNNING,
          message: 'Using LinkedIn authenticated scraper...',
          progress: 25,
        });
        
        scrapedData = await scrapeLinkedIn(
          job.url,
          jobId,
          job.scrapeOptions?.linkedinAuth!,
          emitProgress
        );
        scraperUsed = ScraperType.PLAYWRIGHT; // LinkedIn uses Playwright under the hood
      } else if (isLinkedIn && !hasLinkedInAuth) {
        const instructions = `
LinkedIn URLs require authentication. To scrape LinkedIn:

1. Get your LinkedIn cookies:
   - Open LinkedIn in your browser and log in
   - Open Developer Tools (F12)
   - Go to Application → Cookies → https://www.linkedin.com
   - Copy these cookies: li_at, JSESSIONID, bcookie

2. Or use browser console:
   document.cookie.split(';').map(c => {
     const [name, value] = c.trim().split('=');
     return { name, value, domain: '.linkedin.com', path: '/' };
   }).filter(c => ['li_at', 'JSESSIONID', 'bcookie'].includes(c.name))

3. Include cookies in your request:
   {
     "input": "https://www.linkedin.com/...",
     "linkedinAuth": {
       "cookies": [
         { "name": "li_at", "value": "YOUR_VALUE", "domain": ".linkedin.com", "path": "/" }
       ]
     }
   }

For detailed instructions, visit: GET /api/scrape/linkedin/instructions
`;
        throw new Error(instructions.trim());
      } else {
        // Execute scraping based on type
        switch (scraperType) {
        case ScraperType.HTTP:
          const httpResult = await scrapeWithHttp(job.url, jobId, emitProgress, job.scrapeOptions || {});
          if (!httpResult) throw new Error('HTTP scraper failed');
          scrapedData = httpResult;
          scraperUsed = ScraperType.HTTP;
          break;

        case ScraperType.JINA:
          try {
            const jinaResult = await this.jinaCircuitBreaker.execute(
              job.url,
              jobId,
              emitProgress,
              job.scrapeOptions || {}
            );
            if (!jinaResult) throw new Error('Jina Reader API failed');
            scrapedData = jinaResult;
            scraperUsed = ScraperType.JINA;
          } catch (cbError: any) {
            // Circuit breaker is open or request failed
            if (this.jinaCircuitBreaker.getState() === CircuitState.OPEN) {
              // Try to get cached result as fallback
              const cachedResult = await cacheManager.get<ScrapedResult>(cacheKey);
              if (cachedResult.data && cachedResult.fromCache) {
                console.log(`Job ${jobId}: Circuit breaker open, using cached result`);
                scrapedData = cachedResult.data;
                scraperUsed = ScraperType.JINA;
              } else {
                throw new Error(`Jina API circuit breaker is open. Please try again later. ${cbError.message}`);
              }
            } else {
              throw cbError;
            }
          }
          break;

        case ScraperType.PLAYWRIGHT:
          scrapedData = await scrapeWithPlaywright(job.url, jobId, job.scrapeOptions || {}, emitProgress);
          scraperUsed = ScraperType.PLAYWRIGHT;
          break;

        case ScraperType.CHEERIO:
          scrapedData = await scrapeWithCheerio(job.url, jobId, emitProgress, job.scrapeOptions || {});
          scraperUsed = ScraperType.CHEERIO;
          break;

        case ScraperType.AI_AGENT:
          const aiResult = await scrapeWithAIAgent(job.url, jobId, job.taskDescription || 'Extract all relevant data', emitProgress);
          scrapedData = aiResult;
          scraperUsed = ScraperType.AI_AGENT;
          break;

        case ScraperType.AUTO:
        default:
          // Use crawler orchestrator
          const { crawlerOrchestrator } = await import('../../lib/orchestration');
          const orchestrationContext = {
            url: job.url,
            jobId,
            taskDescription: job.taskDescription,
            options: job.scrapeOptions || {},
            emitProgress,
          };
          
          const orchestrationResult = await crawlerOrchestrator.orchestrate(orchestrationContext);
          scrapedData = orchestrationResult.result;
          scraperUsed = orchestrationResult.scraperUsed;
          break;
        }
      }

      // Validate scraped data
      if (!scrapedData.html || scrapedData.html.length < 100) {
        throw new Error(`Scraped content is too short (${scrapedData.html?.length || 0} bytes). The page may not have loaded correctly or is empty.`);
      }

      const duration = Date.now() - startTime;
      const dataSize = Buffer.byteLength(scrapedData.html || '', 'utf8');

      console.log(`Job ${jobId}: Scraped ${dataSize} bytes of HTML, ${scrapedData.text?.length || 0} chars of text in ${duration}ms using ${scraperUsed}`);

      // Cache the scraped result
      try {
        await cacheManager.set(cacheKey, scrapedData, env.CACHE_TTL);
        console.log(`Job ${jobId}: Cached result with key ${cacheKey} (TTL: ${env.CACHE_TTL}s)`);
      } catch (cacheError: any) {
        console.error(`Job ${jobId}: Failed to cache result:`, cacheError.message);
      }

      await scrapeRepository.updateScrapedData(jobId, {
        html: scrapedData.html,
        markdown: scrapedData.markdown,
        text: scrapedData.text,
        screenshots: scrapedData.screenshots || [],
        metadata: {
          finalUrl: scrapedData.finalUrl,
          statusCode: scrapedData.statusCode,
          contentType: scrapedData.contentType,
          pageTitle: scrapedData.pageTitle,
          pageDescription: scrapedData.pageDescription,
          duration,
          requestCount: scrapedData.requestCount || 1,
          dataSize,
          screenshotCount: scrapedData.screenshots?.length || 0,
          retryCount: 0,
          scraperUsed,
        },
      });

      this.emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: `Scraping completed in ${duration}ms using ${scraperUsed}`,
        progress: 80,
      });

      // AI extraction if available and requested
      let extractedEntities: IExtractedEntity[] = [];
      let aiProcessing = undefined;

      if (job.taskDescription) {
        try {
          this.emitProgress(jobId, {
            jobId,
            status: ScrapeStatus.RUNNING,
            message: 'Extracting data with AI...',
            progress: 90,
          });

          // Use extraction manager with fallback to direct Gemini service
          const extractionContext = {
            html: scrapedData.html || '',
            markdown: scrapedData.markdown || '',
            text: scrapedData.text || scrapedData.html || '',
            url: job.url,
            taskDescription: job.taskDescription,
          };

          // Try extraction manager first (if strategies are registered)
          const availableStrategies = extractionManager.getAvailableStrategies();
          let extractionResult;

          if (availableStrategies.length > 0) {
            // Use extraction manager with LLM strategy preferred
            extractionResult = await extractionManager.extractWithFallback(
              extractionContext,
              [ExtractionStrategyType.LLM, ...availableStrategies]
            );
          } else {
            // Fallback to direct Gemini service if no strategies registered yet
            if (geminiService.isAvailable()) {
              const aiStartTime = Date.now();
              try {
                const aiResult = await this.geminiCircuitBreaker.execute(
                  scrapedData.text || scrapedData.html || '',
                  job.taskDescription
                );
                extractionResult = {
                  entities: aiResult.entities,
                  success: aiResult.success,
                  strategy: ExtractionStrategyType.LLM,
                  executionTime: Date.now() - aiStartTime,
                  error: aiResult.error,
                  metadata: { modelName: aiResult.modelName },
                };
              } catch (cbError: any) {
                // Circuit breaker is open
                extractionResult = {
                  entities: [],
                  success: false,
                  strategy: ExtractionStrategyType.LLM,
                  executionTime: Date.now() - aiStartTime,
                  error: `Gemini API circuit breaker is open. ${cbError.message}`,
                };
              }
            } else {
              extractionResult = {
                entities: [],
                success: false,
                strategy: ExtractionStrategyType.LLM,
                executionTime: 0,
                error: 'No extraction strategies available',
              };
            }
          }

          extractedEntities = extractionResult.entities;
          aiProcessing = {
            model: extractionResult.metadata?.modelName || 'extraction-manager',
            prompt: job.taskDescription,
            response: (extractionResult.metadata as any)?.summary || '',
            processingTime: extractionResult.executionTime,
            success: extractionResult.success,
            error: extractionResult.error,
          };
        } catch (aiError: any) {
          console.error(`AI extraction failed for job ${jobId}:`, aiError);
          aiProcessing = {
            model: 'extraction-manager',
            prompt: job.taskDescription,
            response: '',
            processingTime: 0,
            success: false,
            error: aiError.message || 'AI extraction failed',
          };
        }
      }

      // Get circuit breaker stats for metadata
      const currentJob = await scrapeRepository.findById(jobId);
      const circuitBreakerStats = {
        scraper: this.scraperCircuitBreaker.getStats(),
        jina: this.jinaCircuitBreaker.getStats(),
        gemini: this.geminiCircuitBreaker.getStats(),
      };

      await scrapeRepository.updateScrapedData(jobId, {
        extractedEntities,
        aiProcessing,
        metadata: {
          duration: currentJob?.metadata?.duration ?? 0,
          requestCount: currentJob?.metadata?.requestCount ?? 0,
          dataSize: currentJob?.metadata?.dataSize ?? 0,
          screenshotCount: currentJob?.metadata?.screenshotCount ?? 0,
          retryCount: currentJob?.metadata?.retryCount ?? 0,
          ...currentJob?.metadata,
          circuitBreakerStats,
        },
      });

      await scrapeRepository.updateStatus(jobId, ScrapeStatus.COMPLETED);

      this.emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.COMPLETED,
        message: `Job completed in ${duration}ms`,
        progress: 100,
      });

      const completedJob = await scrapeRepository.findById(jobId);
      if (completedJob) {
        console.log(`Job ${jobId}: Final job state - HTML: ${completedJob.html?.length || 0} bytes, Text: ${completedJob.text?.length || 0} chars, Entities: ${completedJob.extractedEntities?.length || 0}`);
        getIO().emit('scrape:complete', {
          jobId,
          status: ScrapeStatus.COMPLETED,
          job: completedJob,
        });
      }
    } catch (error: any) {
      console.error(`Scrape job ${jobId} failed:`, error);

      await scrapeRepository.updateStatus(jobId, ScrapeStatus.FAILED, {
        metadata: {
          errorMessage: error.message,
          duration: Date.now() - startTime,
          requestCount: 0,
          dataSize: 0,
          screenshotCount: 0,
          retryCount: 0,
        },
      });

      getIO().emit('scrape:error', {
        jobId,
        error: error.message,
        status: ScrapeStatus.FAILED,
      });
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<IScrapeJob | null> {
    return await scrapeRepository.findById(jobId);
  }

  /**
   * Get jobs by user
   */
  async getJobsByUser(
    userId: string,
    options: { page?: number; limit?: number; status?: ScrapeStatus } = {}
  ): Promise<{ jobs: IScrapeJob[]; total: number }> {
    return await scrapeRepository.findByUserId(userId, options);
  }

  /**
   * Get jobs by session
   */
  async getJobsBySession(sessionId: string): Promise<IScrapeJob[]> {
    return await scrapeRepository.findBySessionId(sessionId);
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<IScrapeJob | null> {
    const job = await scrapeRepository.findById(jobId);
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }

    if (job.status === ScrapeStatus.COMPLETED) {
      return job;
    }

    if (job.status === ScrapeStatus.FAILED || job.status === ScrapeStatus.CANCELLED) {
      return job;
    }

    if (job.status !== ScrapeStatus.QUEUED && job.status !== ScrapeStatus.RUNNING) {
      throw new ApiError(400, `Cannot cancel job with status: ${job.status}. Only queued or running jobs can be cancelled.`);
    }

    const cancelledJob = await scrapeRepository.updateStatus(jobId, ScrapeStatus.CANCELLED);

    this.emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.CANCELLED,
      message: 'Job cancelled',
      progress: 0,
    });

    return cancelledJob;
  }

  /**
   * Delete a job
   */
  async deleteJob(jobId: string): Promise<boolean> {
    const job = await scrapeRepository.findById(jobId);
    if (job) {
      // Invalidate cache for this job
      const cacheKey = this.generateCacheKey(job.url, job.scraperType || ScraperType.AUTO, job.taskDescription);
      await cacheManager.delete(cacheKey).catch((err) => {
        console.error(`Failed to invalidate cache for job ${jobId}:`, err.message);
      });
    }
    return await scrapeRepository.delete(jobId);
  }

  /**
   * Get statistics
   */
  async getStatistics(userId?: string): Promise<any> {
    return await scrapeRepository.getStatistics(userId);
  }

  /**
   * Chat with a job
   */
  async chatWithJob(jobId: string, message: string): Promise<any> {
    const job = await scrapeRepository.findById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (!job.text && !job.markdown) {
      throw new Error('No content available to chat about');
    }

    const history = job.chatHistory || [];
    const context = job.text || job.markdown || '';
    const response = await geminiService.chat(context, history, message);

    const userMsg = { role: 'user', content: message, timestamp: new Date() };
    const aiMsg = { role: 'assistant', content: response, timestamp: new Date() };

    await scrapeRepository.updateScrapedData(jobId, {
      chatHistory: [...history, userMsg, aiMsg] as any,
    });

    return {
      response,
      history: [...history, userMsg, aiMsg],
    };
  }

  /**
   * Unified method: Scrape and answer in one request
   */
  async scrapeAndAnswer(
    input: string,
    options: {
      userId?: string;
      sessionId?: string;
      scraperType?: ScraperType;
      useProxy?: boolean;
      blockResources?: boolean;
      includeScreenshots?: boolean;
      forceRefresh?: boolean;
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
  ): Promise<{
    job?: IScrapeJob;
    response: string;
    url?: string;
    question?: string;
  }> {
    const urlMatch = input.match(/(https?:\/\/[^\s]+)/i);
    const url = urlMatch ? urlMatch[1] : null;
    const question = url ? input.replace(url, '').trim() : input.trim();

    if (!url && !question) {
      throw new Error('Please provide either a URL or a question');
    }

    let job: IScrapeJob | null = null;
    let context = '';

    if (url) {
      // Check cache first (skip if forceRefresh)
      if (!options.forceRefresh) {
        const scraperType = options.scraperType || ScraperType.AUTO;
        const taskDescription = question || 'Extract all relevant information';
        const cacheKey = this.generateCacheKey(url, scraperType, taskDescription);
        const cachedResult = await cacheManager.get<ScrapedResult>(cacheKey);
        
        if (cachedResult.data && cachedResult.fromCache) {
          console.log(`Using cached scrape result (TTL: ${cachedResult.ttl}s)`);
          context = cachedResult.data.text || cachedResult.data.markdown || '';
          // Create a minimal job object for response
          job = {
            id: 'cached',
            url,
            taskDescription,
            scraperType,
            status: ScrapeStatus.COMPLETED,
            text: cachedResult.data.text,
            markdown: cachedResult.data.markdown,
            html: cachedResult.data.html,
          } as any;
        }
      }

      // Check for recent job with same URL (skip if forceRefresh or cache hit)
      if (!job && options.sessionId && !options.forceRefresh) {
        const recentJobs = await this.getJobsBySession(options.sessionId);
        const recentJob = recentJobs
          .filter(j => j.url === url && j.status === ScrapeStatus.COMPLETED)
          .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))[0];

        if (recentJob && recentJob.completedAt) {
          const age = Date.now() - recentJob.completedAt.getTime();
          // Reduced cache to 5 minutes (was 1 hour) for faster iteration
          if (age < 300000) {
            job = recentJob;
            context = job.text || job.markdown || '';
            console.log(`Using cached job ${job.id} (${Math.round(age/1000)}s old)`);
          }
        }
      }

      if (!job) {
        job = await this.createJob(url, {
          taskDescription: question || 'Extract all relevant information',
          scraperType: options.scraperType || ScraperType.AUTO,
          userId: options.userId,
          sessionId: options.sessionId,
          useProxy: options.useProxy,
          blockResources: options.blockResources,
          includeScreenshots: options.includeScreenshots,
          linkedinAuth: options.linkedinAuth,
        });

        // Wait for job to complete (increased timeout for complex scrapes)
        const maxWaitTime = 120000; // Increased to 120s for complex scrapes
        const startTime = Date.now();
        const checkInterval = 500; // Check more frequently

        while (Date.now() - startTime < maxWaitTime) {
          const updatedJob = await this.getJob(job.id);
          if (updatedJob && updatedJob.status === ScrapeStatus.COMPLETED) {
            job = updatedJob;
            context = job.text || job.markdown || '';
            break;
          }
          if (updatedJob && updatedJob.status === ScrapeStatus.FAILED) {
            throw new Error(`Scraping failed: ${updatedJob.metadata?.errorMessage || 'Unknown error'}`);
          }
          await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        if (!context) {
          const finalJob = await this.getJob(job.id);
          if (finalJob) {
            job = finalJob;
            context = job.text || job.markdown || '';
          }
        }

        if (!context) {
          throw new Error('Scraping timed out or returned no content');
        }
      }
    } else {
      if (options.sessionId) {
        const recentJobs = await this.getJobsBySession(options.sessionId);
        const recentJob = recentJobs
          .filter(j => j.status === ScrapeStatus.COMPLETED && (j.text || j.markdown))
          .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))[0];

        if (recentJob) {
          job = recentJob;
          context = job.text || job.markdown || '';
        }
      }

      if (!context) {
        throw new Error('No URL provided and no previous scraped content available. Please provide a URL to scrape.');
      }
    }

    if (!geminiService.isAvailable()) {
      throw new Error('AI service is not available. Please configure GEMINI_API_KEY.');
    }

    const history = job?.chatHistory || [];
    const enhancedQuestion = question || 'Extract all relevant information from this page. Be thorough and provide structured data.';

    const response = await geminiService.chat(context, history, enhancedQuestion);

    if (job && job.id !== 'cached') {
      const userMsg = { role: 'user', content: enhancedQuestion, timestamp: new Date() };
      const aiMsg = { role: 'assistant', content: response, timestamp: new Date() };

      await scrapeRepository.updateScrapedData(job.id, {
        chatHistory: [...history, userMsg, aiMsg] as any,
      });
    }

    return {
      job: job || undefined,
      response,
      url: url || undefined,
      question: enhancedQuestion,
    };
  }

  /**
   * Emit progress via Socket.IO
   */
  private emitProgress(jobId: string, event: IScrapeProgressEvent): void {
    try {
      getIO().emit('scrape:progress', event);
      getIO().to(`job:${jobId}`).emit('scrape:progress', event);
    } catch (error) {
      console.error('Error emitting progress:', error);
    }
  }

  /**
   * Emit action event via Socket.IO
   */
  emitAction(
    jobId: string,
    type: 'OBSERVATION' | 'ACTION' | 'EXTRACTION' | 'ANALYSIS' | 'NAVIGATION' | 'CLICK' | 'WAIT',
    message: string,
    details?: Record<string, any>
  ): void {
    scraperActionsService.emitAction(jobId, type, message, details);
  }
}

export const scraperService = new ScraperService();
