/**
 * Scraper Actions Service
 * Emits real-time action events during scraping operations
 */

import { getIO } from '../../lib/socket';
import { IScrapeActionEvent, ScrapeActionType } from './scraper.types';

export class ScraperActionsService {
  /**
   * Emit an action event via Socket.IO
   */
  emitAction(
    jobId: string,
    type: ScrapeActionType,
    message: string,
    details?: Record<string, any>
  ): void {
    try {
      const actionEvent: IScrapeActionEvent = {
        jobId,
        type,
        message,
        details,
        timestamp: new Date().toISOString(),
      };

      // Emit to all clients (broadcast)
      getIO().emit('scrape:action', actionEvent);
      
      // Emit to job-specific room
      getIO().to(`job:${jobId}`).emit('scrape:action', actionEvent);
      
      // Emit to session room (if sessionId is in details)
      if (details?.sessionId) {
        getIO().to(`session:${details.sessionId}`).emit('scrape:action', actionEvent);
      }
    } catch (error) {
      console.error('Error emitting action:', error);
    }
  }

  /**
   * Helper methods for common action types
   */
  observe(jobId: string, message: string, details?: Record<string, any>): void {
    this.emitAction(jobId, 'OBSERVATION', message, details);
  }

  action(jobId: string, message: string, details?: Record<string, any>): void {
    this.emitAction(jobId, 'ACTION', message, details);
  }

  extract(jobId: string, message: string, details?: Record<string, any>): void {
    this.emitAction(jobId, 'EXTRACTION', message, details);
  }

  analyze(jobId: string, message: string, details?: Record<string, any>): void {
    this.emitAction(jobId, 'ANALYSIS', message, details);
  }

  navigate(jobId: string, message: string, details?: Record<string, any>): void {
    this.emitAction(jobId, 'NAVIGATION', message, details);
  }

  click(jobId: string, message: string, details?: Record<string, any>): void {
    this.emitAction(jobId, 'CLICK', message, details);
  }

  wait(jobId: string, message: string, details?: Record<string, any>): void {
    this.emitAction(jobId, 'WAIT', message, details);
  }
}

export const scraperActionsService = new ScraperActionsService();


