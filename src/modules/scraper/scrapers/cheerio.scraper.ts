/**
 * Cheerio Scraper
 * Lightweight scraping for static pages
 */

import { CheerioCrawler, Dataset } from 'crawlee';
import { ScrapeStatus } from '../scraper.types';
import { htmlToMarkdown } from '../utils/html-converter';
import type { ScrapedResult, ProgressEmitter } from './types';

export async function scrapeWithCheerio(
  url: string,
  jobId: string,
  emitProgress: ProgressEmitter
): Promise<ScrapedResult> {
  emitProgress(jobId, {
    jobId,
    status: ScrapeStatus.RUNNING,
    message: 'Fetching page with Cheerio...',
    progress: 30,
  });

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    async requestHandler({ request, $, body, contentType }) {
      const pageTitle = $('title').text();
      const pageDescription = $('meta[name="description"]').attr('content') || '';

      // Extract text content
      const text = $('body').text().trim().replace(/\s+/g, ' ');

      // Convert to markdown
      const markdown = htmlToMarkdown($, $('body'));

      const htmlBody = body.toString();
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

