/**
 * AI Agent Scraper
 * Uses AI to intelligently analyze pages, decide which links to follow,
 * and extract structured data - similar to MCP browser tools
 * Enhanced with comprehensive multi-page crawling capabilities
 */

import * as cheerio from 'cheerio';
import { geminiService } from '../../../lib/gemini';
import { ScrapeStatus } from '../scraper.types';
import type { ScrapedResult, ProgressEmitter } from './types';
import {
  CrawlingConfig,
  CrawlingStatistics,
} from '../../../lib/crawling/crawling.types';
import {
  DuplicateDetector,
  CrawlingQueue,
  LinkDiscoverer,
  CrawlingStatisticsTracker,
  normalizeUrl,
  extractDomain,
} from '../../../lib/crawling';
import { env } from '../../../config/env';
import { scraperActionsService } from '../scraper-actions.service';

// User agents
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

interface PageAnalysis {
  hasRelevantData: boolean;
  linksToFollow: string[];
  extractedData: any[];
  summary: string;
  ajaxEndpoints?: string[];
}

/**
 * Get crawling configuration from environment
 */
function getCrawlingConfig(baseUrl: string): CrawlingConfig {
  const baseDomain = extractDomain(baseUrl);
  
  return {
    maxPages: env.AI_AGENT_MAX_PAGES || 10,
    maxDepth: env.AI_AGENT_MAX_DEPTH || 3,
    maxAjaxEndpoints: env.AI_AGENT_MAX_AJAX_ENDPOINTS || 10,
    followExternalLinks: env.AI_AGENT_FOLLOW_EXTERNAL_LINKS || false,
    allowedDomains: [baseDomain], // Same domain by default
    blockedPatterns: [
      '/api/',
      '/ajax/',
      '/json/',
      '/xml/',
      '/rss/',
      '/feed/',
      '\\.pdf$',
      '\\.zip$',
      '\\.(jpg|jpeg|png|gif|svg)$',
    ],
    respectRobotsTxt: false,
    delayBetweenRequests: env.AI_AGENT_DELAY_BETWEEN_REQUESTS || 0,
    timeout: env.AI_AGENT_TIMEOUT || 5000,
  };
}

/**
 * Fetch a page/endpoint and return content
 */
async function fetchPage(url: string, acceptJson = false, timeout?: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutMs = timeout || env.AI_AGENT_TIMEOUT || 5000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': acceptJson ? 'application/json, text/html' : 'text/html',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Extract text and links from HTML
 */
function parseHtml(html: string, baseUrl: string): { 
  text: string; 
  links: { href: string; text: string }[];
  scripts: string[];
  ajaxTriggers: { text: string; dataAttr?: string }[];
} {
  const $ = cheerio.load(html);
  
  // Extract script content before removing
  const scripts: string[] = [];
  $('script').each((_, el) => {
    const content = $(el).html();
    if (content) scripts.push(content);
  });
  
  // Find elements that look like AJAX triggers
  const ajaxTriggers: { text: string; dataAttr?: string }[] = [];
  $('a[href="#"], a[href=""], [data-year], [data-id], [data-page], [onclick]').each((_, el) => {
    const text = $(el).text().trim();
    const dataYear = $(el).attr('data-year');
    const dataId = $(el).attr('data-id');
    const dataPage = $(el).attr('data-page');
    const onclick = $(el).attr('onclick');
    if (text) {
      ajaxTriggers.push({ 
        text, 
        dataAttr: dataYear || dataId || dataPage || onclick 
      });
    }
  });
  
  $('script, style, noscript, nav, footer, header').remove();
  
  const text = $('body').text().trim().replace(/\s+/g, ' ');
  
  const links: { href: string; text: string }[] = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const linkText = $(el).text().trim();
    if (href && linkText && !href.startsWith('#') && !href.startsWith('javascript:')) {
      const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
      links.push({ href: fullUrl, text: linkText });
    }
  });
  
  return { text, links, scripts, ajaxTriggers };
}

/**
 * Use AI to analyze a page and decide what to do
 */
async function analyzePageWithAI(
  pageText: string,
  links: { href: string; text: string }[],
  ajaxTriggers: { text: string; dataAttr?: string }[],
  task: string,
  visitedUrls: Set<string>
): Promise<PageAnalysis> {
  const unvisitedLinks = links.filter(l => !visitedUrls.has(normalizeUrl(l.href)));
  const linksInfo = unvisitedLinks
    .slice(0, 20)
    .map((l, i) => `[${i}] "${l.text}" -> ${l.href}`)
    .join('\n');
  
  const triggersInfo = ajaxTriggers.length > 0
    ? `\nAJAX TRIGGERS (clickable elements that load data dynamically):\n${ajaxTriggers.map(t => `- "${t.text}"${t.dataAttr ? ` (data: ${t.dataAttr})` : ''}`).join('\n')}`
    : '';

  const prompt = `You are a web scraping AI agent. Analyze this page and decide what to do.

TASK: ${task}

PAGE CONTENT (truncated):
${pageText.substring(0, 4000)}

AVAILABLE LINKS:
${linksInfo || 'No relevant links found'}
${triggersInfo}

INSTRUCTIONS:
1. Extract any data relevant to the task from this page
2. Identify which links (by index number) should be followed to get more data for the task
3. Only select links that will likely contain data relevant to the task
4. Note: If you see AJAX triggers (like year selectors), the data may be loaded dynamically

Respond with ONLY valid JSON:
{
  "hasRelevantData": true/false,
  "extractedData": [
    {"name": "...", "details": "...", ...}
  ],
  "linksToFollow": [0, 2, 5],
  "summary": "Brief description of what was found"
}

JSON Response:`;

  try {
    const response = await geminiService.chat('', [], prompt);
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { hasRelevantData: false, linksToFollow: [], extractedData: [], summary: 'Failed to parse AI response' };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Convert link indices to actual URLs
    const linksToFollow = (parsed.linksToFollow || [])
      .filter((i: number) => i >= 0 && i < unvisitedLinks.length)
      .map((i: number) => unvisitedLinks[i]?.href)
      .filter(Boolean);
    
    return {
      hasRelevantData: parsed.hasRelevantData || false,
      extractedData: parsed.extractedData || [],
      linksToFollow,
      summary: parsed.summary || '',
    };
  } catch (error: any) {
    console.error('AI analysis failed:', error.message);
    return { hasRelevantData: false, linksToFollow: [], extractedData: [], summary: 'AI analysis failed' };
  }
}

/**
 * Extract data from JSON response
 */
function extractFromJson(json: string, jobId: string): any[] {
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data)) return data;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.results && Array.isArray(data.results)) return data.results;
    if (data.items && Array.isArray(data.items)) return data.items;
    if (typeof data === 'object' && data !== null) return [data];
    return [];
  } catch (e) {
    console.log(`Job ${jobId}: Response is not JSON, treating as HTML`);
    return [];
  }
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * AI Agent Scraper - intelligently crawls and extracts data
 */
export async function scrapeWithAIAgent(
  url: string,
  jobId: string,
  task: string,
  emitProgress: ProgressEmitter
): Promise<ScrapedResult & { aiExtractedData: any[]; crawlingStatistics?: CrawlingStatistics }> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'AI Agent: Starting intelligent scrape...',
    progress: 10,
  });

  // Initialize crawling system
  const config = getCrawlingConfig(url);
  const duplicateDetector = new DuplicateDetector();
  const crawlingQueue = new CrawlingQueue();
  const linkDiscoverer = new LinkDiscoverer();
  const statisticsTracker = new CrawlingStatisticsTracker();

  // Normalize and add starting URL
  const normalizedStartUrl = normalizeUrl(url);
  duplicateDetector.addUrl(normalizedStartUrl);
  crawlingQueue.enqueue({
    url: normalizedStartUrl,
    depth: 0,
    discoveredAt: new Date(),
    status: 'pending',
  });

  const visitedAjaxEndpoints = new Set<string>();
  const allExtractedData: any[] = [];
  const allHtml: string[] = [];
  const allText: string[] = [];

  // Main crawling loop
  while (!crawlingQueue.isEmpty() && statisticsTracker['pagesVisited'] < config.maxPages) {
    const crawlPage = crawlingQueue.dequeue();
    if (!crawlPage) break;

    // Skip if beyond max depth
    if (crawlPage.depth > config.maxDepth) {
      statisticsTracker.recordSkipped();
      continue;
    }

    // Mark as visited
    crawlPage.status = 'visited';
    crawlPage.visitedAt = new Date();
    const pageStartTime = Date.now();

    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: `AI Agent: Analyzing page ${statisticsTracker['pagesVisited'] + 1}/${config.maxPages} (depth ${crawlPage.depth})...`,
      progress: 10 + Math.round((statisticsTracker['pagesVisited'] / config.maxPages) * 60),
    });

    console.log(`Job ${jobId}: AI Agent visiting ${crawlPage.url} (depth ${crawlPage.depth})`);

    scraperActionsService.analyze(jobId, `Analyzing page structure: ${crawlPage.url}`, { depth: crawlPage.depth });

    // Fetch the page
    scraperActionsService.action(jobId, `Fetching page: ${crawlPage.url}`);
    const html = await fetchPage(crawlPage.url, false, config.timeout);
    if (!html) {
      console.log(`Job ${jobId}: Failed to fetch ${crawlPage.url}`);
      crawlPage.status = 'failed';
      crawlPage.error = 'Failed to fetch';
      statisticsTracker.recordFailed();
      continue;
    }

    // Record page visit
    const pageTime = Date.now() - pageStartTime;
    statisticsTracker.recordPageVisit(crawlPage.depth, pageTime);

    allHtml.push(`<!-- PAGE: ${crawlPage.url} (depth ${crawlPage.depth}) -->\n${html}`);

    // Parse HTML
    scraperActionsService.action(jobId, 'Parsing HTML content');
    const { text, links, scripts, ajaxTriggers } = parseHtml(html, crawlPage.url);
    allText.push(`\n--- Page: ${crawlPage.url} (depth ${crawlPage.depth}) ---\n${text}`);

    scraperActionsService.observe(jobId, `Found ${links.length} links, ${ajaxTriggers.length} AJAX triggers`);

    // Discover links
    const discoveredLinks = linkDiscoverer.discoverLinks(
      html,
      crawlPage.url,
      config,
      crawlPage.depth,
      duplicateDetector.getVisitedUrls().reduce((set, url) => {
        set.add(url);
        return set;
      }, new Set<string>())
    );

    // Filter and prioritize links
    const filteredLinks = linkDiscoverer.filterLinks(
      discoveredLinks,
      config,
      new Set(duplicateDetector.getVisitedUrls()),
      crawlPage.url
    );
    const prioritizedLinks = linkDiscoverer.prioritizeLinks(filteredLinks, task);

    statisticsTracker.recordLinkDiscovery(prioritizedLinks.length);

    // Add links to queue
    for (const link of prioritizedLinks) {
      if (!duplicateDetector.hasUrl(link.url)) {
        duplicateDetector.addUrl(link.url);
        crawlingQueue.enqueue(link);
      } else {
        statisticsTracker.recordDuplicate();
      }
    }

    // Discover AJAX endpoints
    const ajaxEndpoints = linkDiscoverer.discoverAjaxEndpoints(
      crawlPage.url,
      scripts,
      ajaxTriggers
    ).slice(0, config.maxAjaxEndpoints);

    if (ajaxEndpoints.length > 0) {
      console.log(`Job ${jobId}: Detected ${ajaxEndpoints.length} potential AJAX endpoints`);

      emitProgress(jobId, {
        jobId,
        status: ScrapeStatus.RUNNING,
        message: `AI Agent: Found ${ajaxEndpoints.length} AJAX endpoints, fetching data...`,
        progress: 70,
      });

      // Fetch AJAX endpoints (with limit)
      for (const endpoint of ajaxEndpoints) {
        if (visitedAjaxEndpoints.has(endpoint)) continue;
        if (visitedAjaxEndpoints.size >= config.maxAjaxEndpoints) break;

        visitedAjaxEndpoints.add(endpoint);
        statisticsTracker.recordAjaxFetch();

        console.log(`Job ${jobId}: Fetching AJAX endpoint: ${endpoint}`);
        const ajaxResponse = await fetchPage(endpoint, true, config.timeout);

        if (ajaxResponse) {
          const jsonData = extractFromJson(ajaxResponse, jobId);
          if (jsonData.length > 0) {
            console.log(`Job ${jobId}: Got ${jsonData.length} items from AJAX endpoint`);
            scraperActionsService.extract(jobId, `Fetched ${jsonData.length} items from API`, { endpoint, itemCount: jsonData.length });
            allExtractedData.push(...jsonData);
            allText.push(`\n--- AJAX Data: ${endpoint} ---\n${JSON.stringify(jsonData, null, 2)}`);
          } else {
            const { text: ajaxText } = parseHtml(ajaxResponse, endpoint);
            if (ajaxText.length > 50) {
              scraperActionsService.extract(jobId, `Extracted ${ajaxText.length} chars from AJAX endpoint`, { endpoint });
              allText.push(`\n--- AJAX Content: ${endpoint} ---\n${ajaxText}`);
              allHtml.push(`<!-- AJAX: ${endpoint} -->\n${ajaxResponse}`);
            }
          }
        }

        // Respect delay between requests
        if (config.delayBetweenRequests > 0) {
          await delay(config.delayBetweenRequests);
        }
      }
    }

    // Discover frame URLs
    const frameUrls = linkDiscoverer.discoverFrameUrls(html, crawlPage.url);
    for (const frameUrl of frameUrls) {
      const normalizedFrameUrl = normalizeUrl(frameUrl, crawlPage.url);
      if (!duplicateDetector.hasUrl(normalizedFrameUrl) && !crawlingQueue.hasUrl(normalizedFrameUrl)) {
        duplicateDetector.addUrl(normalizedFrameUrl);
        crawlingQueue.enqueue({
          url: normalizedFrameUrl,
          depth: crawlPage.depth + 1,
          parentUrl: crawlPage.url,
          discoveredAt: new Date(),
          status: 'pending',
        });
      }
    }

    // Use AI to analyze the page (if we didn't get data from AJAX already)
    if (allExtractedData.length === 0 || crawlPage.depth === 0) {
      scraperActionsService.analyze(jobId, 'AI analyzing page content for relevant data', { url: crawlPage.url });
      const visitedSet = new Set(duplicateDetector.getVisitedUrls());
      const analysis = await analyzePageWithAI(text, links, ajaxTriggers, task, visitedSet);

      console.log(`Job ${jobId}: AI found ${analysis.extractedData.length} items, ${analysis.linksToFollow.length} links to follow`);

      if (analysis.extractedData.length > 0) {
        scraperActionsService.extract(jobId, `Extracted ${analysis.extractedData.length} data items from page`, { 
          itemCount: analysis.extractedData.length,
          url: crawlPage.url,
        });
        allExtractedData.push(...analysis.extractedData);
      }

      // Add AI-selected links to queue
      for (const linkUrl of analysis.linksToFollow) {
        const normalizedLink = normalizeUrl(linkUrl, crawlPage.url);
        if (!duplicateDetector.hasUrl(normalizedLink) && !crawlingQueue.hasUrl(normalizedLink)) {
          duplicateDetector.addUrl(normalizedLink);
          crawlingQueue.enqueue({
            url: normalizedLink,
            depth: crawlPage.depth + 1,
            parentUrl: crawlPage.url,
            discoveredAt: new Date(),
            status: 'pending',
          });
        } else {
          statisticsTracker.recordDuplicate();
        }
      }
    }

    // Respect delay between requests
    if (config.delayBetweenRequests > 0) {
      await delay(config.delayBetweenRequests);
    }
  }

  const statistics = statisticsTracker.getStatistics();

  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: `AI Agent: Visited ${statistics.pagesVisited} pages, ${statistics.ajaxEndpointsFetched} AJAX endpoints, extracted ${allExtractedData.length} items`,
    progress: 90,
  });

  const combinedHtml = allHtml.join('\n\n');
  const combinedText = allText.join('\n');

  const markdown = `# AI Agent Scrape Results

**Task:** ${task}
**Pages visited:** ${statistics.pagesVisited}
**AJAX endpoints fetched:** ${statistics.ajaxEndpointsFetched}
**Items extracted:** ${allExtractedData.length}
**Max depth reached:** ${statistics.depthReached}
**Links discovered:** ${statistics.linksDiscovered}
**Duplicates detected:** ${statistics.duplicatesDetected}
**Success rate:** ${(statistics.successRate * 100).toFixed(1)}%
**Total time:** ${(statistics.totalTime / 1000).toFixed(2)}s
**Average page time:** ${statistics.averagePageTime.toFixed(0)}ms

## Extracted Data

${JSON.stringify(allExtractedData, null, 2)}

## Raw Content

${combinedText}`;

  console.log(`Job ${jobId}: AI Agent complete - ${statistics.pagesVisited} pages, ${statistics.ajaxEndpointsFetched} AJAX endpoints, ${allExtractedData.length} items extracted`);

  return {
    html: combinedHtml,
    markdown,
    text: combinedText,
    finalUrl: url,
    statusCode: 200,
    contentType: 'text/html',
    pageTitle: `AI Agent Scrape: ${task}`,
    pageDescription: `Visited ${statistics.pagesVisited} pages, ${statistics.ajaxEndpointsFetched} AJAX endpoints, extracted ${allExtractedData.length} items`,
    requestCount: statistics.pagesVisited + statistics.ajaxEndpointsFetched,
    aiExtractedData: allExtractedData,
    crawlingStatistics: statistics,
  };
}
