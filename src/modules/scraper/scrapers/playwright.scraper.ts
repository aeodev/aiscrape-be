/**
 * Playwright Scraper - Last resort tier
 * Full browser automation for dynamic JavaScript-heavy sites
 * Optimized for speed: 15s timeout, blocks stylesheets, uses domcontentloaded
 */

import { PlaywrightCrawler, Dataset, ProxyConfiguration } from 'crawlee';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { env } from '../../../config/env';
import { ScrapeStatus } from '../scraper.types';
import { htmlToMarkdown } from '../utils/html-converter';
import { saveScreenshot } from '../utils/screenshot';
import type { ScrapedResult, ScraperOptions, ProgressEmitter } from './types';

// Optimized timeout - 15s max for Playwright (last resort)
const PLAYWRIGHT_TIMEOUT = 15000;

// User agent pool for rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
];

// Resources to block for faster loading
const BLOCKED_RESOURCE_TYPES = ['image', 'font', 'media', 'stylesheet'];
const BLOCKED_URL_PATTERNS = [
  /google-analytics\.com/,
  /googletagmanager\.com/,
  /facebook\.net/,
  /twitter\.com\/i\//,
  /doubleclick\.net/,
  /ads\./,
  /analytics\./,
  /tracking\./,
];

function getRandomUserAgent(): string {
  if (env.ROTATE_USER_AGENTS) {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }
  return env.USER_AGENT;
}

function shouldBlockUrl(url: string): boolean {
  return BLOCKED_URL_PATTERNS.some(pattern => pattern.test(url));
}

export async function scrapeWithPlaywright(
  url: string,
  jobId: string,
  options: ScraperOptions,
  emitProgress: ProgressEmitter
): Promise<ScrapedResult> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'Launching browser (last resort)...',
    progress: 60,
  });

  // Configure proxy if enabled
  let proxyConfiguration: ProxyConfiguration | undefined;
  const useProxy = options.useProxy ?? false;

  if (useProxy && env.PROXY_URL) {
    proxyConfiguration = new ProxyConfiguration({
      proxyUrls: [env.PROXY_URL],
    });
  }

  const shouldBlockResources = options.blockResources ?? true; // Always block by default for speed
  const shouldTakeScreenshot = options.includeScreenshots ?? env.SCREENSHOT_ENABLED;

  const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: PLAYWRIGHT_TIMEOUT / 1000,
    navigationTimeoutSecs: PLAYWRIGHT_TIMEOUT / 1000,
    launchContext: {
      launcher: chromium,
      launchOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-sync',
          '--disable-translate',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-first-run',
        ],
      },
    },
    browserPoolOptions: {
      maxOpenPagesPerBrowser: 5,
    },
    preNavigationHooks: [
      async ({ page }) => {
        await page.setExtraHTTPHeaders({
          'User-Agent': getRandomUserAgent(),
        });

        // Aggressive resource blocking for speed
        if (shouldBlockResources) {
          await page.route('**/*', (route) => {
            const request = route.request();
            const resourceType = request.resourceType();
            const requestUrl = request.url();

            // Block by resource type
            if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
              return route.abort();
            }

            // Block by URL pattern (analytics, ads, tracking)
            if (shouldBlockUrl(requestUrl)) {
              return route.abort();
            }

            return route.continue();
          });
        }
      },
    ],
    async requestHandler({ request, page }) {
      page.setDefaultTimeout(PLAYWRIGHT_TIMEOUT);

      // Use domcontentloaded first (much faster than networkidle)
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: PLAYWRIGHT_TIMEOUT });
        // Small wait for critical JS to execute
        await page.waitForTimeout(1000);
      } catch (error) {
        console.log(`Job ${jobId}: domcontentloaded timed out`);
        // Continue anyway - we'll get what we can
      }

      emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: 'Extracting page content...',
        progress: 70,
      });

      const pageTitle = await page.title();
      const pageDescription = await page.locator('meta[name="description"]').getAttribute('content') || '';
      let html = await page.content();

      let text = await page.evaluate(() => {
        return document.body?.innerText || '';
      });

      // Extract content from iframes
      emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: 'Checking for iframe content...',
        progress: 75,
      });

      try {
        const frames = page.frames();
        const iframeContents: string[] = [];
        
        for (const frame of frames) {
          if (frame === page.mainFrame()) continue; // Skip main frame
          
          try {
            const frameUrl = frame.url();
            if (!frameUrl || frameUrl === 'about:blank') continue;
            
            // Wait for frame to load
            await frame.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
            
            const frameHtml = await frame.content();
            const frameText = await frame.evaluate(() => document.body?.innerText || '');
            
            if (frameText && frameText.length > 50) {
              console.log(`Job ${jobId}: Found iframe content from ${frameUrl} - ${frameText.length} chars`);
              iframeContents.push(`\n\n--- IFRAME CONTENT (${frameUrl}) ---\n${frameText}`);
              html += `\n<!-- IFRAME: ${frameUrl} -->\n${frameHtml}`;
            }
          } catch (frameError: any) {
            console.log(`Job ${jobId}: Could not extract frame content: ${frameError.message}`);
          }
        }
        
        if (iframeContents.length > 0) {
          text += iframeContents.join('\n');
          console.log(`Job ${jobId}: Extracted content from ${iframeContents.length} iframe(s)`);
        }
      } catch (iframeError: any) {
        console.log(`Job ${jobId}: Iframe extraction error: ${iframeError.message}`);
      }

      if (!html || html.length < 100) {
        throw new Error('Scraped HTML is too short or empty. The page may not have loaded correctly.');
      }

      let screenshotPath: string | undefined;

      if (shouldTakeScreenshot) {
        emitProgress(jobId, {
          jobId,
          status: ScrapeStatus.RUNNING,
          message: 'Capturing screenshot...',
          progress: 85,
        });

        const screenshot = await page.screenshot({
          fullPage: env.SCREENSHOT_FULL_PAGE,
          type: 'jpeg',
          quality: 80,
        });

        screenshotPath = await saveScreenshot(screenshot, jobId);
      }

      const $ = cheerio.load(html);
      const markdown = htmlToMarkdown($, $('body'));

      console.log(`Job ${jobId}: Playwright scrape complete - HTML: ${html.length} bytes, Text: ${text.length} chars`);

      await Dataset.pushData({
        url: request.url,
        html,
        markdown,
        text,
        pageTitle,
        pageDescription,
        screenshot: screenshotPath,
      });
    },
  });

  await crawler.run([url]);

  const data = await Dataset.getData();
  const result = data.items[0] || {};

  if (!result.html || result.html.length < 100) {
    console.error(`Job ${jobId}: WARNING - Scraped HTML is too short or missing!`);
  }

  return {
    html: result.html || '',
    markdown: result.markdown || '',
    text: result.text || '',
    finalUrl: result.url || url,
    statusCode: 200,
    pageTitle: result.pageTitle || '',
    pageDescription: result.pageDescription || '',
    screenshots: result.screenshot ? [result.screenshot] : [],
    requestCount: 1,
  };
}
