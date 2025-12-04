/**
 * Scraper Controller
 * HTTP request/response handling for scraping endpoints
 */

import { Request, Response } from 'express';
import { scraperService } from './scraper.service';
import { asyncHandler, ApiError } from '../../middleware/error-handler';
import { getLinkedInCookieInstructions } from './scrapers/linkedin.scraper';
import {
  ICreateScrapeJobRequest,
  IScrapeJobResponse,
  IScrapeListResponse,
  ScrapeStatus,
  ScraperType,
} from './scraper.types';

export class ScraperController {
  /**
   * POST /api/scrape
   * Create a new scrape job
   */
  createJob = asyncHandler(async (req: Request, res: Response) => {
    const {
      url,
      taskDescription,
      scraperType,
      useAI,
    }: ICreateScrapeJobRequest = req.body;

    // Validate required fields
    if (!url) {
      throw new ApiError(400, 'URL is required');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      throw new ApiError(400, 'Invalid URL format');
    }

    // Create job
    const job = await scraperService.createJob(url, {
      taskDescription,
      scraperType: scraperType || ScraperType.AUTO,
      userId: (req as any).user?.id,
      sessionId: req.headers['x-session-id'] as string,
    });

    const response: IScrapeJobResponse = {
      success: true,
      job,
    };

    res.status(201).json(response);
  });

  /**
   * GET /api/scrape/:id
   * Get a specific scrape job by ID
   */
  getJob = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const job = await scraperService.getJob(id);

    if (!job) {
      throw new ApiError(404, 'Scrape job not found');
    }

    const response: IScrapeJobResponse = {
      success: true,
      job,
    };

    res.json(response);
  });

  /**
   * GET /api/scrape
   * Get scrape jobs (with pagination and filtering)
   */
  getJobs = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as ScrapeStatus;
    const sessionId = req.query.sessionId as string;

    let jobs;
    let total;

    if (sessionId) {
      // Get jobs by session
      const sessionJobs = await scraperService.getJobsBySession(sessionId);
      jobs = sessionJobs;
      total = sessionJobs.length;
    } else if ((req as any).user?.id) {
      // Get jobs by user
      const result = await scraperService.getJobsByUser((req as any).user.id, {
        page,
        limit,
        status,
      });
      jobs = result.jobs;
      total = result.total;
    } else {
      throw new ApiError(401, 'Authentication required');
    }

    const response: IScrapeListResponse = {
      success: true,
      jobs,
      total,
      page,
      limit,
    };

    res.json(response);
  });

  /**
   * DELETE /api/scrape/:id
   * Delete a scrape job
   */
  deleteJob = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const deleted = await scraperService.deleteJob(id);

    if (!deleted) {
      throw new ApiError(404, 'Scrape job not found');
    }

    res.json({
      success: true,
      message: 'Job deleted successfully',
    });
  });

  /**
   * POST /api/scrape/:id/cancel
   * Cancel a running or queued job
   */
  cancelJob = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const job = await scraperService.cancelJob(id);

    if (!job) {
      throw new ApiError(404, 'Scrape job not found');
    }

    const response: IScrapeJobResponse = {
      success: true,
      job,
    };

    res.json(response);
  });

  /**
   * GET /api/scrape/stats
   * Get scraping statistics
   */
  getStats = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const stats = await scraperService.getStatistics(userId);

    res.json({
      success: true,
      stats,
    });
  });
  /**
   * Chat with a job
   */
  chatWithJob = asyncHandler(async (req: Request, res: Response) => {
    const { message } = req.body;
    if (!message) {
      throw new ApiError(400, 'Message is required');
    }

    const result = await scraperService.chatWithJob(req.params.id, message);

    res.json({
      success: true,
      ...result,
    });
  });

  /**
   * Unified endpoint: Scrape and answer in one request
   * POST /api/scrape/ask
   * 
   * Add "refresh" or "rescrape" to the input to force a fresh scrape
   */
  scrapeAndAnswer = asyncHandler(async (req: Request, res: Response) => {
    let { input, scraperType, useProxy, blockResources, includeScreenshots, forceRefresh, linkedinAuth } = req.body;

    if (!input || typeof input !== 'string' || !input.trim()) {
      throw new ApiError(400, 'Input is required');
    }

    // Detect refresh keywords in input
    const refreshKeywords = /\b(refresh|rescrape|force|new\s*scrape)\b/i;
    if (refreshKeywords.test(input)) {
      forceRefresh = true;
      input = input.replace(refreshKeywords, '').trim();
    }
    
    // Auto-detect AI Agent mode for complex tasks
    const aiAgentKeywords = /\b(all\s*details|explore|deep\s*scrape|click|visit\s*all|follow\s*links|learn\s*more|ai\s*agent)\b/i;
    if (aiAgentKeywords.test(input) && !scraperType) {
      scraperType = ScraperType.AI_AGENT;
      console.log('Auto-detected AI Agent mode for complex task');
    }

    const result = await scraperService.scrapeAndAnswer(input.trim(), {
      userId: (req as any).user?.id,
      sessionId: req.headers['x-session-id'] as string,
      scraperType: scraperType || ScraperType.AUTO,
      useProxy,
      blockResources,
      includeScreenshots,
      forceRefresh,
      linkedinAuth,
    });

    res.json({
      success: true,
      ...result,
    });
  });

  /**
   * GET /api/scrape/linkedin/instructions
   * Get instructions on how to extract LinkedIn cookies
   */
  getLinkedInInstructions = asyncHandler(async (req: Request, res: Response) => {
    const instructions = getLinkedInCookieInstructions();
    
    res.json({
      success: true,
      instructions,
      example: {
        linkedinAuth: {
          cookies: [
            {
              name: 'li_at',
              value: 'YOUR_LI_AT_COOKIE_VALUE',
              domain: '.linkedin.com',
              path: '/',
              secure: true,
              httpOnly: true,
              sameSite: 'None',
            },
            {
              name: 'JSESSIONID',
              value: 'YOUR_JSESSIONID_VALUE',
              domain: '.linkedin.com',
              path: '/',
              secure: true,
              httpOnly: true,
              sameSite: 'None',
            },
          ],
        },
      },
    });
  });
}

export const scraperController = new ScraperController();


