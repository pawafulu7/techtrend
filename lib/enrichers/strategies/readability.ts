import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import logger from '@/lib/logger';

export interface ReadabilityResult {
  content: string;
  thumbnail?: string;
  title?: string;
}

export async function extractWithReadability(
  html: string,
  url: string,
  timeout: number = 5000
): Promise<ReadabilityResult | null> {
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), timeout)
  );

  const extractionPromise = (async (): Promise<ReadabilityResult | null> => {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.textContent) {
        return {
          content: article.textContent,
          thumbnail: article.siteName ? undefined : article.excerpt,
          title: article.title,
        };
      }

      return null;
    } catch (error) {
      logger.debug(
        {
          url,
          error: error instanceof Error ? error.message : String(error),
        },
        'Readability DOM parsing failed'
      );
      return null;
    }
  })();

  return Promise.race([extractionPromise, timeoutPromise]);
}
