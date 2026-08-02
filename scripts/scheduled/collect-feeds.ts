import { Source, Prisma } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import pLimit from 'p-limit';
import { Mutex } from 'async-mutex';
import * as fs from 'fs';
import { env } from '@/lib/config/env';

// PID file for exclusive execution control
const PID_FILE = env.COLLECT_FEEDS_PID_FILE;

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
import { normalizeTag } from '@/lib/utils/tag/tag-normalizer';
import { HATENA_SOURCE_ID } from '@/lib/constants/source-ids';

// フェッチャーファクトリ（createFetcherですべてのソースを統一的に処理）
import { createFetcher } from '@/lib/fetchers';

// エンリッチャーをインポート
import { ContentEnricherFactory } from '@/lib/enrichers';
import { classifyEnrichmentError } from '@/lib/enrichers/error-classifier';
import { HATENA_BLOG_DEV_SOURCE_ID } from '@/lib/enrichers/hatena';
import { logger } from '@/lib/logger';
import { isHighQuality } from '@/lib/enrichers/strategies/quality';
import { isEnrichmentSkipped } from '@/lib/fetchers/generic-foreign-rss';

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

const COLLECT_FEEDS_DEBUG = env.COLLECT_FEEDS_DEBUG === '1';
const debugLog = (message: string) => {
  if (COLLECT_FEEDS_DEBUG) console.log(message);
};

const POST_SAVE_ENRICH_TIMEOUT_MS = env.POST_SAVE_ENRICH_TIMEOUT_MS;
const POST_SAVE_ENRICH_SLEEP_MS = env.POST_SAVE_ENRICH_SLEEP_MS;
const HATENA_BLOG_DEV_ENRICH_SLEEP_MS = env.HATENA_BLOG_DEV_ENRICH_SLEEP_MS;

/**
 * ソース別の enrichment 後 sleep 値を決定
 * hatena_blog_dev は Hatena 独自ドメインでの 429 rate limit 回避のため長めに待つ
 */
function resolveEnrichSleepMs(sourceId: string): number {
  if (sourceId === HATENA_BLOG_DEV_SOURCE_ID) {
    return HATENA_BLOG_DEV_ENRICH_SLEEP_MS;
  }
  return POST_SAVE_ENRICH_SLEEP_MS;
}

// 1ソース1実行あたりの自己修復エンリッチ試行数の上限
// （既存記事の空本文をエンリッチャーで再取得する処理の暴走・レート制限違反を防ぐ）
const MAX_SELF_HEAL_ENRICH_PER_RUN = 5;

/**
 * エンリッチ済みコンテンツが保存に足る品質かを判定する。
 * 新規保存経路（500文字以上は無条件、250-499文字は isHighQuality 必須）と
 * 同一基準を、既存記事の自己修復経路でも適用するための共通ヘルパー。
 */
function isAcceptableEnrichedContent(content: string): boolean {
  return content.length >= 500 || (content.length >= 250 && isHighQuality(content));
}

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
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const controller = new AbortController();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      console.error(`[TIMEOUT] ${timeoutMessage}`);
      controller.abort(new Error(timeoutMessage));
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    // Call the task in a microtask so the timeout is armed even if the task body
    // does heavy synchronous work before its first await.
    const taskPromise = Promise.resolve().then(() => task(controller.signal));
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function resolveCollectConcurrency(): number {
  return env.COLLECT_FEEDS_CONCURRENCY;
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
  let selfHealEnrichCount = 0;

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
    const ARXIV_TIMEOUT_MS = env.ARXIV_FETCHER_TIMEOUT_MS;
    const defaultTimeoutMs = env.FETCHER_TIMEOUT_MS;
    const fetchTimeoutMs = sourceName === 'arXiv AI' ? ARXIV_TIMEOUT_MS : defaultTimeoutMs;
    const timeoutMessage = `Fetcher timeout after ${fetchTimeoutMs}ms for ${sourceName}`;
    const { articles, errors } = await runWithTimeout(
      // fetcher.fetch() は signal を直接受け取らないが、runWithTimeout が timeout 時に
      // Promise.race で reject するため後方互換で動作する
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

    // Pre-fetch to avoid per-article findFirst N+1
    const articleUrls = articles.map(a => a.url);
    const existingArticles = await prisma.article.findMany({
      where: { url: { in: articleUrls } },
      select: { id: true, sourceId: true, contentLength: true, thumbnail: true, url: true, skipReason: true }
    });
    const existingArticleMap = new Map(existingArticles.map(a => [a.url, a]));

    for (const article of articles) {
      try {
        const existing = existingArticleMap.get(article.url);

        if (existing) {
          const updates: Prisma.ArticleUpdateInput = {};

          // はてぶ経由 → 企業ブログの場合、sourceIdを更新
          if (existing.sourceId === HATENA_SOURCE_ID && source.id !== HATENA_SOURCE_ID) {
            updates.sourceId = source.id;
            console.error(`   [INFO] sourceId更新: ${source.name} <- Hatena`);
          }

          // エンリッチャーによる自己修復が成功したか（成功時は updateMany で反映済みのため、
          // 下の update 呼び出し・duplicateCount への計上から除外する）
          let selfHealedViaEnricher = false;

          // content=null/empty の場合は更新を許可（全ソース共通の自己修復メカニズム）
          if (!existing.contentLength || existing.contentLength === 0) {
            if (article.content && article.content.length > 0) {
              Object.assign(updates, {
                content: article.content,
                thumbnail: article.thumbnail ?? existing.thumbnail,
                contentUpdatedAt: new Date(),
              });
            } else if (env.SKIP_POST_SAVE_ENRICHMENT !== '1' && !isEnrichmentSkipped(sourceName)) {
              // ignoreFeedContent ソース等でフィード本文が空のまま保存された既存記事を
              // エンリッチャーで自己修復する（skipEnrichment ソースは上書き禁止ポリシーを維持）
              const enricher = enricherFactory.getEnricher(article.url, source.id);
              if (enricher) {
                if (selfHealEnrichCount >= MAX_SELF_HEAL_ENRICH_PER_RUN) {
                  debugLog(`   [INFO] 自己修復エンリッチ上限(${MAX_SELF_HEAL_ENRICH_PER_RUN}件)到達のためスキップ: ${article.title.substring(0, 50)}...`);
                } else {
                  selfHealEnrichCount++;
                  try {
                    const enrichedData = await runWithTimeout(
                      (signal) => enricher.enrich(article.url, signal),
                      POST_SAVE_ENRICH_TIMEOUT_MS,
                      `Post-save enrichment timeout after ${POST_SAVE_ENRICH_TIMEOUT_MS}ms for ${sourceName}`
                    );
                    if (enrichedData?.content && isAcceptableEnrichedContent(enrichedData.content)) {
                      const enricherUpdates: Prisma.ArticleUpdateInput = {
                        content: enrichedData.content,
                        thumbnail: isValidThumbnailUrl(enrichedData.thumbnail)
                          ? enrichedData.thumbnail
                          : existing.thumbnail,
                        contentUpdatedAt: new Date(),
                      };

                      // 本文回復時は本文起因の skipReason / summaryError をクリアし、
                      // 要約再生成対象にする。PDF / SLIDE は本文の有無と無関係の
                      // 恒久理由のためクリアしない（enrich-thin-content.ts の同型ロジックを踏襲）
                      if (
                        existing.skipReason &&
                        existing.skipReason !== 'PDF' &&
                        existing.skipReason !== 'SLIDE'
                      ) {
                        enricherUpdates.skipReason = null;
                        enricherUpdates.summaryError = null;
                      }

                      // 並列実行中の他ソースが先に本文を書き込んでいた場合に上書きしないよう、
                      // contentLength が null/0 のままであることを条件に更新する（CAS）
                      const { count } = await prisma.article.updateMany({
                        where: {
                          id: existing.id,
                          OR: [{ contentLength: null }, { contentLength: 0 }],
                        },
                        data: enricherUpdates,
                      });

                      if (count > 0) {
                        selfHealedViaEnricher = true;
                        updatedCount++;
                        result.newArticleIds.push(existing.id);
                        debugLog(`   既存記事を自己修復（エンリッチャー）: ${article.title.substring(0, 50)}...`);
                      } else {
                        debugLog(`   既存記事の自己修復スキップ（並行更新で本文既存）: ${article.title.substring(0, 50)}...`);
                      }
                    } else {
                      debugLog(`   既存記事の自己修復エンリッチメント: 品質基準未達またはデータなし (${sourceName}, ${enrichedData?.content?.length ?? 0}文字)`);
                    }
                  } catch (enrichError) {
                    const classified = classifyEnrichmentError(enrichError);
                    console.error(`   [WARN] 既存記事の空本文エンリッチメント失敗: ${classified.errorMessage}`);
                  }

                  const enrichSleepMs = resolveEnrichSleepMs(source.id);
                  if (enrichSleepMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, enrichSleepMs));
                  }
                }
              }
            }
          }

          // まとめて更新（sourceId移管 / フィード本文由来の補完のみ。
          // エンリッチャーによる自己修復は上の updateMany(CAS) で処理済み）
          if (Object.keys(updates).length > 0) {
            await prisma.article.update({
              where: { id: existing.id },
              data: updates,
            });
            updatedCount++;
            if (updates.sourceId) {
              debugLog(`   既存記事を更新（sourceId + content）: ${article.title.substring(0, 50)}...`);
            } else {
              debugLog(`   既存記事を更新（content補完）: ${article.title.substring(0, 50)}...`);
            }
          } else if (!selfHealedViaEnricher) {
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
          debugLog(`   重複記事を検出: ${article.title.substring(0, 50)}...`);
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
            thumbnail: isValidThumbnailUrl(article.thumbnail) ? article.thumbnail : null,
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

        if (env.SKIP_POST_SAVE_ENRICHMENT !== '1' && !isEnrichmentSkipped(sourceName)) {
          const enricher = enricherFactory.getEnricher(article.url, source.id);
          if (enricher) {
            try {
              debugLog(`   [INFO] エンリッチメント実行: ${article.title.substring(0, 40)}... (enricher=${enricher.constructor.name})`);
              const enrichedData = await runWithTimeout(
                (signal) => enricher.enrich(article.url, signal),
                POST_SAVE_ENRICH_TIMEOUT_MS,
                `Post-save enrichment timeout after ${POST_SAVE_ENRICH_TIMEOUT_MS}ms for ${sourceName}`
              );

              if (enrichedData) {
                // サムネイル独立更新: コンテンツ品質に関係なくサムネイルを更新
                const hasNewThumbnail = isValidThumbnailUrl(enrichedData.thumbnail);
                const currentThumbnail = isValidThumbnailUrl(article.thumbnail) ? article.thumbnail : null;
                const needsThumbnailUpdate = hasNewThumbnail && !currentThumbnail;

                if (enrichedData.content) {
                  const originalContentLength = article.content?.length || 0;
                  const enrichedContentLength = enrichedData.content.length;

                  if (enrichedContentLength > originalContentLength && enrichedContentLength >= 250) {
                    // 250-499 chars は isHighQuality 必須、500字以上は無条件
                    // （enrichedContentLength >= 250 は外側の if で保証済みのため、
                    //   共通ヘルパー isAcceptableEnrichedContent と判定基準は完全に同一）
                    const passesQualityCheck = isAcceptableEnrichedContent(enrichedData.content);

                    if (passesQualityCheck) {
                      await prisma.article.update({
                        where: { id: savedArticle.id },
                        data: {
                          content: enrichedData.content,
                          contentUpdatedAt: new Date(),
                          ...(needsThumbnailUpdate && { thumbnail: enrichedData.thumbnail })
                        }
                      });
                      console.error(`   [INFO] エンリッチメント成功: ${enrichedData.content.length}文字${needsThumbnailUpdate ? ' (サムネイル更新)' : ''}`);
                    } else {
                      console.warn(`   [WARN] エンリッチメント結果が品質基準未達: ${enrichedContentLength}文字`);
                      // コンテンツ品質不足でもサムネイルは更新
                      if (needsThumbnailUpdate) {
                        await prisma.article.update({
                          where: { id: savedArticle.id },
                          data: { thumbnail: enrichedData.thumbnail! }
                        });
                        console.error(`   [INFO] サムネイルのみ更新`);
                      }
                    }
                  } else {
                    console.warn(`   [WARN] エンリッチメント結果が不十分: ${enrichedContentLength}文字（元: ${originalContentLength}文字）`);
                    // コンテンツ不十分でもサムネイルは更新
                    if (needsThumbnailUpdate) {
                      await prisma.article.update({
                        where: { id: savedArticle.id },
                        data: { thumbnail: enrichedData.thumbnail! }
                      });
                      console.error(`   [INFO] サムネイルのみ更新`);
                    }
                  }
                } else if (needsThumbnailUpdate) {
                  // コンテンツなし、サムネイルのみ更新
                  await prisma.article.update({
                    where: { id: savedArticle.id },
                    data: { thumbnail: enrichedData.thumbnail! }
                  });
                  console.error(`   [INFO] サムネイルのみ更新（コンテンツなし）`);
                } else {
                  console.error('   [WARN] エンリッチメント失敗: コンテンツもサムネイルもなし');
                }
              } else {
                // データなし失敗: 観測性のためログを構造化
                logger.warn(
                  {
                    url: article.url,
                    sourceId: source.id,
                    sourceName,
                    enricher: enricher.constructor.name,
                    errorCode: 'NO_DATA' as const,
                  },
                  '[Enrichment] failed: no data returned'
                );
                console.error('   [WARN] エンリッチメント失敗: データなし');
              }
            } catch (enrichError) {
              // エラー失敗: status/errorCode/errorMessage を構造化して記録
              // 分類ロジックは lib/enrichers/error-classifier.ts に集約
              // （BaseContentEnricher.logEnrichmentError と共有）
              const classified = classifyEnrichmentError(enrichError);
              logger.warn(
                {
                  url: article.url,
                  sourceId: source.id,
                  sourceName,
                  enricher: enricher.constructor.name,
                  errorCode: classified.errorCode,
                  status: classified.status,
                  errorName: classified.errorName,
                  errorMessage: classified.errorMessage,
                },
                '[Enrichment] failed: exception thrown'
              );
              console.error('   [WARN] エンリッチメントエラー:', classified.errorMessage);
            }

            const enrichSleepMs = resolveEnrichSleepMs(source.id);
            if (enrichSleepMs > 0) {
              await new Promise(resolve => setTimeout(resolve, enrichSleepMs));
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
          // Re-fetch latest article for self-healing on concurrent URL collision
          const latestExisting = await prisma.article.findUnique({
            where: { url: article.url },
            select: { id: true, sourceId: true, contentLength: true, thumbnail: true, url: true }
          });

          if (latestExisting) {
            const updates: Prisma.ArticleUpdateInput = {};

            if (latestExisting.sourceId === HATENA_SOURCE_ID && source.id !== HATENA_SOURCE_ID) {
              updates.sourceId = source.id;
              console.error(`   [INFO] sourceId更新: ${source.name} <- Hatena`);
            }

            if ((!latestExisting.contentLength || latestExisting.contentLength === 0) &&
                article.content && article.content.length > 0) {
              Object.assign(updates, {
                content: article.content,
                thumbnail: article.thumbnail ?? latestExisting.thumbnail,
                contentUpdatedAt: new Date(),
              });
            }

            if (Object.keys(updates).length > 0) {
              await prisma.article.update({
                where: { id: latestExisting.id },
                data: updates,
              });
              updatedCount++;
            } else {
              duplicateCount++;
            }
          } else {
            duplicateCount++;
          }
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
  console.error(`   SKIP_POST_SAVE_ENRICHMENT: ${env.SKIP_POST_SAVE_ENRICHMENT}`);
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
      try {
        await cacheInvalidator.onBulkImport();
      } catch (error) {
        console.error(
          '[WARN] キャッシュ無効化でエラーが発生しましたが、記事収集は成功しています:',
          error instanceof Error ? error.message : String(error)
        );
      }

      console.error('\n[INFO] 要約生成を自動実行します...');
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { generateSummaries } = require('../maintenance/generate-summaries.ts');
        const result = await generateSummaries({ articleIds: newArticleIds });
        console.error(`[INFO] 要約生成完了: ${result.generated}件の要約を生成`);

        // 要約生成後に再度キャッシュを無効化
        // excludeUnprocessed=trueクエリで要約生成済み記事が即座に表示されるようにする
        if (result.generated > 0) {
          console.error('[INFO] 要約生成後のキャッシュ無効化中...');
          await cacheInvalidator.onBulkImport();
        }
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

export { collectFeeds, isAcceptableEnrichedContent };
