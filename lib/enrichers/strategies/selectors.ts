import type { CheerioAPI } from 'cheerio';

const CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '[role="article"]',
  '.article',
  '.post',
  '.entry-content',
  '.post-content',
  '.article-content',
  '.content-body',
  '.story-body',
  '#content',
  '.content',
  '.markdown-body',
  '.blob-wrapper',
  '.readme',
  '.documentation-content',
  '.doc-content',
];

const NOISE_SELECTORS = 'nav, aside, .sidebar, .navigation, .menu, .toc';

export function extractFromSelectors(
  $: CheerioAPI,
  minLength: number = 200
): string | null {
  for (const selector of CONTENT_SELECTORS) {
    const element = $(selector).first();
    if (!element.length) continue;

    const cleaned = element.clone();
    cleaned.find(NOISE_SELECTORS).remove();
    const text = cleaned.text().trim();

    if (text.length >= minLength) {
      return text;
    }
  }

  return null;
}
