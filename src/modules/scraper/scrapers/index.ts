/**
 * Scrapers barrel export
 * Cascade order: HTTP → Jina → Playwright
 * Smart Cascade: HTTP → Quality Check → Smart Playwright (with AI interactions)
 * AI Agent: Smart multi-page scraping with AI decisions
 * Amazon: Specialized stealth scraper for Amazon
 */

export { scrapeWithHttp } from './http.scraper';
export { scrapeWithJina } from './jina.scraper';
export { scrapeWithCheerio } from './cheerio.scraper';
export { scrapeWithPlaywright } from './playwright.scraper';
export { scrapeWithSmartPlaywright } from './playwright-smart.scraper';
export { scrapeWithAIAgent } from './ai-agent.scraper';
export { scrapeLinkedIn, getLinkedInCookieInstructions } from './linkedin.scraper';
export { scrapeAmazon, isAmazonUrl } from './amazon.scraper';
export type { ScrapedResult, ScraperOptions, ProgressEmitter, AmazonScraperOptions } from './types';
