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

type JsdomErrorType =
  | 'css-parsing'
  | 'resource-loading'
  | 'not-implemented'
  | 'unhandled-exception';

interface JsdomError extends Error {
  type: JsdomErrorType;
}

const isJsdomError = (err: unknown): err is JsdomError =>
  typeof err === 'object' &&
  err !== null &&
  'type' in err &&
  typeof (err as { type?: unknown }).type === 'string';

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
      const { JSDOM, VirtualConsole } = await loadJsdom();

      // Suppress noisy CSS parse warnings while keeping genuine errors
      const virtualConsole = new VirtualConsole();

      // Handle console.error calls from scripts
      virtualConsole.on('error', (msg) => {
        logger.warn({ msg }, '[jsdom] console.error');
      });

      // Handle jsdom internal errors (CSS parsing, etc.)
      virtualConsole.on('jsdomError', (err) => {
        if (isJsdomError(err) && err.type === 'css-parsing') return; // Suppress CSS warnings
        logger.error({ err }, '[jsdom]');
      });

      const dom = new JSDOM(html, { url, virtualConsole });
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
