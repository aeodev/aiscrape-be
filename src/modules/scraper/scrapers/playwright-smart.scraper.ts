/**
 * Smart Playwright Scraper with AI-Guided Interactions
 * Uses Playwright to render pages and AI to decide what to click
 * Captures network requests to find API endpoints
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as cheerio from 'cheerio';
import { geminiService } from '../../../lib/gemini';
import { ScrapeStatus } from '../scraper.types';
import { processContentWithCheerio } from '../../../lib/processing';
import { getRandomFingerprint, buildHeaders } from '../../../lib/scraping/headers';
import { scraperActionsService } from '../scraper-actions.service';
import type { ScrapedResult, ProgressEmitter } from './types';

const SMART_TIMEOUT = 30000; // 30s for smart scraping
const INTERACTION_TIMEOUT = 5000; // 5s per interaction
const MAX_INTERACTIONS = 10;

interface ClickableElement {
  selector: string;
  text: string;
  tagName: string;
  isLikelyDataTrigger: boolean;
}

interface NetworkCapture {
  url: string;
  method: string;
  response?: string;
  isJson: boolean;
}

/**
 * Analyze page and find clickable elements that might load data
 */
async function findClickableElements(page: Page): Promise<ClickableElement[]> {
  return await page.evaluate(() => {
    const elements: ClickableElement[] = [];
    
    // Find links with # href (likely AJAX triggers)
    document.querySelectorAll('a[href="#"], a[href=""]').forEach((el, index) => {
      const text = el.textContent?.trim() || '';
      if (text && text.length < 50) {
        elements.push({
          selector: `a[href="#"]:nth-of-type(${index + 1})`,
          text,
          tagName: 'a',
          isLikelyDataTrigger: /^\d{4}$/.test(text) || /^\d+$/.test(text) || text.toLowerCase().includes('view'),
        });
      }
    });

    // Find buttons and clickable divs
    document.querySelectorAll('button, [role="button"], [onclick], [data-year], [data-id]').forEach((el, index) => {
      const text = el.textContent?.trim() || '';
      const dataAttr = el.getAttribute('data-year') || el.getAttribute('data-id') || '';
      if ((text && text.length < 50) || dataAttr) {
        elements.push({
          selector: `[data-year="${dataAttr}"], [data-id="${dataAttr}"]`.replace(/\[\w+-=""\]/g, ''),
          text: text || dataAttr,
          tagName: el.tagName.toLowerCase(),
          isLikelyDataTrigger: true,
        });
      }
    });

    // Find tab-like elements
    document.querySelectorAll('[role="tab"], .tab, .nav-link, .nav-item a').forEach((el, index) => {
      const text = el.textContent?.trim() || '';
      if (text && text.length < 50) {
        elements.push({
          selector: `[role="tab"]:nth-of-type(${index + 1})`,
          text,
          tagName: el.tagName.toLowerCase(),
          isLikelyDataTrigger: true,
        });
      }
    });

    return elements;
  });
}

/**
 * Use AI to decide which elements to click
 */
async function getAIClickDecision(
  elements: ClickableElement[],
  userQuestion: string,
  pageText: string
): Promise<number[]> {
  if (!geminiService.isAvailable() || elements.length === 0) {
    // Default: click elements that look like data triggers (years, IDs)
    return elements
      .map((el, idx) => ({ el, idx }))
      .filter(({ el }) => el.isLikelyDataTrigger)
      .slice(0, 5)
      .map(({ idx }) => idx);
  }

  const elementsInfo = elements
    .slice(0, 20)
    .map((el, i) => `[${i}] "${el.text}" (${el.tagName})${el.isLikelyDataTrigger ? ' [likely data]' : ''}`)
    .join('\n');

  const prompt = `You are helping a web scraper decide which elements to click to load data.

USER'S GOAL: ${userQuestion}

PAGE CONTENT PREVIEW:
${pageText.substring(0, 1500)}

CLICKABLE ELEMENTS:
${elementsInfo}

Which elements should be clicked to load the data the user needs? 
- If user wants data by year, click all year elements
- If user wants all items, click elements that would show more data
- Return indices of elements to click (max 5)

Respond with ONLY a JSON array of indices, e.g.: [0, 1, 2]

JSON:`;

  try {
    const response = await geminiService.chat('', [], prompt);
    const match = response.match(/\[[\d,\s]*\]/);
    if (match) {
      const indices = JSON.parse(match[0]) as number[];
      return indices.filter(i => i >= 0 && i < elements.length).slice(0, MAX_INTERACTIONS);
    }
  } catch (error) {
    console.log('AI click decision failed, using defaults');
  }

  // Default fallback
  return elements
    .map((el, idx) => ({ el, idx }))
    .filter(({ el }) => el.isLikelyDataTrigger)
    .slice(0, 5)
    .map(({ idx }) => idx);
}

function extractAmazonDeals(data: any): string | null {
  if (!data || typeof data !== 'object') return null
  
  const deals: string[] = []
  
  function traverse(obj: any, path = ''): void {
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => traverse(item, `${path}[${idx}]`))
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const newPath = path ? `${path}.${key}` : key
        
        if (key.toLowerCase().includes('deal') || key.toLowerCase().includes('product') || key.toLowerCase().includes('item')) {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const dealObj = value as Record<string, any>
            const dealInfo: string[] = []
            if (dealObj.title || dealObj.name) dealInfo.push(`Title: ${dealObj.title || dealObj.name}`)
            if (dealObj.price || dealObj.priceDisplay) dealInfo.push(`Price: ${dealObj.price || dealObj.priceDisplay}`)
            if (dealObj.discount || dealObj.savings) dealInfo.push(`Discount: ${dealObj.discount || dealObj.savings}`)
            if (dealObj.rating) dealInfo.push(`Rating: ${dealObj.rating}`)
            if (dealInfo.length > 0) {
              deals.push(dealInfo.join(' | '))
            }
          }
        }
        
        traverse(value, newPath)
      }
    }
  }
  
  traverse(data)
  
  return deals.length > 0 ? deals.join('\n') : null
}

/**
 * Smart Playwright scraper with AI-guided interactions
 */
export async function scrapeWithSmartPlaywright(
  url: string,
  jobId: string,
  userQuestion: string,
  emitProgress: ProgressEmitter
): Promise<ScrapedResult> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'Smart scraper: Launching browser...',
    progress: 55,
  });

  scraperActionsService.action(jobId, 'Launching browser for smart scraping', { url });

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    // Get random browser fingerprint for better bot evasion
    const fingerprint = getRandomFingerprint();
    const headers = buildHeaders(fingerprint);

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled', // Hide automation
      ],
    });

    // Randomize viewport to avoid fingerprinting
    const viewportWidth = 1920 + Math.floor(Math.random() * 100);
    const viewportHeight = 1080 + Math.floor(Math.random() * 100);

    context = await browser.newContext({
      userAgent: fingerprint.userAgent,
      viewport: { width: viewportWidth, height: viewportHeight },
      locale: fingerprint.acceptLanguage.split(',')[0].split('-')[0] || 'en',
      timezoneId: 'America/New_York', // Common timezone
      extraHTTPHeaders: headers,
      // Remove automation indicators
      ignoreHTTPSErrors: false,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(SMART_TIMEOUT);

    // Remove webdriver property
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    // Capture network requests
    const networkCaptures: NetworkCapture[] = [];
    
    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      // Capture JSON responses (likely API calls)
      if (contentType.includes('json') || url.includes('ajax') || url.includes('api')) {
        try {
          const text = await response.text();
          networkCaptures.push({
            url,
            method: response.request().method(),
            response: text,
            isJson: contentType.includes('json'),
          });
        } catch {
          // Response body may not be available
        }
      }
    });

    // Navigate to page
    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'Smart scraper: Loading page...',
      progress: 60,
    });

    const isAmazon = url.toLowerCase().includes('amazon.com')
    const isEcommerce = url.toLowerCase().includes('shop') || url.toLowerCase().includes('store') || url.toLowerCase().includes('deal') || url.toLowerCase().includes('product')
    
    if (isAmazon || isEcommerce) {
      await page.goto(url, { waitUntil: 'networkidle', timeout: SMART_TIMEOUT })
      scraperActionsService.wait(jobId, 'Waiting for dynamic content to load (3-5s)')
      await page.waitForTimeout(3000 + Math.random() * 2000)
      
      if (isAmazon) {
        scraperActionsService.action(jobId, 'Scrolling page to load deals')
        await page.evaluate(async () => {
          await new Promise<void>((resolve) => {
            let totalHeight = 0
            const distance = 300
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight
              window.scrollBy(0, distance)
              totalHeight += distance
              
              if (totalHeight >= scrollHeight || totalHeight > 3000) {
                clearInterval(timer)
                resolve()
              }
            }, 200)
          })
        })
        scraperActionsService.wait(jobId, 'Waiting for deals to load after scroll (2s)')
        await page.waitForTimeout(2000)
        
        try {
          await page.waitForSelector('[data-testid*="deal"], [data-component-type*="deal"], .DealGrid, .deal-tile', { timeout: 5000 })
          scraperActionsService.observe(jobId, 'Deal elements detected')
        } catch {
          scraperActionsService.observe(jobId, 'Deal elements not found, proceeding with available content')
        }
      }
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: SMART_TIMEOUT })
      const humanDelay = 1000 + Math.random() * 2000
      await page.waitForTimeout(humanDelay)
    }

    // Get initial page state
    let html = await page.content()
    let text = await page.evaluate(() => document.body?.innerText || '')
    const pageTitle = await page.title()

    // Find clickable elements
    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'Smart scraper: Analyzing page for interactive elements...',
      progress: 65,
    });

    scraperActionsService.observe(jobId, 'Scanning page for clickable elements');
    const clickableElements = await findClickableElements(page);
    console.log(`Job ${jobId}: Found ${clickableElements.length} clickable elements`);
    scraperActionsService.observe(jobId, `Found ${clickableElements.length} clickable elements`);

    let indicesToClick: number[] = [];
    if (clickableElements.length > 0) {
      // Get AI decision on what to click
      scraperActionsService.analyze(jobId, 'AI analyzing which elements to click', {
        totalElements: clickableElements.length,
        userQuestion,
      });
      indicesToClick = await getAIClickDecision(clickableElements, userQuestion, text);
      console.log(`Job ${jobId}: AI decided to click ${indicesToClick.length} elements`);
      scraperActionsService.analyze(jobId, `AI decided to click ${indicesToClick.length} elements`);

      emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: `Smart scraper: Clicking ${indicesToClick.length} elements to load data...`,
        progress: 70,
      });

      // Click elements and collect data
      const collectedData: string[] = [];
      
      for (const idx of indicesToClick) {
        const element = clickableElements[idx];
        
        try {
          // Try to find and click the element
          const elementText = element.text;
          console.log(`Job ${jobId}: Clicking "${elementText}"...`);
          
          scraperActionsService.click(jobId, `Clicking button: "${elementText}"`, { elementIndex: idx });
          
          // Find by text content
          const clickTarget = await page.getByText(elementText, { exact: true }).first();
          
          if (await clickTarget.isVisible()) {
            await clickTarget.click();
            scraperActionsService.wait(jobId, 'Waiting for content to load (1.5s)');
            await page.waitForTimeout(1500); // Wait for content to load
            
            // Get updated content
            const newText = await page.evaluate(() => document.body?.innerText || '');
            if (newText.length > text.length + 100) {
              const charsAdded = newText.length - text.length;
              console.log(`Job ${jobId}: Got ${charsAdded} more chars after clicking "${elementText}"`);
              scraperActionsService.observe(jobId, `Content loaded: +${charsAdded} characters`, { elementText });
              collectedData.push(`\n--- After clicking "${elementText}" ---\n${newText}`);
            }
          }
        } catch (clickError: any) {
          console.log(`Job ${jobId}: Could not click "${element.text}": ${clickError.message}`);
        }
      }

      // Update HTML and text with all collected data
      html = await page.content();
      text = await page.evaluate(() => document.body?.innerText || '');
      
      if (collectedData.length > 0) {
        text += '\n\n--- Dynamically Loaded Content ---' + collectedData.join('\n');
      }
    }

    // Process captured network requests (API data)
    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'Smart scraper: Processing captured API responses...',
      progress: 85,
    });

    const jsonCaptures = networkCaptures.filter(c => c.isJson && c.response)
    if (jsonCaptures.length > 0) {
      console.log(`Job ${jobId}: Captured ${jsonCaptures.length} JSON API responses`)
      
      let apiDataText = '\n\n--- Captured API Data ---\n'
      for (const capture of jsonCaptures) {
        try {
          const data = JSON.parse(capture.response!)
          
          if (isAmazon) {
            const amazonDealData = extractAmazonDeals(data)
            if (amazonDealData) {
              apiDataText += `\n--- Amazon Deals Data ---\n${amazonDealData}\n`
            }
          }
          
          apiDataText += `\nAPI: ${capture.url}\n${JSON.stringify(data, null, 2)}\n`
        } catch {
          apiDataText += `\nAPI: ${capture.url}\n${capture.response}\n`
        }
      }
      text += apiDataText
      html += `\n<!-- CAPTURED API DATA -->\n<pre>${apiDataText}</pre>`
    }
    
    if (isAmazon) {
      const dealText = await page.evaluate(() => {
        const deals: string[] = []
        const selectors = [
          '[data-testid*="deal"]',
          '[data-component-type*="deal"]',
          '.DealGrid',
          '.deal-tile',
          '[data-asin]',
        ]
        
        selectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            const dealText = el.textContent?.trim()
            if (dealText && dealText.length > 20) {
              deals.push(dealText)
            }
          })
        })
        
        return deals.join('\n--- Deal ---\n')
      })
      
      if (dealText) {
        text += '\n\n--- Amazon Deals (Extracted from DOM) ---\n' + dealText
        scraperActionsService.extract(jobId, `Extracted ${dealText.split('--- Deal ---').length} deals from page`)
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

    // Use pipeline results, but preserve API data in text
    const markdown = pipelineResult.markdown || '';
    const processedText = pipelineResult.text || text;
    const finalText = processedText.length > text.length ? processedText : text;

    console.log(`Job ${jobId}: Smart Playwright complete - HTML: ${html.length}, Text: ${finalText.length}, APIs captured: ${jsonCaptures.length}`);

    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: `Smart scraper completed with ${jsonCaptures.length} API captures`,
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
      pageDescription: '',
      requestCount: 1 + indicesToClick?.length || 0,
    };
  } catch (error: any) {
    console.error(`Job ${jobId}: Smart Playwright error:`, error.message);
    throw error;
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}




