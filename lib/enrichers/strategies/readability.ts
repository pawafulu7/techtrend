/**
 * Readability Strategy with Worker Threads
 *
 * Executes jsdom/Readability in a separate Worker Thread to prevent
 * the main event loop from being blocked by synchronous DOM parsing.
 *
 * Key features:
 * - Worker-based isolation: Timeouts work correctly even during heavy processing
 * - HTML size guard: Skips oversized HTML (>500KB) to prevent memory issues
 * - HTML preprocessing: Strips heavy content before Worker transfer
 * - Graceful degradation: Returns null on timeout/error for fallback strategies
 */
import { Worker } from 'worker_threads';
import * as path from 'path';
import { logger } from '@/lib/logger';

// Constants
const MAX_HTML_SIZE = 500_000; // 500KB - 99% of tech articles are under this
const DEFAULT_TIMEOUT = 5000; // 5 seconds

export interface ReadabilityResult {
  content: string;
  thumbnail?: string;
  title?: string;
}

interface WorkerResult {
  success: boolean;
  content: string | null;
  thumbnail: string | undefined;
  title: string | undefined;
  error?: string;
}

/**
 * Strip heavy content from HTML before Worker transfer.
 * Removes scripts, styles, comments, and base64 images to reduce size.
 *
 * Security: Uses fixed-point iteration to handle nested/overlapping patterns.
 * Regex patterns handle whitespace in closing tags (e.g., </script >).
 */
function stripHeavyContent(html: string): string {
  let previous: string;
  do {
    previous = html;
    html = html
      // Match script tags with optional whitespace in closing tag: </script > or </script>
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      // Match style tags with optional whitespace in closing tag
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
      // Match HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Match base64 data URIs
      .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '');
  } while (html !== previous);
  return html;
}

/**
 * Resolve Worker file path.
 * Always uses JavaScript file for Worker Threads compatibility.
 * (Node.js Worker Threads cannot directly execute TypeScript)
 */
function getWorkerPath(): string {
  return path.join(__dirname, '../../workers/readability-worker.js');
}

/**
 * Extract content using Mozilla Readability via Worker Thread.
 *
 * @param html - Raw HTML content
 * @param url - Source URL for relative link resolution
 * @param timeout - Maximum processing time in milliseconds (default: 5000)
 * @returns ReadabilityResult or null on timeout/error/oversized content
 */
export async function extractWithReadability(
  html: string,
  url: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<ReadabilityResult | null> {
  // Size guard: Skip oversized HTML to prevent memory issues
  const htmlSize = Buffer.byteLength(html, 'utf8');
  if (htmlSize > MAX_HTML_SIZE) {
    logger.warn(
      { url, size: htmlSize, maxSize: MAX_HTML_SIZE },
      'HTML too large for Readability, skipping'
    );
    return null;
  }

  // Preprocess: Strip heavy content
  const strippedHtml = stripHeavyContent(html);

  return new Promise((resolve) => {
    let isResolved = false;
    let worker: Worker | null = null;

    const cleanup = () => {
      if (worker) {
        worker.terminate().catch(() => {
          // Ignore termination errors
        });
        worker = null;
      }
    };

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        logger.warn({ url, timeout }, 'Readability worker timed out');
        cleanup();
        resolve(null);
      }
    }, timeout);

    try {
      const workerPath = getWorkerPath();
      worker = new Worker(workerPath, {
        workerData: { html: strippedHtml, url },
      });

      worker.on('message', (result: WorkerResult) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          cleanup();

          if (result.success && result.content) {
            resolve({
              content: result.content,
              thumbnail: result.thumbnail,
              title: result.title,
            });
          } else {
            if (result.error) {
              logger.debug({ url, error: result.error }, 'Readability worker returned error');
            }
            resolve(null);
          }
        }
      });

      worker.on('error', (error) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          cleanup();
          logger.debug({ url, error: error.message }, 'Readability worker error');
          resolve(null);
        }
      });

      worker.on('exit', (code) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          cleanup();
          if (code !== 0) {
            logger.debug({ url, exitCode: code }, 'Readability worker exited with error');
          }
          resolve(null);
        }
      });
    } catch (error) {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        cleanup();
        logger.error(
          { url, error: error instanceof Error ? error.message : String(error) },
          'Failed to spawn Readability worker'
        );
        resolve(null);
      }
    }
  });
}
