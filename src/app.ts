/**
 * Express Application Configuration
 */

import express, { Application, Request, Response } from 'express';
import * as path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';

// Import routers
import scraperRouter from './modules/scraper/scraper.router';

export const createApp = (): Application => {
  const app = express();

  // ============================================================================
  // Security & Middleware
  // ============================================================================

  // Helmet for security headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
    })
  );

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Rate limiting middleware (if enabled)
  if (env.RATE_LIMIT_ENABLED) {
    // Apply rate limiting to API routes
    app.use('/api/scrape', rateLimitMiddleware({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: true,
    }));
  }

  // ============================================================================
  // Routes
  // ============================================================================

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'AIScrape API is running',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  // API Routes
  app.use('/api/scrape', scraperRouter);

  // Serve uploaded files (screenshots)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // 404 Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Route not found',
      path: req.path,
    });
  });

  // ============================================================================
  // Error Handler (must be last)
  // ============================================================================

  app.use(errorHandler);

  return app;
};


