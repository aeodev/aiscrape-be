/**
 * LinkedIn Scraper with Authentication Support
 * Requires authenticated session cookies to access LinkedIn content
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { ScrapeStatus } from '../scraper.types';
import { processContentWithCheerio } from '../../../lib/processing';
import type { ScrapedResult, ProgressEmitter } from './types';

const LINKEDIN_TIMEOUT = 30000; // 30s timeout
const LINKEDIN_DELAY = 2000; // 2s delay between actions to avoid rate limiting

interface LinkedInAuth {
  cookies?: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  sessionStorage?: Record<string, string>;
  localStorage?: Record<string, string>;
}

/**
 * LinkedIn Scraper with authentication
 */
export async function scrapeLinkedIn(
  url: string,
  jobId: string,
  auth: LinkedInAuth,
  emitProgress: ProgressEmitter
): Promise<ScrapedResult> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'LinkedIn scraper: Launching authenticated browser...',
    progress: 50,
  });

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    // Create context with LinkedIn-specific settings
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    // Add cookies if provided
    if (auth.cookies && auth.cookies.length > 0) {
      await context.addCookies(
        auth.cookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || '.linkedin.com',
          path: cookie.path || '/',
          expires: cookie.expires,
          httpOnly: cookie.httpOnly ?? true,
          secure: cookie.secure ?? true,
          sameSite: cookie.sameSite || 'None',
        }))
      );
      console.log(`Job ${jobId}: Added ${auth.cookies.length} LinkedIn cookies`);
    }

    const page = await context.newPage();
    page.setDefaultTimeout(LINKEDIN_TIMEOUT);

    // Set localStorage/sessionStorage if provided
    if (auth.localStorage || auth.sessionStorage) {
      await page.addInitScript((local, session) => {
        if (local) {
          Object.entries(local).forEach(([key, value]) => {
            localStorage.setItem(key, value);
          });
        }
        if (session) {
          Object.entries(session).forEach(([key, value]) => {
            sessionStorage.setItem(key, value);
          });
        }
      }, auth.localStorage || {}, auth.sessionStorage || {});
    }

    // Navigate to LinkedIn
    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'LinkedIn scraper: Loading page with authentication...',
      progress: 60,
    });

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: LINKEDIN_TIMEOUT,
    });

    // Wait a bit for LinkedIn to fully load
    await page.waitForTimeout(LINKEDIN_DELAY);

    // Check if we're logged in (LinkedIn shows login prompt if not authenticated)
    const isLoggedIn = await page.evaluate(() => {
      // Check for common LinkedIn logged-in indicators
      return (
        !document.querySelector('input[type="password"]') && // No password field
        !window.location.href.includes('/login') && // Not on login page
        document.querySelector('nav[role="navigation"]') !== null // Has main nav
      );
    });

    if (!isLoggedIn) {
      throw new Error(
        'LinkedIn authentication failed. Please provide valid session cookies. ' +
        'The page appears to be showing a login prompt or redirecting to login.'
      );
    }

    console.log(`Job ${jobId}: Successfully authenticated with LinkedIn`);

    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'LinkedIn scraper: Extracting content...',
      progress: 70,
    });

    // Scroll to load lazy-loaded content
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight || totalHeight > 5000) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    await page.waitForTimeout(1000); // Wait for content to load after scroll

    // Extract content
    const pageTitle = await page.title();
    const html = await page.content();
    
    // Remove LinkedIn's dynamic overlay elements
    const text = await page.evaluate(() => {
      // Remove common LinkedIn UI elements that aren't content
      const selectors = [
        'nav[role="navigation"]',
        'header',
        'footer',
        '[data-test-id="app-aware-link"]',
        '.artdeco-button',
        '.msg-overlay-bubble-header',
      ];
      
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      return document.body?.innerText || '';
    });

    // Process content through pipeline
    const $ = cheerio.load(html);
    const pipelineResult = await processContentWithCheerio($, $('body'), {
      enableHtmlProcessing: true,
      enableMarkdownConversion: true,
      enableTextExtraction: true,
      extractMainContent: true,
    });

    // Use pipeline results, fallback to existing text if pipeline text is shorter
    const markdown = pipelineResult.markdown || '';
    const processedText = pipelineResult.text || text.trim();
    const finalText = processedText.length > text.trim().length ? processedText : text.trim();

    console.log(`Job ${jobId}: LinkedIn scrape complete - HTML: ${html.length}, Text: ${finalText.length}`);

    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'LinkedIn scraper: Content extracted successfully',
      progress: 90,
    });

    return {
      html,
      markdown,
      text: finalText,
      finalUrl: page.url(),
      statusCode: 200,
      contentType: 'text/html',
      pageTitle,
      pageDescription: $('meta[name="description"]').attr('content') || '',
      requestCount: 1,
    };
  } catch (error: any) {
    console.error(`Job ${jobId}: LinkedIn scrape error:`, error.message);
    
    if (error.message.includes('authentication') || error.message.includes('login')) {
      throw new Error(
        'LinkedIn authentication failed. ' +
        'Please ensure you provide valid session cookies. ' +
        'You can extract cookies from your browser after logging into LinkedIn.'
      );
    }
    
    throw error;
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

/**
 * Helper function to extract LinkedIn cookies from browser
 * Users can run this in their browser console to get cookies
 */
export function getLinkedInCookieInstructions(): string {
  return `
To scrape LinkedIn, you need to provide your LinkedIn session cookies.

HOW TO GET LINKEDIN COOKIES:

1. Open LinkedIn in your browser and log in
2. Open Developer Tools (F12 or Cmd+Option+I)
3. Go to Application/Storage tab
4. Click on Cookies → https://www.linkedin.com
5. Copy these important cookies:
   - li_at (authentication token)
   - JSESSIONID (session ID)
   - bcookie (browser cookie)

Or use this JavaScript in your browser console:
\`\`\`javascript
document.cookie.split(';').map(c => {
  const [name, value] = c.trim().split('=');
  return { name, value, domain: '.linkedin.com', path: '/' };
}).filter(c => ['li_at', 'JSESSIONID', 'bcookie'].includes(c.name))
\`\`\`

SECURITY NOTE: Never share your LinkedIn cookies publicly. They give full access to your account.
`;
}



