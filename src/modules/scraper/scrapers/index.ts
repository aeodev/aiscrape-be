/**
 * Scrapers barrel export
 * Cascade order: HTTP → Jina → Playwright
 * AI Agent: Smart multi-page scraping with AI decisions
 */

export { scrapeWithHttp } from './http.scraper';
export { scrapeWithJina } from './jina.scraper';
export { scrapeWithCheerio } from './cheerio.scraper';
export { scrapeWithPlaywright } from './playwright.scraper';
export { scrapeWithAIAgent } from './ai-agent.scraper';
export type { ScrapedResult, ScraperOptions, ProgressEmitter } from './types';
