/**
 * AI Agent Scraper
 * Uses AI to intelligently analyze pages, decide which links to follow,
 * and extract structured data - similar to MCP browser tools
 */

import * as cheerio from 'cheerio';
import { geminiService } from '../../../lib/gemini';
import { ScrapeStatus } from '../scraper.types';
import type { ScrapedResult, ProgressEmitter } from './types';

const AGENT_TIMEOUT = 5000;
const MAX_PAGES_TO_VISIT = 10;

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
}

/**
 * Fetch a page and return its HTML
 */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AGENT_TIMEOUT);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html',
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
function parseHtml(html: string, baseUrl: string): { text: string; links: { href: string; text: string }[] } {
  const $ = cheerio.load(html);
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
  
  return { text, links };
}

/**
 * Use AI to analyze a page and decide what to do
 */
async function analyzePageWithAI(
  pageText: string,
  links: { href: string; text: string }[],
  task: string,
  visitedUrls: string[]
): Promise<PageAnalysis> {
  const linksInfo = links
    .filter(l => !visitedUrls.includes(l.href))
    .slice(0, 20)
    .map((l, i) => `[${i}] "${l.text}" -> ${l.href}`)
    .join('\n');

  const prompt = `You are a web scraping AI agent. Analyze this page and decide what to do.

TASK: ${task}

PAGE CONTENT (truncated):
${pageText.substring(0, 4000)}

AVAILABLE LINKS:
${linksInfo || 'No relevant links found'}

INSTRUCTIONS:
1. Extract any data relevant to the task from this page
2. Identify which links (by index number) should be followed to get more data for the task
3. Only select links that will likely contain data relevant to the task

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
    
    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { hasRelevantData: false, linksToFollow: [], extractedData: [], summary: 'Failed to parse AI response' };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Convert link indices to actual URLs
    const linksToFollow = (parsed.linksToFollow || [])
      .filter((i: number) => i >= 0 && i < links.length)
      .map((i: number) => links.filter(l => !visitedUrls.includes(l.href))[i]?.href)
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
 * AI Agent Scraper - intelligently crawls and extracts data
 */
export async function scrapeWithAIAgent(
  url: string,
  jobId: string,
  task: string,
  emitProgress: ProgressEmitter
): Promise<ScrapedResult & { aiExtractedData: any[] }> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'AI Agent: Starting intelligent scrape...',
    progress: 20,
  });

  const visitedUrls: string[] = [];
  const allExtractedData: any[] = [];
  const allHtml: string[] = [];
  const allText: string[] = [];
  const pagesToVisit: string[] = [url];
  
  let pagesVisited = 0;

  while (pagesToVisit.length > 0 && pagesVisited < MAX_PAGES_TO_VISIT) {
    const currentUrl = pagesToVisit.shift()!;
    if (visitedUrls.includes(currentUrl)) continue;
    
    visitedUrls.push(currentUrl);
    pagesVisited++;

    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: `AI Agent: Analyzing page ${pagesVisited}/${MAX_PAGES_TO_VISIT}...`,
      progress: 20 + Math.round((pagesVisited / MAX_PAGES_TO_VISIT) * 50),
    });

    console.log(`Job ${jobId}: AI Agent visiting ${currentUrl}`);
    
    // Fetch the page
    const html = await fetchPage(currentUrl);
    if (!html) {
      console.log(`Job ${jobId}: Failed to fetch ${currentUrl}`);
      continue;
    }
    
    allHtml.push(`<!-- PAGE: ${currentUrl} -->\n${html}`);
    
    // Parse HTML
    const { text, links } = parseHtml(html, currentUrl);
    allText.push(`\n--- Page: ${currentUrl} ---\n${text}`);
    
    // Also check for frames/iframes
    const $ = cheerio.load(html);
    const frameUrls: string[] = [];
    $('iframe, frame').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        const frameUrl = src.startsWith('http') ? src : new URL(src, currentUrl).href;
        if (!visitedUrls.includes(frameUrl) && !pagesToVisit.includes(frameUrl)) {
          frameUrls.push(frameUrl);
        }
      }
    });
    
    // Add frame URLs to visit
    pagesToVisit.push(...frameUrls);
    
    // Use AI to analyze the page
    const analysis = await analyzePageWithAI(text, links, task, visitedUrls);
    
    console.log(`Job ${jobId}: AI found ${analysis.extractedData.length} items, ${analysis.linksToFollow.length} links to follow`);
    
    // Collect extracted data
    if (analysis.extractedData.length > 0) {
      allExtractedData.push(...analysis.extractedData);
    }
    
    // Add links to visit (if we haven't hit the limit)
    for (const link of analysis.linksToFollow) {
      if (!visitedUrls.includes(link) && !pagesToVisit.includes(link)) {
        pagesToVisit.push(link);
      }
    }
  }

  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: `AI Agent: Visited ${pagesVisited} pages, extracted ${allExtractedData.length} items`,
    progress: 80,
  });

  const combinedHtml = allHtml.join('\n\n');
  const combinedText = allText.join('\n');
  
  // Generate final markdown summary
  const markdown = `# AI Agent Scrape Results\n\n**Task:** ${task}\n**Pages visited:** ${pagesVisited}\n**Items extracted:** ${allExtractedData.length}\n\n## Extracted Data\n\n${JSON.stringify(allExtractedData, null, 2)}\n\n## Raw Content\n\n${combinedText}`;

  console.log(`Job ${jobId}: AI Agent complete - ${pagesVisited} pages, ${allExtractedData.length} items extracted`);

  return {
    html: combinedHtml,
    markdown,
    text: combinedText,
    finalUrl: url,
    statusCode: 200,
    contentType: 'text/html',
    pageTitle: `AI Agent Scrape: ${task}`,
    pageDescription: `Visited ${pagesVisited} pages, extracted ${allExtractedData.length} items`,
    requestCount: pagesVisited,
    aiExtractedData: allExtractedData,
  };
}

