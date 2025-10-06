import type { CheerioAPI } from 'cheerio';

export function extractFromParagraphs(
  $: CheerioAPI,
  minParagraphLength: number = 50
): string | null {
  const paragraphs: string[] = [];

  $('p').each((_, element) => {
    const text = $(element).text().trim();
    if (text.length > minParagraphLength) {
      paragraphs.push(text);
    }
  });

  return paragraphs.length > 0 ? paragraphs.join('\n\n') : null;
}
