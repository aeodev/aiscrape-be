/**
 * Scraper Router
 * Route definitions for scraping endpoints
 */

import { Router } from 'express';
import { scraperController } from './scraper.controller';

const router = Router();

/**
 * @route   POST /api/scrape
 * @desc    Create a new scrape job
 * @access  Public (can add authentication middleware)
 */
router.post('/', scraperController.createJob);

/**
 * @route   GET /api/scrape/stats
 * @desc    Get scraping statistics
 * @access  Public
 */
router.get('/stats', scraperController.getStats);

/**
 * @route   GET /api/scrape/:id
 * @desc    Get a specific scrape job
 * @access  Public
 */
router.get('/:id', scraperController.getJob);

/**
 * @route   GET /api/scrape
 * @desc    Get list of scrape jobs
 * @access  Public
 */
router.get('/', scraperController.getJobs);

/**
 * @route   DELETE /api/scrape/:id
 * @desc    Delete a scrape job
 * @access  Public
 */
router.delete('/:id', scraperController.deleteJob);

/**
 * @route   POST /api/scrape/:id/cancel
 * @desc    Cancel a scrape job
 * @access  Public
 */
router.post('/:id/cancel', scraperController.cancelJob);

/**
 * @route   POST /api/scrape/:id/chat
 * @desc    Chat with a scrape job
 * @access  Public
 */
router.post('/:id/chat', scraperController.chatWithJob);

/**
 * @route   POST /api/scrape/ask
 * @desc    Unified endpoint: Scrape URL and answer question in one request
 * @access  Public
 */
router.post('/ask', scraperController.scrapeAndAnswer);

/**
 * @route   GET /api/scrape/linkedin/instructions
 * @desc    Get instructions for extracting LinkedIn cookies
 * @access  Public
 */
router.get('/linkedin/instructions', scraperController.getLinkedInInstructions);

export default router;


