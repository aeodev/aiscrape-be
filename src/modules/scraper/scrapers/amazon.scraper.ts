/**
 * Amazon Expert Scraper
 * Specialized scraper for Amazon with stealth mode, human-like behavior,
 * API interception, and session warm-up to bypass aggressive bot detection.
 */

import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { ScrapeStatus } from '../scraper.types';
import { processContentWithCheerio } from '../../../lib/processing';
import { scraperActionsService } from '../scraper-actions.service';
import { proxyManager } from '../../../lib/proxy';
import { env } from '../../../config/env';
import type { ScrapedResult, ScraperOptions, ProgressEmitter } from './types';

// Apply stealth plugin
chromium.use(stealth());

// Timeouts
const AMAZON_TIMEOUT = 45000; // 45s for Amazon (needs more time)
const NAVIGATION_TIMEOUT = 30000;

// Amazon-specific selectors
const AMAZON_SELECTORS = {
  dealCard: '[data-testid="deal-card"], [data-component-type="s-search-result"], .DealGridItem, .deal-card',
  dealTitle: '[data-testid="deal-title"], .DealContent-module__title, .a-text-normal, h2 a span',
  dealPrice: '[data-testid="deal-price"], .a-price .a-offscreen, .a-price-whole',
  dealDiscount: '.savingsPercentage, [data-testid="discount-badge"], .a-text-price',
  dealImage: '[data-testid="deal-image"] img, .DealContent-module__image img, .s-image',
  dealLink: 'a[href*="/deal/"], a[href*="/dp/"]',
  asin: '[data-asin]',
  captchaIndicators: [
    'input[name="captcha"]',
    '#captchacharacters',
    'form[action*="validateCaptcha"]',
  ],
};

// Bot detection indicators
const BOT_BLOCKED_INDICATORS = [
  'sorry, we just need to make sure you\'re not a robot',
  'enter the characters you see below',
  'type the characters you see in this image',
  'api-services-support@amazon.com',
  'to discuss automated access to amazon data',
  'automated access to amazon',
];

// Mobile fingerprint for fallback
const MOBILE_FINGERPRINT = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

// Desktop fingerprint
const DESKTOP_FINGERPRINT = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1920 + Math.floor(Math.random() * 100), height: 1080 + Math.floor(Math.random() * 100) },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

interface AmazonDeal {
  asin?: string;
  title?: string;
  price?: string;
  originalPrice?: string;
  discount?: string;
  rating?: string;
  imageUrl?: string;
  dealUrl?: string;
}

interface CapturedApiData {
  url: string;
  data: any;
}

/**
 * Check if page is blocked by bot detection
 */
async function isBlocked(page: Page): Promise<boolean> {
  try {
    const bodyText = await page.textContent('body');
    if (!bodyText) return false;
    
    const lowerText = bodyText.toLowerCase();
    return BOT_BLOCKED_INDICATORS.some(indicator => lowerText.includes(indicator));
  } catch {
    return false;
  }
}

/**
 * Check if CAPTCHA is present
 */
async function hasCaptcha(page: Page): Promise<boolean> {
  for (const selector of AMAZON_SELECTORS.captchaIndicators) {
    try {
      const element = await page.$(selector);
      if (element) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Human-like scroll behavior
 */
async function humanScroll(page: Page, jobId: string): Promise<void> {
  scraperActionsService.action(jobId, 'Simulating human scroll behavior');
  
  const scrollSteps = 5 + Math.floor(Math.random() * 10);
  
  for (let i = 0; i < scrollSteps; i++) {
    const distance = 100 + Math.floor(Math.random() * 400);
    const delay = 200 + Math.floor(Math.random() * 800);
    
    await page.mouse.wheel(0, distance);
    await page.waitForTimeout(delay);
    
    // Occasionally pause to "read" like a human
    if (Math.random() > 0.7) {
      const readPause = 1500 + Math.random() * 2000;
      scraperActionsService.wait(jobId, `Pausing to simulate reading (${Math.round(readPause / 1000)}s)`);
      await page.waitForTimeout(readPause);
    }
  }
}

/**
 * Human-like mouse movement
 */
async function humanMouseMove(page: Page): Promise<void> {
  const viewportSize = page.viewportSize();
  if (!viewportSize) return;
  
  const x = Math.floor(Math.random() * viewportSize.width);
  const y = Math.floor(Math.random() * viewportSize.height);
  const steps = 10 + Math.floor(Math.random() * 20);
  
  await page.mouse.move(x, y, { steps });
}

/**
 * Warm up Amazon session by visiting homepage first
 */
async function warmUpSession(context: BrowserContext, jobId: string): Promise<void> {
  scraperActionsService.action(jobId, 'Warming up Amazon session (visiting homepage first)');
  
  const warmupPage = await context.newPage();
  
  try {
    await warmupPage.goto('https://www.amazon.com', { 
      waitUntil: 'networkidle',
      timeout: NAVIGATION_TIMEOUT 
    });
    
    // Simulate some human behavior on homepage
    await humanMouseMove(warmupPage);
    await warmupPage.waitForTimeout(1000 + Math.random() * 2000);
    
    // Accept cookies if prompted
    try {
      const acceptButton = await warmupPage.$('[data-action="sp-cc"][name="accept"], #sp-cc-accept');
      if (acceptButton) {
        await acceptButton.click();
        scraperActionsService.click(jobId, 'Accepted cookies popup');
        await warmupPage.waitForTimeout(500);
      }
    } catch {
      // Cookie popup might not exist
    }
    
    // Small scroll on homepage
    await warmupPage.mouse.wheel(0, 300);
    await warmupPage.waitForTimeout(1000);
    
    scraperActionsService.observe(jobId, 'Session warmed up successfully');
  } catch (error: any) {
    scraperActionsService.observe(jobId, `Session warm-up warning: ${error.message}`);
  } finally {
    await warmupPage.close();
  }
}

/**
 * Extract deals from page DOM
 */
async function extractDealsFromDOM(page: Page): Promise<AmazonDeal[]> {
  return await page.evaluate((selectors) => {
    const deals: AmazonDeal[] = [];
    
    // Try to find deal elements
    const dealElements = document.querySelectorAll(selectors.asin);
    
    dealElements.forEach(el => {
      const asin = el.getAttribute('data-asin');
      if (!asin) return;
      
      const deal: AmazonDeal = { asin };
      
      // Title
      const titleEl = el.querySelector('h2 a span, .a-text-normal, [data-testid="deal-title"]');
      if (titleEl) deal.title = titleEl.textContent?.trim();
      
      // Price
      const priceEl = el.querySelector('.a-price .a-offscreen, [data-testid="deal-price"]');
      if (priceEl) deal.price = priceEl.textContent?.trim();
      
      // Original price
      const origPriceEl = el.querySelector('.a-text-price .a-offscreen');
      if (origPriceEl) deal.originalPrice = origPriceEl.textContent?.trim();
      
      // Discount
      const discountEl = el.querySelector('.savingsPercentage, [data-testid="discount-badge"]');
      if (discountEl) deal.discount = discountEl.textContent?.trim();
      
      // Rating
      const ratingEl = el.querySelector('.a-icon-alt');
      if (ratingEl) deal.rating = ratingEl.textContent?.trim();
      
      // Image
      const imgEl = el.querySelector('.s-image, [data-testid="deal-image"] img') as HTMLImageElement;
      if (imgEl?.src) deal.imageUrl = imgEl.src;
      
      // Deal URL
      const linkEl = el.querySelector('a[href*="/dp/"], a[href*="/deal/"]') as HTMLAnchorElement;
      if (linkEl?.href) deal.dealUrl = linkEl.href;
      
      if (deal.title || deal.price) {
        deals.push(deal);
      }
    });
    
    return deals;
  }, AMAZON_SELECTORS);
}

/**
 * Format deals as readable text
 */
function formatDealsAsText(deals: AmazonDeal[]): string {
  if (deals.length === 0) return '';
  
  let text = '\n\n--- EXTRACTED AMAZON DEALS ---\n\n';
  
  deals.forEach((deal, idx) => {
    text += `DEAL #${idx + 1}\n`;
    if (deal.asin) text += `  ASIN: ${deal.asin}\n`;
    if (deal.title) text += `  Title: ${deal.title}\n`;
    if (deal.price) text += `  Price: ${deal.price}\n`;
    if (deal.originalPrice) text += `  Original Price: ${deal.originalPrice}\n`;
    if (deal.discount) text += `  Discount: ${deal.discount}\n`;
    if (deal.rating) text += `  Rating: ${deal.rating}\n`;
    if (deal.dealUrl) text += `  URL: ${deal.dealUrl}\n`;
    text += '\n';
  });
  
  return text;
}

/**
 * Main Amazon scraper function
 */
export async function scrapeAmazon(
  url: string,
  jobId: string,
  options: ScraperOptions,
  emitProgress: ProgressEmitter
): Promise<ScrapedResult> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'Amazon Expert Scraper: Launching stealth browser...',
    progress: 50,
  });

  scraperActionsService.action(jobId, 'Launching stealth browser for Amazon', { url });

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  const useMobile = options.amazonOptions?.useMobile ?? false;
  const shouldWarmUp = options.amazonOptions?.warmUpSession ?? true;
  const useProxy = options.useProxy ?? false;

  try {
    // Configure proxy if enabled
    let proxyConfig: { server: string; username?: string; password?: string } | undefined;
    
    if (useProxy) {
      const proxy = proxyManager.getProxy();
      if (proxy) {
        proxyConfig = {
          server: `${proxy.host}:${proxy.port}`,
          username: proxy.username,
          password: proxy.password,
        };
        scraperActionsService.observe(jobId, `Using proxy: ${proxy.host}:${proxy.port}`);
      } else if (env.PROXY_URL) {
        try {
          const proxyUrl = new URL(env.PROXY_URL);
          proxyConfig = {
            server: `${proxyUrl.hostname}:${proxyUrl.port}`,
            username: proxyUrl.username || undefined,
            password: proxyUrl.password || undefined,
          };
          scraperActionsService.observe(jobId, `Using proxy from env: ${proxyUrl.hostname}`);
        } catch {
          scraperActionsService.observe(jobId, 'Warning: Could not parse PROXY_URL');
        }
      }
    }

    // Launch stealth browser
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    // Select fingerprint
    const fingerprint = useMobile ? MOBILE_FINGERPRINT : DESKTOP_FINGERPRINT;

    // Create context with fingerprint and optional proxy
    context = await browser.newContext({
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      isMobile: fingerprint.isMobile,
      hasTouch: fingerprint.hasTouch,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      proxy: proxyConfig,
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    // Warm up session if enabled
    if (shouldWarmUp) {
      emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: 'Amazon Expert Scraper: Warming up session...',
        progress: 55,
      });
      await warmUpSession(context, jobId);
    }

    // Create main page
    const page = await context.newPage();
    page.setDefaultTimeout(AMAZON_TIMEOUT);

    // Capture API responses
    const capturedApiData: CapturedApiData[] = [];
    
    page.on('response', async (response) => {
      const responseUrl = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      // Look for Amazon API endpoints
      if (
        contentType.includes('json') &&
        (responseUrl.includes('/api/deals/') ||
         responseUrl.includes('/fod/v1/') ||
         responseUrl.includes('/gp/deals/') ||
         responseUrl.includes('ajax'))
      ) {
        try {
          const json = await response.json();
          capturedApiData.push({ url: responseUrl, data: json });
          scraperActionsService.extract(jobId, `Captured API response: ${responseUrl.substring(0, 80)}...`);
        } catch {
          // Response might not be JSON
        }
      }
    });

    // Navigate to target URL
    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'Amazon Expert Scraper: Loading page...',
      progress: 60,
    });

    scraperActionsService.action(jobId, 'Navigating to Amazon page');
    
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: NAVIGATION_TIMEOUT 
    });

    // Random delay after load
    const loadDelay = 2000 + Math.random() * 3000;
    scraperActionsService.wait(jobId, `Waiting for dynamic content (${Math.round(loadDelay / 1000)}s)`);
    await page.waitForTimeout(loadDelay);

    // Check for bot detection
    if (await isBlocked(page) || await hasCaptcha(page)) {
      scraperActionsService.observe(jobId, 'Bot detection triggered! Page may be blocked.');
      
      // If desktop failed and mobile fallback is available, try mobile
      if (!useMobile) {
        scraperActionsService.action(jobId, 'Attempting mobile fallback...');
        
        // Close current context and retry with mobile
        await context.close();
        await browser.close();
        
        return scrapeAmazon(url, jobId, {
          ...options,
          amazonOptions: { ...options.amazonOptions, useMobile: true },
        }, emitProgress);
      }
      
      throw new Error('Amazon bot detection triggered. Consider using residential proxies.');
    }

    // Human-like scroll to load lazy content
    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'Amazon Expert Scraper: Scrolling to load deals...',
      progress: 70,
    });

    await humanScroll(page, jobId);
    
    // Additional wait for lazy-loaded content
    await page.waitForTimeout(2000);

    // Extract deals from DOM
    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'Amazon Expert Scraper: Extracting deals...',
      progress: 80,
    });

    scraperActionsService.action(jobId, 'Extracting deals from page');
    const deals = await extractDealsFromDOM(page);
    scraperActionsService.extract(jobId, `Found ${deals.length} deals on page`);

    // Get page content
    const html = await page.content();
    const pageTitle = await page.title();
    const pageDescription = await page.$eval(
      'meta[name="description"]',
      el => el.getAttribute('content') || ''
    ).catch(() => '');

    // Get text content
    let text = await page.evaluate(() => document.body?.innerText || '');

    // Add extracted deals to text
    if (deals.length > 0) {
      text += formatDealsAsText(deals);
    }

    // Add captured API data to text
    if (capturedApiData.length > 0) {
      text += '\n\n--- CAPTURED API DATA ---\n';
      for (const capture of capturedApiData) {
        text += `\nAPI: ${capture.url}\n`;
        text += JSON.stringify(capture.data, null, 2);
        text += '\n';
      }
    }

    // Process content through pipeline
    const $ = cheerio.load(html);
    const pipelineResult = await processContentWithCheerio($, $('body'), {
      enableHtmlProcessing: true,
      enableMarkdownConversion: true,
      enableTextExtraction: true,
      extractMainContent: true,
    });

    const markdown = pipelineResult.markdown || '';
    const processedText = pipelineResult.text || text;
    const finalText = processedText.length > text.length ? processedText : text;

    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: `Amazon Expert Scraper: Complete - ${deals.length} deals found`,
      progress: 90,
    });

    console.log(`Job ${jobId}: Amazon scraper complete - ${deals.length} deals, ${capturedApiData.length} API captures, ${finalText.length} chars`);

    return {
      html,
      markdown,
      text: finalText,
      finalUrl: page.url(),
      statusCode: 200,
      contentType: 'text/html',
      pageTitle,
      pageDescription,
      requestCount: 1,
    };
  } catch (error: any) {
    console.error(`Job ${jobId}: Amazon scraper error:`, error.message);
    scraperActionsService.observe(jobId, `Amazon scraper error: ${error.message}`);
    throw error;
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

/**
 * Check if URL is an Amazon URL
 */
export function isAmazonUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes('amazon.com') ||
    lowerUrl.includes('amazon.co.uk') ||
    lowerUrl.includes('amazon.de') ||
    lowerUrl.includes('amazon.fr') ||
    lowerUrl.includes('amazon.es') ||
    lowerUrl.includes('amazon.it') ||
    lowerUrl.includes('amazon.ca') ||
    lowerUrl.includes('amazon.com.au') ||
    lowerUrl.includes('amazon.co.jp') ||
    lowerUrl.includes('amazon.in')
  );
}

