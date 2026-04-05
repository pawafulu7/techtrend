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
import sanitizeHtml from 'sanitize-html';
import { logger } from '@/lib/logger';

// Constants
const MAX_HTML_SIZE = 500_000; // 500KB - 99% of tech articles are under this
const DEFAULT_TIMEOUT = 5000; // 5 seconds

export interface ReadabilityResult {
  content: string;
  thumbnail?: string;
  title?: string;
}

interface ReadabilityWorkerResult {
  success: boolean;
  content: string | null;
  thumbnail: string | undefined;
  title: string | undefined;
  error?: string;
}

/**
 * Strip heavy content from HTML before Worker transfer.
 * Uses sanitize-html library for robust HTML sanitization (CodeQL recommended).
 * Removes scripts, styles, and transforms base64 images to reduce size.
 */
function stripHeavyContent(html: string): string {
  // Use sanitize-html to properly remove script/style tags
  // This handles edge cases that regex cannot (e.g., </script\t\n bar>)
  const sanitized = sanitizeHtml(html, {
    // Allow all tags except script and style
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'article',
      'section',
      'header',
      'footer',
      'nav',
      'aside',
      'figure',
      'figcaption',
      'main',
      'time',
      'mark',
      'details',
      'summary',
    ]),
    // Explicitly exclude dangerous tags
    exclusiveFilter: (frame) => {
      // Remove script and style elements
      if (frame.tag === 'script' || frame.tag === 'style') {
        return true;
      }
      // Remove img tags with base64 data URIs to reduce size
      if (
        frame.tag === 'img' &&
        typeof frame.attribs?.src === 'string' &&
        frame.attribs.src.startsWith('data:image/')
      ) {
        return true;
      }
      return false;
    },
    // Allow all attributes (we're only stripping heavy content, not sanitizing for XSS)
    allowedAttributes: false,
  });

  return sanitized;
}

/**
 * Resolve Worker file path.
 * Always uses JavaScript file for Worker Threads compatibility.
 * (Node.js Worker Threads cannot directly execute TypeScript)
 */
function getWorkerPath(): string {
  return path.resolve(__dirname, '../../workers/readability-worker.js');
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

      worker.on('message', (result: ReadabilityWorkerResult) => {
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
              logger.debug(
                { url, errorMessage: result.error },
                'Readability worker returned error'
              );
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
          logger.debug({ url, err: error }, 'Readability worker error');
          resolve(null);
        }
      });

      worker.on('exit', (code) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          cleanup();
          if (code !== 0) {
            logger.debug(
              { url, exitCode: code },
              'Readability worker exited with error'
            );
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
          {
            url,
            err: error instanceof Error ? error : new Error(String(error)),
          },
          'Failed to spawn Readability worker'
        );
        resolve(null);
      }
    }
  });
}
