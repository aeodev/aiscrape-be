/**
 * Cheerio Scraper
 * Lightweight scraping for static pages
 */

import { CheerioCrawler, Dataset, ProxyConfiguration } from 'crawlee';
import { ScrapeStatus } from '../scraper.types';
import { processContentWithCheerio } from '../../../lib/processing';
import { proxyManager } from '../../../lib/proxy';
import { env } from '../../../config/env';
import type { ScrapedResult, ProgressEmitter, ScraperOptions } from './types';

export async function scrapeWithCheerio(
  url: string,
  jobId: string,
  emitProgress: ProgressEmitter,
  options?: ScraperOptions
): Promise<ScrapedResult> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'Fetching page with Cheerio...',
    progress: 30,
  });

  // Configure proxy if enabled
  let proxyConfiguration: ProxyConfiguration | undefined;
  const useProxy = options?.useProxy ?? false;

  if (useProxy) {
    const proxy = proxyManager.getProxy();
    if (proxy) {
      proxyConfiguration = new ProxyConfiguration({
        proxyUrls: [proxy.url],
      });
      console.log(`Job ${jobId}: Using proxy ${proxy.id} for Cheerio scraper`);
    } else if (env.PROXY_URL) {
      // Fallback to direct PROXY_URL if proxy manager has no proxies
      proxyConfiguration = new ProxyConfiguration({
        proxyUrls: [env.PROXY_URL],
      });
    }
  }

  const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: 1,
    async requestHandler({ request, $, body, contentType }) {
      const pageTitle = $('title').text();
      const pageDescription = $('meta[name="description"]').attr('content') || '';

      // Process content through pipeline
      const pipelineResult = await processContentWithCheerio($, $('body'), {
        enableHtmlProcessing: true,
        enableMarkdownConversion: true,
        enableTextExtraction: true,
        extractMainContent: true,
      });

      const htmlBody = body.toString();
      const text = pipelineResult.text;
      const markdown = pipelineResult.markdown;

      console.log(`Job ${jobId}: Cheerio - Pushing data to Dataset - HTML: ${htmlBody.length} bytes, Text: ${text.length} chars`);

      await Dataset.pushData({
        url: request.url,
        html: htmlBody,
        markdown,
        text,
        pageTitle,
        pageDescription,
        contentType,
      });

      console.log(`Job ${jobId}: Cheerio - Data pushed to Dataset successfully`);
    },
  });

  await crawler.run([url]);

  const data = await Dataset.getData();
  const result = data.items[0] || {};

  // Debug logging
  console.log(`Job ${jobId}: Cheerio Dataset contains ${data.items.length} items`);
  console.log(`Job ${jobId}: Result HTML length: ${result.html?.length || 0}, Text length: ${result.text?.length || 0}`);

  if (!result.html || result.html.length < 100) {
    console.error(`Job ${jobId}: WARNING - Scraped HTML is too short or missing!`);
  }

  return {
    html: result.html || '',
    markdown: result.markdown || '',
    text: result.text || '',
    finalUrl: result.url || url,
    statusCode: 200,
    contentType: result.contentType || 'text/html',
    pageTitle: result.pageTitle || '',
    pageDescription: result.pageDescription || '',
    requestCount: 1,
  };
}






