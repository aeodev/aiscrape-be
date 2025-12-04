/**
 * Jina Reader API Scraper - Second tier
 * Uses Jina's free Reader API for JS-rendered content
 * Returns clean markdown directly
 * Target: JS-heavy sites in ~1-3s
 */

import { ScrapeStatus } from '../scraper.types';
import { proxyManager } from '../../../lib/proxy';
import { scraperActionsService } from '../scraper-actions.service';
import type { ScrapedResult, ProgressEmitter, ScraperOptions } from './types';

const JINA_READER_URL = 'https://r.jina.ai';
const JINA_TIMEOUT = 15000; // 15 seconds

export async function scrapeWithJina(
  url: string,
  jobId: string,
  emitProgress: ProgressEmitter,
  options?: ScraperOptions
): Promise<ScrapedResult | null> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'Trying Jina Reader API...',
    progress: 35,
  });

  scraperActionsService.action(jobId, 'Calling Jina Reader API', { url });

  // Get proxy if enabled
  const useProxy = options?.useProxy ?? false;
  let proxy: { url: string; id: string } | null = null;
  if (useProxy) {
    proxy = proxyManager.getProxy();
    if (proxy) {
      console.log(`Job ${jobId}: Using proxy ${proxy.id} for Jina scraper`);
    }
  }

  try {
    const startTime = Date.now();
    const jinaUrl = `${JINA_READER_URL}/${url}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), JINA_TIMEOUT);

    // Note: Jina API doesn't support proxy configuration directly
    // Proxy would need to be configured at network level or via https-proxy-agent
    const response = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain',
        'User-Agent': 'AIScrape/1.0',
      },
      signal: controller.signal,
    });

    // Mark proxy success/failure if used
    if (proxy) {
      if (response.ok) {
        proxyManager.markProxySuccess(proxy.id, Date.now() - startTime);
      } else {
        proxyManager.markProxyFailed(proxy.id);
      }
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`Job ${jobId}: Jina API returned ${response.status}`);
      return null;
    }

    const markdown = await response.text();
    const duration = Date.now() - startTime;

    // Validate content
    if (!markdown || markdown.length < 100) {
      console.log(`Job ${jobId}: Jina returned too little content (${markdown?.length || 0} chars)`);
      return null;
    }

    // Check for error responses
    if (markdown.includes('Error:') || markdown.includes('Failed to')) {
      console.log(`Job ${jobId}: Jina returned an error response`);
      return null;
    }

    emitProgress(jobId, {
      jobId,
      status: ScrapeStatus.RUNNING,
      message: `Jina Reader completed in ${duration}ms`,
      progress: 55,
    });

    scraperActionsService.action(jobId, 'Processing Jina API response');
    scraperActionsService.extract(jobId, 'Extracting markdown and text from response', {
      markdownLength: markdown.length,
    });

    // Extract title from markdown (usually first # heading)
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const pageTitle = titleMatch ? titleMatch[1].trim() : '';

    // Extract first paragraph as description
    const paragraphs = markdown.split('\n\n').filter(p => p.trim() && !p.startsWith('#'));
    const pageDescription = paragraphs[0]?.substring(0, 200) || '';

    // Use markdown as both text and markdown (Jina returns clean markdown)
    const text = markdown
      .replace(/^#+\s+/gm, '') // Remove heading markers
      .replace(/\*\*|__/g, '') // Remove bold markers
      .replace(/\*|_/g, '') // Remove italic markers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .trim();

    console.log(`Job ${jobId}: Jina scrape SUCCESS in ${duration}ms - ${markdown.length} chars markdown`);

    return {
      html: `<html><body>${markdown}</body></html>`, // Minimal HTML wrapper
      markdown,
      text,
      finalUrl: url,
      statusCode: 200,
      contentType: 'text/markdown',
      pageTitle,
      pageDescription,
      requestCount: 1,
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log(`Job ${jobId}: Jina Reader timed out after ${JINA_TIMEOUT}ms`);
    } else {
      console.log(`Job ${jobId}: Jina scrape failed - ${error.message}`);
    }
    return null; // Return null to trigger next tier
  }
}






