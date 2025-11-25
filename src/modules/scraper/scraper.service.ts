/**
 * Scraper Service
 * Job orchestration with speed-first cascade:
 * HTTP+Cheerio (~100ms) → Jina Reader (~1-3s) → Playwright (~10-15s)
 */

import { scrapeRepository } from './scraper.repository';
import { getIO } from '../../lib/socket';
import { geminiService } from '../../lib/gemini';
import { ApiError } from '../../middleware/error-handler';
import { env } from '../../config/env';
import {
  IScrapeJob,
  ScrapeStatus,
  ScraperType,
  IExtractedEntity,
  IScrapeProgressEvent,
} from './scraper.types';
import { retryWithBackoff, addRandomDelay } from './utils';
import {
  scrapeWithHttp,
  scrapeWithJina,
  scrapeWithPlaywright,
  scrapeWithCheerio,
  scrapeWithAIAgent,
  type ScrapedResult,
} from './scrapers';

export class ScraperService {
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
   * Execute cascade scraping: HTTP → Jina → Playwright
   */
  private async executeCascadeScraping(
    url: string,
    jobId: string,
    options: { useProxy?: boolean; blockResources?: boolean; includeScreenshots?: boolean }
  ): Promise<ScrapedResult> {
    const emitProgress = this.emitProgress.bind(this);

    // Tier 1: HTTP + Cheerio (fastest, ~100ms)
    console.log(`Job ${jobId}: Trying Tier 1 - HTTP scraper...`);
    const httpResult = await scrapeWithHttp(url, jobId, emitProgress);
    if (this.isValidContent(httpResult)) {
      console.log(`Job ${jobId}: ✓ HTTP scraper succeeded`);
      return httpResult!;
    }

    // Tier 2: Jina Reader API (fast, ~1-3s)
    console.log(`Job ${jobId}: Trying Tier 2 - Jina Reader API...`);
    const jinaResult = await scrapeWithJina(url, jobId, emitProgress);
    if (this.isValidContent(jinaResult)) {
      console.log(`Job ${jobId}: ✓ Jina Reader API succeeded`);
      return jinaResult!;
    }

    // Tier 3: Playwright (last resort, ~10-15s)
    console.log(`Job ${jobId}: Trying Tier 3 - Playwright (last resort)...`);
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

      this.emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: scraperType === ScraperType.AUTO ? 'Using cascade scraper (HTTP → Jina → Playwright)' : `Using ${scraperType} scraper`,
        progress: 20,
      });

      await addRandomDelay();

      // Execute scraping based on type
      switch (scraperType) {
        case ScraperType.HTTP:
          const httpResult = await scrapeWithHttp(job.url, jobId, emitProgress);
          if (!httpResult) throw new Error('HTTP scraper failed');
          scrapedData = httpResult;
          scraperUsed = ScraperType.HTTP;
          break;

        case ScraperType.JINA:
          const jinaResult = await scrapeWithJina(job.url, jobId, emitProgress);
          if (!jinaResult) throw new Error('Jina Reader API failed');
          scrapedData = jinaResult;
          scraperUsed = ScraperType.JINA;
          break;

        case ScraperType.PLAYWRIGHT:
          scrapedData = await scrapeWithPlaywright(job.url, jobId, job.scrapeOptions || {}, emitProgress);
          scraperUsed = ScraperType.PLAYWRIGHT;
          break;

        case ScraperType.CHEERIO:
          scrapedData = await scrapeWithCheerio(job.url, jobId, emitProgress);
          scraperUsed = ScraperType.CHEERIO;
          break;

        case ScraperType.AI_AGENT:
          const aiResult = await scrapeWithAIAgent(job.url, jobId, job.taskDescription || 'Extract all relevant data', emitProgress);
          scrapedData = aiResult;
          scraperUsed = ScraperType.AI_AGENT;
          break;

        case ScraperType.AUTO:
        default:
          // Use cascade: HTTP → Jina → Playwright
          scrapedData = await this.executeCascadeScraping(job.url, jobId, job.scrapeOptions || {});
          // Determine which scraper actually worked based on content
          if (scrapedData.contentType === 'text/markdown') {
            scraperUsed = ScraperType.JINA;
          } else if (scrapedData.screenshots?.length) {
            scraperUsed = ScraperType.PLAYWRIGHT;
          } else {
            scraperUsed = ScraperType.HTTP;
          }
          break;
      }

      // Validate scraped data
      if (!scrapedData.html || scrapedData.html.length < 100) {
        throw new Error(`Scraped content is too short (${scrapedData.html?.length || 0} bytes). The page may not have loaded correctly or is empty.`);
      }

      const duration = Date.now() - startTime;
      const dataSize = Buffer.byteLength(scrapedData.html || '', 'utf8');

      console.log(`Job ${jobId}: Scraped ${dataSize} bytes of HTML, ${scrapedData.text?.length || 0} chars of text in ${duration}ms using ${scraperUsed}`);

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

      if (geminiService.isAvailable() && job.taskDescription) {
        try {
          this.emitProgress(jobId, {
            jobId,
            status: ScrapeStatus.RUNNING,
            message: 'Extracting data with AI...',
            progress: 90,
          });

          const aiStartTime = Date.now();
          const aiResult = await geminiService.extractData(
            scrapedData.text || scrapedData.html || '',
            job.taskDescription
          );

          extractedEntities = aiResult.entities;
          aiProcessing = {
            model: aiResult.modelName || 'gemini-pro',
            prompt: job.taskDescription,
            response: aiResult.summary,
            processingTime: Date.now() - aiStartTime,
            success: aiResult.success,
            error: aiResult.error,
          };
        } catch (aiError: any) {
          console.error(`AI extraction failed for job ${jobId}:`, aiError);
          aiProcessing = {
            model: 'gemini-pro',
            prompt: job.taskDescription,
            response: '',
            processingTime: 0,
            success: false,
            error: aiError.message || 'AI extraction failed',
          };
        }
      }

      await scrapeRepository.updateScrapedData(jobId, {
        extractedEntities,
        aiProcessing,
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
      // Check for recent job with same URL (skip if forceRefresh)
      if (options.sessionId && !options.forceRefresh) {
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
        });

        // Wait for job to complete (reduced timeout since cascade is faster)
        const maxWaitTime = 60000; // Reduced from 120s to 60s
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

    if (job) {
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
}

export const scraperService = new ScraperService();
