import { AgentResponseCache } from '@/lib/cache/agent-response-cache';
import { ArticleQACache } from '@/lib/cache/article-qa-cache';
import { logger, sanitizeError } from '@/lib/logger';
import type { ModeContext } from './schemas';

export type CacheResolution =
  | { isArticleQa: true; articleQaCache: ArticleQACache; agentCache?: never }
  | {
      isArticleQa: false;
      agentCache: AgentResponseCache;
      articleQaCache?: never;
    };

/**
 * Resolve cache instances based on mode context.
 * Returns agentCache for article-search mode, articleQaCache for article-qa mode.
 */
export function resolveCaches(modeContext: ModeContext): CacheResolution {
  if (modeContext.isArticleQa) {
    return { isArticleQa: true, articleQaCache: new ArticleQACache() };
  }
  return { isArticleQa: false, agentCache: new AgentResponseCache() };
}

/**
 * Safely execute a cache read operation.
 * Returns null on any error (treats as cache miss).
 */
export async function safeReadCache<T>(
  readFn: () => Promise<T | null>,
  mode: string
): Promise<T | null> {
  try {
    return await readFn();
  } catch (cacheError) {
    logger.warn(
      { error: sanitizeError(cacheError), mode },
      'Cache read failed, treating as miss'
    );
    return null;
  }
}

/**
 * Safely execute a cache write operation.
 * Logs a warning on failure but does not rethrow.
 */
export async function safeWriteCache(
  writeFn: () => Promise<void>,
  context: { userId: string; queryPreview: string; mode: string }
): Promise<void> {
  try {
    await writeFn();
  } catch (cacheError) {
    logger.warn(
      { error: sanitizeError(cacheError), ...context },
      'Failed to cache response'
    );
  }
}
