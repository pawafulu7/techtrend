import { PrismaClient, Source, Prisma } from '@prisma/client';
import pLimit from 'p-limit';
import { Mutex } from 'async-mutex';
import * as fs from 'fs';

// PID file for exclusive execution control
const PID_FILE = process.env.COLLECT_FEEDS_PID_FILE || '/tmp/techtrend-collect-feeds.pid';

/**
 * Acquire exclusive lock using PID file
 * Returns true if lock acquired, false if another process is running
 */
function acquireLock(): boolean {
  if (fs.existsSync(PID_FILE)) {
    const oldPidStr = fs.readFileSync(PID_FILE, 'utf-8').trim();
    const oldPid = parseInt(oldPidStr, 10);

    if (!isNaN(oldPid)) {
      try {
        // Signal 0 checks if process exists without sending actual signal
        process.kill(oldPid, 0);
        console.error(`[WARN] collect-feeds already running (PID: ${oldPid}), exiting`);
        return false;
      } catch {
        // Process doesn't exist, stale PID file
        console.error(`[INFO] Removing stale PID file (old PID: ${oldPid})`);
      }
    }
  }

  // Create PID file
  fs.writeFileSync(PID_FILE, process.pid.toString());
  console.error(`[INFO] Lock acquired (PID: ${process.pid})`);
  return true;
}

/**
 * Release exclusive lock by removing PID file
 */
function releaseLock(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      const storedPidStr = fs.readFileSync(PID_FILE, 'utf-8').trim();
      const storedPid = parseInt(storedPidStr, 10);

      // Only remove if this process owns the lock
      if (storedPid === process.pid) {
        fs.unlinkSync(PID_FILE);
        console.error(`[INFO] Lock released (PID: ${process.pid})`);
      }
    }
  } catch (error) {
    // Cleanup failure is not fatal
    console.error(`[WARN] Failed to release lock: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate thumbnail URL
 * @param url - URL string to validate
 * @returns true if valid http/https URL
 */
function isValidThumbnailUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers(): void {
  const cleanup = (signal: string, exitCode: number) => {
    console.error(`[INFO] Received ${signal}, cleaning up...`);
    releaseLock();
    process.exit(exitCode);
  };

  process.on('exit', releaseLock);
  process.on('SIGINT', () => cleanup('SIGINT', 130));
  process.on('SIGTERM', () => cleanup('SIGTERM', 143));
}
import { isDuplicate } from '@/lib/utils/duplicate-detection';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { adjustTimezoneForArticle } from '@/lib/utils/date';
import { CategoryClassifier } from '@/lib/services/category-classifier';
import { normalizeTag } from '@/lib/utils/tag-normalizer';
import { HATENA_SOURCE_ID } from '@/lib/constants/source-ids';

// フェッチャーファクトリ（createFetcherですべてのソースを統一的に処理）
import { createFetcher } from '@/lib/fetchers';

// エンリッチャーをインポート
import { ContentEnricherFactory } from '@/lib/enrichers';
import { isHighQuality } from '@/lib/enrichers/strategies/quality';

const prisma = new PrismaClient();

/**
 * Local ArticleInfo for collect-feeds internal use.
 * Similar to lib/notification/types.ts ArticleInfo but kept separate
 * to avoid tight coupling between collection and notification layers.
 */
interface ArticleInfo {
  title: string;
  translatedTitle?: string | null;
  url: string;
  sourceName: string;
}

interface CollectResult {
  newArticles: number;
  duplicates: number;
  updated: number;
  newArticleIds: string[];
  articles: ArticleInfo[];
}

const DEFAULT_COLLECT_CONCURRENCY = 5;
const POST_SAVE_ENRICH_TIMEOUT_MS =
  Number(process.env.POST_SAVE_ENRICH_TIMEOUT_MS ?? '') || 10_000; // 10s default
const POST_SAVE_ENRICH_SLEEP_MS =
  Number(process.env.POST_SAVE_ENRICH_SLEEP_MS ?? '') || 0;

interface ProcessSourceContext {
  source: Source;
  recentTitlesSet: Set<string>;
  recentTitlesMutex: Mutex;
  enricherFactory: ContentEnricherFactory;
}

interface ProcessSourceResult {
  newArticles: number;
  duplicates: number;
  updated: number;
  newArticleIds: string[];
  articles: ArticleInfo[];
}

async function runWithTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      console.error(`[TIMEOUT] ${timeoutMessage}`);
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    // Call the task in a microtask so the timeout is armed even if the task body
    // does heavy synchronous work before its first await.
    const taskPromise = Promise.resolve().then(task);
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function resolveCollectConcurrency(): number {
  const rawValue = process.env.COLLECT_FEEDS_CONCURRENCY;
  if (!rawValue) {
    return DEFAULT_COLLECT_CONCURRENCY;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) {
    console.error(`[WARN] COLLECT_FEEDS_CONCURRENCYの値が不正です (${rawValue})。デフォルト${DEFAULT_COLLECT_CONCURRENCY}を使用します。`);
    return DEFAULT_COLLECT_CONCURRENCY;
  }

  return Math.max(1, parsed);
}

async function processSource({
  source,
  recentTitlesSet,
  recentTitlesMutex,
  enricherFactory
}: ProcessSourceContext): Promise<ProcessSourceResult> {
  const startTime = Date.now();
  const sourceName = source.name;
  const result: ProcessSourceResult = { newArticles: 0, duplicates: 0, updated: 0, newArticleIds: [], articles: [] };
  let newCount = 0;
  let duplicateCount = 0;
  let updatedCount = 0;
  let fetchedArticlesCount = 0;

  // createFetcherを使用してフェッチャーを生成
  // 未対応ソースの場合は "Unsupported source:" で始まるエラーがスローされる
  let fetcher;
  try {
    fetcher = createFetcher(source);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // "Unsupported source:" エラーのみをハンドリングし、それ以外は再throw
    if (errorMessage.startsWith('Unsupported source:')) {
      console.error(`[WARN] ${sourceName}: フェッチャーが見つかりません - ${errorMessage}`);
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`[${sourceName}] Duration: ${duration}s`);
      return result;
    }
    // 環境設定エラー等、その他のエラーは再throw
    throw error;
  }

  try {
    console.error(`[START] ${sourceName} - ${new Date().toISOString()}`);

    // Add per-source timeout to prevent infinite hang
    const fetchTimeoutMs = Number(process.env.FETCHER_TIMEOUT_MS) || 120_000; // 2 minutes default
    const timeoutMessage = `Fetcher timeout after ${fetchTimeoutMs}ms for ${sourceName}`;
    const { articles, errors } = await runWithTimeout(
      () => fetcher.fetch(),
      fetchTimeoutMs,
      timeoutMessage
    );

    console.error(`[DONE] ${sourceName} - ${new Date().toISOString()} - Fetched ${articles?.length ?? 0} articles`);

    if (errors.length > 0) {
      errors.forEach(err => console.error(`   エラー: ${err.message}`));
    }

    fetchedArticlesCount = articles?.length ?? 0;

    if (!articles || articles.length === 0) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`[${sourceName}] Duration: ${duration}s`);
      return result;
    }

    for (const article of articles) {
      try {
        const existing = await prisma.article.findFirst({
          where: { url: article.url }
        });

        if (existing) {
          const updates: Prisma.ArticleUpdateInput = {};

          // はてぶ経由 → 企業ブログの場合、sourceIdを更新
          if (existing.sourceId === HATENA_SOURCE_ID && source.id !== HATENA_SOURCE_ID) {
            updates.sourceId = source.id;
            console.error(`   [INFO] sourceId更新: ${source.name} <- Hatena`);
          }

          // content=null/empty の場合は更新を許可（全ソース共通の自己修復メカニズム）
          if ((!existing.content || existing.content.length === 0) &&
              article.content && article.content.length > 0) {
            Object.assign(updates, {
              content: article.content,
              thumbnail: article.thumbnail ?? existing.thumbnail,
              contentUpdatedAt: new Date(),
            });
          }

          // まとめて更新
          if (Object.keys(updates).length > 0) {
            await prisma.article.update({
              where: { id: existing.id },
              data: updates,
            });
            updatedCount++;
            if (updates.sourceId) {
              console.error(`   既存記事を更新（sourceId + content）: ${article.title.substring(0, 50)}...`);
            } else {
              console.error(`   既存記事を更新（content補完）: ${article.title.substring(0, 50)}...`);
            }
          } else {
            duplicateCount++;
          }
          continue;
        }

        // Mutex-protected duplicate check and reservation
        const shouldSkip = await recentTitlesMutex.runExclusive(() => {
          const dup = [...recentTitlesSet].some(existing =>
            isDuplicate(existing, article.title, 0.85)
          );
          if (dup) return true;
          recentTitlesSet.add(article.title); // Reserve immediately
          return false;
        });

        if (shouldSkip) {
          console.error(`   重複記事を検出: ${article.title.substring(0, 50)}...`);
          duplicateCount++;
          continue;
        }

        const tagConnections: Array<{ id: string }> = [];
        const tags: Array<{ name: string }> = [];
        if (article.tagNames && article.tagNames.length > 0) {
          // Normalize and dedupe tag names to avoid conflicts
          const normalizedTagNames = [...new Set(
            article.tagNames.map(tagName => normalizeTag(tagName))
          )].filter(name => name.length > 0);

          if (normalizedTagNames.length > 0) {
            // Create missing tags with skipDuplicates to handle race conditions
            await prisma.tag.createMany({
              data: normalizedTagNames.map(name => ({ name })),
              skipDuplicates: true
            });

            // Fetch all tags (existing + newly created)
            const existingTags = await prisma.tag.findMany({
              where: { name: { in: normalizedTagNames } },
              select: { id: true, name: true }
            });

            for (const tag of existingTags) {
              tagConnections.push({ id: tag.id });
              tags.push({ name: tag.name });
            }
          }
        }

        const category = CategoryClassifier.classify(tags, article.title, article.content);

        const savedArticle = await prisma.article.create({
          data: {
            title: article.title,
            url: article.url,
            summary: null,
            thumbnail: article.thumbnail || null,
            content: article.content || null,
            publishedAt: adjustTimezoneForArticle(article.publishedAt, source.name),
            bookmarks: article.bookmarks || 0,
            sourceId: source.id,
            category: category,
            contentUpdatedAt: new Date(),
            ...(tagConnections.length > 0 && {
              tags: {
                connect: tagConnections
              }
            })
          }
        });

        result.newArticleIds.push(savedArticle.id);
        result.articles.push({
          title: savedArticle.title,
          url: savedArticle.url,
          sourceName: sourceName
        });

        if (process.env.SKIP_POST_SAVE_ENRICHMENT !== '1') {
          const enricher = enricherFactory.getEnricher(article.url);
          if (enricher) {
            try {
              console.error(`   [INFO] エンリッチメント実行: ${article.title.substring(0, 40)}...`);
              const enrichedData = await runWithTimeout(
                () => enricher.enrich(article.url),
                POST_SAVE_ENRICH_TIMEOUT_MS,
                `Post-save enrichment timeout after ${POST_SAVE_ENRICH_TIMEOUT_MS}ms for ${sourceName}`
              );

              if (enrichedData && enrichedData.content) {
                const originalContentLength = article.content?.length || 0;
                const enrichedContentLength = enrichedData.content.length;

                if (enrichedContentLength > originalContentLength && enrichedContentLength >= 250) {
                  // 250-499 chars: require quality check
                  const needsQualityCheck = enrichedContentLength < 500;
                  const passesQualityCheck = !needsQualityCheck || isHighQuality(enrichedData.content);

                  if (passesQualityCheck) {
                    await prisma.article.update({
                      where: { id: savedArticle.id },
                      data: {
                        content: enrichedData.content,
                        contentUpdatedAt: new Date(),
                        ...(isValidThumbnailUrl(enrichedData.thumbnail) && { thumbnail: enrichedData.thumbnail })
                      }
                    });
                    console.error(`   [INFO] エンリッチメント成功: ${enrichedData.content.length}文字`);
                  } else {
                    console.warn(`   [WARN] エンリッチメント結果が品質基準未達: ${enrichedContentLength}文字`);
                  }
                } else {
                  console.warn(`   [WARN] エンリッチメント結果が不十分: ${enrichedContentLength}文字（元: ${originalContentLength}文字）`);
                }
              } else {
                console.error('   [WARN] エンリッチメント失敗: コンテンツなし');
              }
            } catch (enrichError) {
              console.error('   [WARN] エンリッチメントエラー:', enrichError instanceof Error ? enrichError.message : String(enrichError));
            }

            if (POST_SAVE_ENRICH_SLEEP_MS > 0) {
              await new Promise(resolve => setTimeout(resolve, POST_SAVE_ENRICH_SLEEP_MS));
            }
          }
        }

        // Title already added to Set in Mutex-protected section above
        newCount++;
      } catch (error: unknown) {
        // Rollback title reservation on error
        await recentTitlesMutex.runExclusive(() => {
          recentTitlesSet.delete(article.title);
        });

        const metaTarget = (error as { meta?: { target?: unknown } }).meta?.target;
        const isPrismaDuplicateUrlError =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: string }).code === 'P2002' &&
          Array.isArray(metaTarget) &&
          metaTarget.includes('url');

        if (isPrismaDuplicateUrlError) {
          duplicateCount++;
        } else {
          console.error(`   記事保存エラー: ${article.title}`, error instanceof Error ? error.message : String(error));
        }
      }
    }

    if (newCount > 0 || duplicateCount > 0 || updatedCount > 0) {
      console.error(`   [INFO] 新規: ${newCount}件, 更新: ${updatedCount}件, 重複: ${duplicateCount}件`);
    }

    result.newArticles = newCount;
    result.duplicates = duplicateCount;
    result.updated = updatedCount;
    {
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(
        `[${sourceName}] Duration: ${duration}s, Articles: ${fetchedArticlesCount}, New: ${newCount}, Updated: ${updatedCount}, Duplicates: ${duplicateCount}`
      );
    }
    return result;
  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(
      `[${sourceName}] Failed after ${duration}s:`,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

async function collectFeeds(sourceTypes?: string[]): Promise<CollectResult> {
  console.error('[INFO] フィード収集を開始します...');
  console.error(`   SKIP_POST_SAVE_ENRICHMENT: ${process.env.SKIP_POST_SAVE_ENRICHMENT || 'not set'}`);
  if (sourceTypes && sourceTypes.length > 0) {
    console.error(`   対象ソース: ${sourceTypes.join(', ')}`);
  }
  const startTime = Date.now();

  // ContentEnricherFactoryのインスタンスを作成
  const enricherFactory = new ContentEnricherFactory();
  const concurrency = resolveCollectConcurrency();
  console.error(`   COLLECT_FEEDS_CONCURRENCY: ${concurrency} (${concurrency === 1 ? 'シーケンシャル' : '並列実行'})`);

  try {
    // 有効なソースを取得（sourceTypesが指定されている場合はフィルタリング）
    // ソースIDまたはソース名でマッチ
    const sources = await prisma.source.findMany({
      where: {
        enabled: true,
        ...(sourceTypes && sourceTypes.length > 0 && {
          OR: [
            { id: { in: sourceTypes } },
            { name: { in: sourceTypes } }
          ]
        })
      }
    });
    const recentArticles: Array<{ title: string }> = sources.length > 0
      ? await prisma.article.findMany({
          where: {
            publishedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          },
          select: { title: true }
        })
      : [];

    // Convert to Set for O(1) lookups and thread-safe mutations
    const recentTitlesSet = new Set(recentArticles.map(a => a.title));
    const recentTitlesMutex = new Mutex();

    const limit = pLimit(concurrency);
    const tasks = sources.map(source =>
      limit(() => processSource({ source, recentTitlesSet, recentTitlesMutex, enricherFactory }))
    );

    const settledResults = await Promise.allSettled(tasks);

    let totalNewArticles = 0;
    let totalDuplicates = 0;
    let totalUpdated = 0;
    const newArticleIds: string[] = [];
    const allArticles: ArticleInfo[] = [];

    settledResults.forEach(result => {
      if (result.status === 'fulfilled') {
        totalNewArticles += result.value.newArticles;
        totalDuplicates += result.value.duplicates;
        totalUpdated += result.value.updated;
        newArticleIds.push(...result.value.newArticleIds);
        allArticles.push(...result.value.articles);
      } else {
        console.error('[WARN] ソース処理で未処理の例外が発生しました:', result.reason);
      }
    });

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`\n📊 収集完了: 新規${totalNewArticles}件, 更新${totalUpdated}件, 重複${totalDuplicates}件 (${duration}秒)`);

    if (totalNewArticles > 0) {
      console.error('[INFO] キャッシュを無効化中...');
      await cacheInvalidator.onBulkImport();

      console.error('\n[INFO] 要約生成を自動実行します...');
      try {
        const { generateSummaries } = await import('../maintenance/generate-summaries');
        const result = await generateSummaries({ articleIds: newArticleIds });
        console.error(`[INFO] 要約生成完了: ${result.generated}件の要約を生成`);
      } catch (error) {
        console.error(
          '[WARN] 要約生成でエラーが発生しましたが、記事収集は成功しています:',
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    return {
      newArticles: totalNewArticles,
      duplicates: totalDuplicates,
      updated: totalUpdated,
      newArticleIds,
      articles: allArticles
    };

  } catch (error) {
    console.error('[ERROR] フィード収集エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  // Acquire exclusive lock before starting
  if (!acquireLock()) {
    // Another instance is running, exit gracefully
    process.exit(0);
  }

  // Setup signal handlers for graceful shutdown
  setupSignalHandlers();

  // コマンドライン引数からソースタイプを取得
  const args = process.argv.slice(2);
  const sourceTypes = args.length > 0 ? args : undefined;

  collectFeeds(sourceTypes)
    .then(() => {
      releaseLock();
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      releaseLock();
      process.exit(1);
    });
}

export { collectFeeds };
