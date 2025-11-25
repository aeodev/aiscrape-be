/**
 * HTML to Markdown converter
 * Uses flexible typing to work with both Cheerio versions (Crawlee vs standalone)
 */

// Use any for $ to support different Cheerio versions from Crawlee and standalone
type CheerioFunction = any;
type CheerioSelection = any;

/**
 * Simple HTML to Markdown converter
 */
export function htmlToMarkdown($: CheerioFunction, element: CheerioSelection): string {
  let markdown = '';

  element.contents().each((_: number, el: any) => {
    const $el = $(el);
    const tagName = el.tagName?.toLowerCase();

    if (el.type === 'text') {
      markdown += $el.text();
    } else if (tagName === 'h1') {
      markdown += `\n# ${$el.text()}\n\n`;
    } else if (tagName === 'h2') {
      markdown += `\n## ${$el.text()}\n\n`;
    } else if (tagName === 'h3') {
      markdown += `\n### ${$el.text()}\n\n`;
    } else if (tagName === 'p') {
      markdown += `${$el.text()}\n\n`;
    } else if (tagName === 'a') {
      const href = $el.attr('href');
      markdown += `[${$el.text()}](${href})`;
    } else if (tagName === 'img') {
      const src = $el.attr('src');
      const alt = $el.attr('alt') || '';
      markdown += `![${alt}](${src})`;
    } else if (tagName === 'ul' || tagName === 'ol') {
      $el.find('li').each((_: number, li: any) => {
        markdown += `- ${$(li).text()}\n`;
      });
      markdown += '\n';
    } else if (el.children) {
      markdown += htmlToMarkdown($, $el);
    }
  });

  return markdown.trim();
}
