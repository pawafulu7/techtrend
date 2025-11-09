import { Readability } from '@mozilla/readability';
import logger from '@/lib/logger';

let jsdomModulePromise: Promise<typeof import('jsdom')> | null = null;

async function loadJsdom() {
  if (!jsdomModulePromise) {
    jsdomModulePromise = import('jsdom'); // Lazy import keeps ESM-only jsdom external to Next's CJS bundle
  }
  return jsdomModulePromise;
}

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
      const { JSDOM } = await loadJsdom();
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.textContent) {
        return {
          content: article.textContent,
          thumbnail: article.siteName ? undefined : article.excerpt || undefined,
          title: article.title || undefined,
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
