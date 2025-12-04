/**
 * Scrapers barrel export
 * Cascade order: HTTP → Jina → Playwright
 * Smart Cascade: HTTP → Quality Check → Smart Playwright (with AI interactions)
 * AI Agent: Smart multi-page scraping with AI decisions
 */

export { scrapeWithHttp } from './http.scraper';
export { scrapeWithJina } from './jina.scraper';
export { scrapeWithCheerio } from './cheerio.scraper';
export { scrapeWithPlaywright } from './playwright.scraper';
export { scrapeWithSmartPlaywright } from './playwright-smart.scraper';
export { scrapeWithAIAgent } from './ai-agent.scraper';
export { scrapeLinkedIn, getLinkedInCookieInstructions } from './linkedin.scraper';
export type { ScrapedResult, ScraperOptions, ProgressEmitter } from './types';
