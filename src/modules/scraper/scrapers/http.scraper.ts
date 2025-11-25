/**
 * HTTP Scraper - Fastest tier
 * Uses native fetch for HTTP requests (no ESM issues)
 * Parses with Cheerio - no browser overhead
 * Target: 80% of static sites in ~100-500ms
 */

import * as cheerio from 'cheerio';
import { ScrapeStatus } from '../scraper.types';
import { htmlToMarkdown } from '../utils/html-converter';
import type { ScrapedResult, ProgressEmitter } from './types';

const HTTP_TIMEOUT = 10000; // 10 seconds

// User agents for rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function scrapeWithHttp(
  url: string,
  jobId: string,
  emitProgress: ProgressEmitter
): Promise<ScrapedResult | null> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'Trying fast HTTP scrape...',
    progress: 25,
  });

  try {
    const startTime = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`Job ${jobId}: HTTP scrape returned ${response.status}`);
      return null;
    }

    let html = await response.text();
    const duration = Date.now() - startTime;

    // Validate we got actual HTML
    if (!html || html.length < 500) {
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

    // Parse with Cheerio
    const $ = cheerio.load(html);

    // Check for frames/iframes and fetch their content directly
    const iframes = $('iframe');
    const frames = $('frame');
    const frameContents: string[] = [];
    
    if (iframes.length > 0 || frames.length > 0) {
      console.log(`Job ${jobId}: Page has ${iframes.length} iframes and ${frames.length} frames - fetching frame content`);
      
      // Collect frame URLs
      const frameUrls: string[] = [];
      iframes.each((_, el) => {
        const src = $(el).attr('src');
        if (src) frameUrls.push(src);
      });
      frames.each((_, el) => {
        const src = $(el).attr('src');
        if (src) frameUrls.push(src);
      });
      
      // Fetch each frame's content
      for (const frameSrc of frameUrls) {
        try {
          const frameUrl = frameSrc.startsWith('http') ? frameSrc : new URL(frameSrc, url).href;
          console.log(`Job ${jobId}: Fetching frame content from ${frameUrl}`);
          
          const frameController = new AbortController();
          const frameTimeoutId = setTimeout(() => frameController.abort(), 5000);
          
          const frameResponse = await fetch(frameUrl, {
            method: 'GET',
            headers: {
              'User-Agent': getRandomUserAgent(),
              'Accept': 'text/html',
            },
            signal: frameController.signal,
          });
          
          clearTimeout(frameTimeoutId);
          
          if (frameResponse.ok) {
            const frameHtml = await frameResponse.text();
            const $frame = cheerio.load(frameHtml);
            $frame('script, style, noscript, nav, footer, header').remove();
            const frameText = $frame('body').text().trim().replace(/\s+/g, ' ');
            
            if (frameText.length > 50) {
              console.log(`Job ${jobId}: Got ${frameText.length} chars from frame ${frameSrc}`);
              frameContents.push(`\n--- Frame: ${frameSrc} ---\n${frameText}`);
              html += `\n<!-- FRAME: ${frameSrc} -->\n${frameHtml}`;
              
              // Follow "Learn more" or detail links within the frame
              const detailLinks: string[] = [];
              $frame('a').each((_, el) => {
                const href = $frame(el).attr('href');
                const text = $frame(el).text().toLowerCase().trim();
                const className = $frame(el).attr('class') || '';
                
                // Match various detail link patterns
                const isDetailLink = 
                  text.includes('learn') ||
                  text.includes('more') ||
                  text.includes('detail') ||
                  text.includes('view') ||
                  text.includes('→') ||
                  text.includes('>>') ||
                  className.includes('btn');
                
                if (href && isDetailLink && !href.includes('#') && !href.startsWith('javascript:')) {
                  const detailUrl = href.startsWith('http') ? href : new URL(href, frameUrl).href;
                  // Avoid duplicates and back links
                  if (!detailLinks.includes(detailUrl) && !detailUrl.includes('back') && detailUrl !== frameUrl) {
                    detailLinks.push(detailUrl);
                  }
                }
              });
              
              // Fetch detail pages (limit to 15 to avoid overload)
              if (detailLinks.length > 0) {
                console.log(`Job ${jobId}: Found ${detailLinks.length} detail links to follow`);
                for (const detailUrl of detailLinks.slice(0, 15)) {
                  try {
                    const detailController = new AbortController();
                    const detailTimeout = setTimeout(() => detailController.abort(), 3000);
                    
                    const detailResponse = await fetch(detailUrl, {
                      method: 'GET',
                      headers: { 'User-Agent': getRandomUserAgent(), 'Accept': 'text/html' },
                      signal: detailController.signal,
                    });
                    clearTimeout(detailTimeout);
                    
                    if (detailResponse.ok) {
                      const detailHtml = await detailResponse.text();
                      const $detail = cheerio.load(detailHtml);
                      $detail('script, style, noscript, nav, footer, header').remove();
                      const detailText = $detail('body').text().trim().replace(/\s+/g, ' ');
                      
                      if (detailText.length > 30) {
                        console.log(`Job ${jobId}: Got detail page ${detailUrl.split('/').pop()}`);
                        frameContents.push(`\n--- Detail: ${detailUrl} ---\n${detailText}`);
                        html += `\n<!-- DETAIL: ${detailUrl} -->\n${detailHtml}`;
                      }
                    }
                  } catch (detailError: any) {
                    console.log(`Job ${jobId}: Failed to fetch detail ${detailUrl}: ${detailError.message}`);
                  }
                }
              }
            }
          }
        } catch (frameError: any) {
          console.log(`Job ${jobId}: Failed to fetch frame ${frameSrc}: ${frameError.message}`);
        }
      }
    }

    // Remove script, style, and other non-content elements
    $('script, style, noscript, iframe, svg, nav, footer, header, aside, [role="navigation"], [role="banner"], .advertisement, .ads, #ads').remove();

    const pageTitle = $('title').text().trim();
    const pageDescription = $('meta[name="description"]').attr('content')?.trim() || 
                           $('meta[property="og:description"]').attr('content')?.trim() || '';
    
    // Extract main content text
    const bodyText = $('body').text().trim().replace(/\s+/g, ' ');
    
    // Try to find main content area
    const mainContent = $('main, article, [role="main"], .content, #content, .post, .article').first();
    let text = mainContent.length > 0 
      ? mainContent.text().trim().replace(/\s+/g, ' ')
      : bodyText;
    
    // Add frame contents to text
    if (frameContents.length > 0) {
      text += '\n\n' + frameContents.join('\n');
      console.log(`Job ${jobId}: Added ${frameContents.length} frame(s) content to text`);
    }

    // Validate content quality
    if (text.length < 100) {
      console.log(`Job ${jobId}: HTTP scrape got too little text (${text.length} chars) - may need JS`);
      return null;
    }

    // Convert to markdown
    const markdown = htmlToMarkdown($, mainContent.length > 0 ? mainContent : $('body'));

    console.log(`Job ${jobId}: HTTP scrape SUCCESS in ${duration}ms - ${html.length} bytes HTML, ${text.length} chars text`);

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
      requestCount: 1,
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log(`Job ${jobId}: HTTP scrape timed out after ${HTTP_TIMEOUT}ms`);
    } else {
      console.log(`Job ${jobId}: HTTP scrape failed - ${error.message}`);
    }
    return null; // Return null to trigger next tier
  }
}
