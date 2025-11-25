/**
 * Scraper Socket Handlers
 * Real-time WebSocket event handlers for scraping
 */

import { Socket } from 'socket.io';
import { scraperService } from './scraper.service';

/**
 * Register scraper socket event handlers
 */
export const registerScraperSocketHandlers = (socket: Socket): void => {
  /**
   * Join a job room for real-time updates
   */
  socket.on('scrape:join', (jobId: string) => {
    socket.join(`job:${jobId}`);
    console.log(`Socket ${socket.id} joined job room: ${jobId}`);
  });

  /**
   * Leave a job room
   */
  socket.on('scrape:leave', (jobId: string) => {
    socket.leave(`job:${jobId}`);
    console.log(`Socket ${socket.id} left job room: ${jobId}`);
  });

  /**
   * Request current job status
   */
  socket.on('scrape:status', async (jobId: string) => {
    try {
      const job = await scraperService.getJob(jobId);
      
      if (job) {
        socket.emit('scrape:status:response', {
          success: true,
          job,
        });
      } else {
        socket.emit('scrape:status:response', {
          success: false,
          error: 'Job not found',
        });
      }
    } catch (error: any) {
      socket.emit('scrape:status:response', {
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Cancel a job via socket
   */
  socket.on('scrape:cancel', async (jobId: string) => {
    try {
      const job = await scraperService.cancelJob(jobId);
      
      socket.emit('scrape:cancel:response', {
        success: true,
        job,
      });
    } catch (error: any) {
      socket.emit('scrape:cancel:response', {
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Subscribe to all scrape events for a session
   */
  socket.on('scrape:subscribe:session', (sessionId: string) => {
    socket.join(`session:${sessionId}`);
    console.log(`Socket ${socket.id} subscribed to session: ${sessionId}`);
  });

  /**
   * Unsubscribe from session events
   */
  socket.on('scrape:unsubscribe:session', (sessionId: string) => {
    socket.leave(`session:${sessionId}`);
    console.log(`Socket ${socket.id} unsubscribed from session: ${sessionId}`);
  });
};


