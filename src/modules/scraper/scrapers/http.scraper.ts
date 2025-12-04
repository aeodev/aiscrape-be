/**
 * HTTP Scraper - Fastest tier
 * Uses native fetch for HTTP requests (no ESM issues)
 * Parses with Cheerio - no browser overhead
 * Now with AJAX endpoint detection for dynamic content
 * Target: 80% of static sites in ~100-500ms
 */

import * as cheerio from 'cheerio';
import { ScrapeStatus } from '../scraper.types';
import { processContentWithCheerio } from '../../../lib/processing';
import { proxyManager } from '../../../lib/proxy';
import { scraperActionsService } from '../scraper-actions.service';
import type { ScrapedResult, ProgressEmitter, ScraperOptions } from './types';

// Timeout constants
const HTTP_TIMEOUT = 10000; // 10 seconds
const FRAME_TIMEOUT = 5000;
const DETAIL_TIMEOUT = 3000;
const AJAX_TIMEOUT = 3000;

// Content length thresholds
const MIN_HTML_LENGTH = 500;
const MIN_TEXT_LENGTH = 100;
const MIN_FRAME_TEXT_LENGTH = 50;
const MIN_DETAIL_TEXT_LENGTH = 30;

// Limits
const MAX_DETAIL_LINKS = 15;
const MAX_AJAX_ENDPOINTS = 10;

// User agents for rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchWithTimeout(
  url: string,
  timeout: number,
  headers?: Record<string, string>,
  useProxy?: boolean,
  proxyUrl?: string
): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchOptions: RequestInit = {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html, application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...headers,
      },
      redirect: 'follow',
      signal: controller.signal,
    };

    // Note: Node.js fetch() doesn't natively support proxies
    // For full proxy support, consider using https-proxy-agent library
    // For now, proxy is handled at the network level via environment variables
    if (useProxy && proxyUrl) {
      // Proxy URL is available but fetch() doesn't support it directly
      // This would require https-proxy-agent library
      console.log(`Proxy requested but fetch() doesn't support direct proxy configuration. Using network-level proxy if configured.`);
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    return response.ok ? response : null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

interface FrameResult {
  frameSrc: string;
  frameUrl: string;
  frameHtml: string;
  frameText: string;
  detailLinks: string[];
}

interface DetailResult {
  detailUrl: string;
  detailHtml: string;
  detailText: string;
}

interface AjaxResult {
  endpoint: string;
  data: any[];
  text: string;
}

/**
 * Detect AJAX triggers and generate endpoint URLs
 */
function detectAjaxEndpoints($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const endpoints: string[] = [];
  const urlObj = new URL(baseUrl);
  const triggers: string[] = [];

  // Find elements that look like AJAX triggers (links with # href)
  $('a[href="#"], a[href=""]').each((_, el) => {
    const text = $(el).text().trim();
    if (text && !triggers.includes(text)) {
      triggers.push(text);
    }
  });

  // Also check data attributes
  $('[data-year], [data-id], [data-page]').each((_, el) => {
    const dataYear = $(el).attr('data-year');
    const dataId = $(el).attr('data-id');
    const dataPage = $(el).attr('data-page');
    const value = dataYear || dataId || dataPage;
    if (value && !triggers.includes(value)) {
      triggers.push(value);
    }
  });

  // Check for year patterns (4-digit numbers like 2015, 2014)
  const yearTriggers = triggers.filter(t => /^\d{4}$/.test(t));
  if (yearTriggers.length > 0) {
    for (const year of yearTriggers) {
      // Common AJAX endpoint patterns for year-based data
      const possibleEndpoints = [
        `${urlObj.pathname}?ajax=true&year=${year}`,
        `${urlObj.pathname}?year=${year}`,
        `/api${urlObj.pathname}?year=${year}`,
      ];
      for (const ep of possibleEndpoints) {
        try {
          const fullUrl = new URL(ep, baseUrl).href;
          if (!endpoints.includes(fullUrl)) {
            endpoints.push(fullUrl);
          }
        } catch {
          // Invalid URL, skip
        }
      }
    }
  }

  // Check for numeric ID patterns
  const idTriggers = triggers.filter(t => /^\d{1,3}$/.test(t));
  if (idTriggers.length > 0) {
    for (const id of idTriggers) {
      const possibleEndpoints = [
        `${urlObj.pathname}?id=${id}`,
        `${urlObj.pathname}?page=${id}`,
      ];
      for (const ep of possibleEndpoints) {
        try {
          const fullUrl = new URL(ep, baseUrl).href;
          if (!endpoints.includes(fullUrl)) {
            endpoints.push(fullUrl);
          }
        } catch {
          // Invalid URL, skip
        }
      }
    }
  }

  return endpoints.slice(0, MAX_AJAX_ENDPOINTS);
}

/**
 * Try to parse response as JSON and extract data array
 */
function extractJsonData(responseText: string): any[] | null {
  try {
    const data = JSON.parse(responseText);
    if (Array.isArray(data)) return data;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.results && Array.isArray(data.results)) return data.results;
    if (data.items && Array.isArray(data.items)) return data.items;
    if (typeof data === 'object' && data !== null) return [data];
    return null;
  } catch {
    return null;
  }
}

export async function scrapeWithHttp(
  url: string,
  jobId: string,
  emitProgress: ProgressEmitter,
  options?: ScraperOptions
): Promise<ScrapedResult | null> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'Trying fast HTTP scrape...',
    progress: 25,
  });

  scraperActionsService.observe(jobId, `Fetching page: ${url}`);

  // Get proxy if enabled
  const useProxy = options?.useProxy ?? false;
  let proxy: { url: string; id: string } | null = null;
  if (useProxy) {
    proxy = proxyManager.getProxy();
    if (proxy) {
      console.log(`Job ${jobId}: Using proxy ${proxy.id} for HTTP scraper`);
      scraperActionsService.observe(jobId, `Using proxy: ${proxy.id}`);
    }
  }

  try {
    const startTime = Date.now();
    let requestCount = 1; // Start with 1 for the main request

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT);

    const response = await fetchWithTimeout(
      url,
      HTTP_TIMEOUT,
      undefined,
      useProxy,
      proxy?.url
    );

    if (!response) {
      if (proxy) {
        proxyManager.markProxyFailed(proxy.id);
      }
      return null;
    }

    // Mark proxy success if used
    if (proxy) {
      proxyManager.markProxySuccess(proxy.id, Date.now() - startTime);
    }

    if (!response.ok) {
      console.log(`Job ${jobId}: HTTP scrape returned ${response.status}`);
      if (proxy) {
        proxyManager.markProxyFailed(proxy.id);
      }
      return null;
    }

    let html = await response.text();
    const duration = Date.now() - startTime;

    // Validate we got actual HTML
    if (!html || html.length < MIN_HTML_LENGTH) {
      console.log(`Job ${jobId}: HTTP scrape returned too little content (${html?.length || 0} bytes)`);
      return null;
    }

    // Check if it's actually HTML
    if (!html.includes('<html') && !html.includes('<body') && !html.includes('<!DOCTYPE')) {
      console.log(`Job ${jobId}: HTTP response doesn't look like HTML`);
      return null;
    }

    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: 'Parsing HTML content...',
      progress: 40,
    });

    scraperActionsService.action(jobId, 'Parsing HTML content', { htmlLength: html.length });

    // Parse with Cheerio
    const $ = cheerio.load(html);
    const ajaxContents: string[] = [];
    const ajaxData: any[] = [];

    // Detect and fetch AJAX endpoints
    const ajaxEndpoints = detectAjaxEndpoints($, url);
    if (ajaxEndpoints.length > 0) {
      console.log(`Job ${jobId}: Detected ${ajaxEndpoints.length} potential AJAX endpoints`);
      
      scraperActionsService.observe(jobId, `Found ${ajaxEndpoints.length} AJAX endpoints`);
      
      emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: `Fetching ${ajaxEndpoints.length} AJAX endpoints...`,
        progress: 45,
      });

      // Fetch AJAX endpoints in parallel
      const ajaxPromises = ajaxEndpoints.map(async (endpoint): Promise<AjaxResult | null> => {
        scraperActionsService.action(jobId, `Fetching AJAX endpoint: ${endpoint}`);
        const ajaxResponse = await fetchWithTimeout(endpoint, AJAX_TIMEOUT, undefined, useProxy, proxy?.url);
        if (!ajaxResponse) return null;

        const responseText = await ajaxResponse.text();
        
        // Try JSON first
        const jsonData = extractJsonData(responseText);
        if (jsonData && jsonData.length > 0) {
          return {
            endpoint,
            data: jsonData,
            text: JSON.stringify(jsonData, null, 2),
          };
        }

        // Fall back to HTML parsing
        if (responseText.includes('<') && responseText.length > 50) {
          const $ajax = cheerio.load(responseText);
          $ajax('script, style').remove();
          const ajaxText = $ajax('body').length > 0 
            ? $ajax('body').text().trim().replace(/\s+/g, ' ')
            : $ajax.text().trim().replace(/\s+/g, ' ');
          
          if (ajaxText.length > 30) {
            return {
              endpoint,
              data: [],
              text: ajaxText,
            };
          }
        }

        return null;
      });

      const ajaxResults = await Promise.all(ajaxPromises);
      const validAjax = ajaxResults.filter((r): r is AjaxResult => r !== null);
      requestCount += validAjax.length;

      for (const result of validAjax) {
        console.log(`Job ${jobId}: Got AJAX data from ${result.endpoint} (${result.data.length} items)`);
        if (result.data.length > 0) {
          ajaxData.push(...result.data);
        }
        ajaxContents.push(`\n--- AJAX: ${result.endpoint} ---\n${result.text}`);
        html += `\n<!-- AJAX: ${result.endpoint} -->\n${result.text}`;
      }
    }

    // Check for frames/iframes and fetch their content directly
    const iframes = $('iframe');
    const frames = $('frame');
    const frameContents: string[] = [];
    
    if (iframes.length > 0 || frames.length > 0) {
      console.log(`Job ${jobId}: Page has ${iframes.length} iframes and ${frames.length} frames - fetching frame content`);
      scraperActionsService.observe(jobId, `Found ${iframes.length} iframes and ${frames.length} frames`);
      
      // Collect frame URLs
      const frameUrls: { src: string; resolvedUrl: string }[] = [];
      iframes.each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          const resolvedUrl = src.startsWith('http') ? src : new URL(src, url).href;
          frameUrls.push({ src, resolvedUrl });
        }
      });
      frames.each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          const resolvedUrl = src.startsWith('http') ? src : new URL(src, url).href;
          frameUrls.push({ src, resolvedUrl });
        }
      });
      
      // Fetch all frames in parallel
      const framePromises = frameUrls.map(async ({ src, resolvedUrl }): Promise<FrameResult | null> => {
        console.log(`Job ${jobId}: Fetching frame content from ${resolvedUrl}`);
        const frameResponse = await fetchWithTimeout(resolvedUrl, FRAME_TIMEOUT, undefined, useProxy, proxy?.url);
        
        if (!frameResponse) return null;
        
        const frameHtml = await frameResponse.text();
        const $frame = cheerio.load(frameHtml);
        $frame('script, style, noscript, nav, footer, header').remove();
        const frameText = $frame('body').text().trim().replace(/\s+/g, ' ');
        
        if (frameText.length <= MIN_FRAME_TEXT_LENGTH) return null;
        
        // Collect detail links from frame
        const detailLinks: string[] = [];
        $frame('a').each((_, el) => {
          const href = $frame(el).attr('href');
          const text = $frame(el).text().toLowerCase().trim();
          const className = $frame(el).attr('class') || '';
          
          const isDetailLink = 
            text.includes('learn') ||
            text.includes('more') ||
            text.includes('detail') ||
            text.includes('view') ||
            text.includes('→') ||
            text.includes('>>') ||
            className.includes('btn');
          
          if (href && isDetailLink && !href.includes('#') && !href.startsWith('javascript:')) {
            const detailUrl = href.startsWith('http') ? href : new URL(href, resolvedUrl).href;
            if (!detailLinks.includes(detailUrl) && !detailUrl.includes('back') && detailUrl !== resolvedUrl) {
              detailLinks.push(detailUrl);
            }
          }
        });
        
        return { frameSrc: src, frameUrl: resolvedUrl, frameHtml, frameText, detailLinks };
      });
      
      const frameResults = await Promise.all(framePromises);
      const validFrames = frameResults.filter((r): r is FrameResult => r !== null);
      requestCount += validFrames.length;
      
      // Collect all detail links from all frames
      const allDetailLinks: { detailUrl: string; frameUrl: string }[] = [];
      for (const frame of validFrames) {
        console.log(`Job ${jobId}: Got ${frame.frameText.length} chars from frame ${frame.frameSrc}`);
        frameContents.push(`\n--- Frame: ${frame.frameSrc} ---\n${frame.frameText}`);
        html += `\n<!-- FRAME: ${frame.frameSrc} -->\n${frame.frameHtml}`;
        
        for (const detailUrl of frame.detailLinks.slice(0, MAX_DETAIL_LINKS)) {
          if (!allDetailLinks.some(d => d.detailUrl === detailUrl)) {
            allDetailLinks.push({ detailUrl, frameUrl: frame.frameUrl });
          }
        }
      }
      
      // Fetch all detail pages in parallel (limit total)
      if (allDetailLinks.length > 0) {
        console.log(`Job ${jobId}: Found ${allDetailLinks.length} detail links to follow`);
        
        const detailPromises = allDetailLinks.slice(0, MAX_DETAIL_LINKS).map(
          async ({ detailUrl }): Promise<DetailResult | null> => {
            const detailResponse = await fetchWithTimeout(detailUrl, DETAIL_TIMEOUT, undefined, useProxy, proxy?.url);
            
            if (!detailResponse) return null;
            
            const detailHtml = await detailResponse.text();
            const $detail = cheerio.load(detailHtml);
            $detail('script, style, noscript, nav, footer, header').remove();
            const detailText = $detail('body').text().trim().replace(/\s+/g, ' ');
            
            if (detailText.length <= MIN_DETAIL_TEXT_LENGTH) return null;
            
            return { detailUrl, detailHtml, detailText };
          }
        );
        
        const detailResults = await Promise.all(detailPromises);
        const validDetails = detailResults.filter((r): r is DetailResult => r !== null);
        requestCount += validDetails.length;
        
        for (const detail of validDetails) {
          console.log(`Job ${jobId}: Got detail page ${detail.detailUrl.split('/').pop()}`);
          frameContents.push(`\n--- Detail: ${detail.detailUrl} ---\n${detail.detailText}`);
          html += `\n<!-- DETAIL: ${detail.detailUrl} -->\n${detail.detailHtml}`;
        }
      }
    }

    const pageTitle = $('title').text().trim();
    const pageDescription = $('meta[name="description"]').attr('content')?.trim() || 
                           $('meta[property="og:description"]').attr('content')?.trim() || '';
    
    // Try to find main content area
    const mainContent = $('main, article, [role="main"], .content, #content, .post, .article').first();
    const contentElement = mainContent.length > 0 ? mainContent : $('body');

    // Process content through pipeline
    scraperActionsService.action(jobId, 'Extracting text content from HTML');
    const pipelineResult = await processContentWithCheerio($, contentElement, {
      enableHtmlProcessing: true,
      enableMarkdownConversion: true,
      enableTextExtraction: true,
      extractMainContent: true,
    });

    let text = pipelineResult.text;
    let markdown = pipelineResult.markdown;
    
    scraperActionsService.extract(jobId, `Extracted ${text.length} characters of text`, { textLength: text.length });
    
    // Add AJAX content to text
    if (ajaxContents.length > 0) {
      scraperActionsService.extract(jobId, `Added ${ajaxContents.length} AJAX response(s) to content`);
      text += '\n\n--- AJAX Data ---\n' + ajaxContents.join('\n');
      console.log(`Job ${jobId}: Added ${ajaxContents.length} AJAX response(s) to text`);
    }
    
    // Add frame contents to text
    if (frameContents.length > 0) {
      scraperActionsService.extract(jobId, `Added ${frameContents.length} frame(s) content to text`);
      text += '\n\n' + frameContents.join('\n');
      console.log(`Job ${jobId}: Added ${frameContents.length} frame(s) content to text`);
    }

    // Validate content quality
    if (text.length < MIN_TEXT_LENGTH) {
      console.log(`Job ${jobId}: HTTP scrape got too little text (${text.length} chars) - may need JS`);
      return null;
    }

    console.log(`Job ${jobId}: HTTP scrape SUCCESS in ${duration}ms - ${html.length} bytes HTML, ${text.length} chars text, ${requestCount} requests`);

    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: `HTTP scrape completed in ${duration}ms`,
      progress: 50,
    });

    return {
      html,
      markdown,
      text,
      finalUrl: response.url || url,
      statusCode: response.status,
      contentType: response.headers.get('content-type') || 'text/html',
      pageTitle,
      pageDescription,
      requestCount,
    };
  } catch (error: unknown) {
    const err = error as Error;
    if (err.name === 'AbortError') {
      console.log(`Job ${jobId}: HTTP scrape timed out after ${HTTP_TIMEOUT}ms`);
    } else {
      console.log(`Job ${jobId}: HTTP scrape failed - ${err.message}`);
    }
    return null; // Return null to trigger next tier
  }
}
