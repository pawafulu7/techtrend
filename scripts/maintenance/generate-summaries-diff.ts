/**
 * 要約生成バッチ処理（差分処理対応版）
 *
 * ProcessingLogを使用して前回処理時点からの差分のみを処理
 * これにより大幅な処理時間短縮とAPI使用量削減を実現
 */

import { PrismaClient, ProcessingStatus } from '@prisma/client';
import { GeminiSummaryGenerator } from '../../lib/ai/gemini-summary';
import logger from '../../lib/logger';
import { SUMMARY_VERSION } from '../../types/article';
import type { ArticleWithSource } from '../../types/models';

const prisma = new PrismaClient();
const summaryGenerator = new GeminiSummaryGenerator();

const PROCESS_NAME = 'summary_generation_batch';
const BATCH_SIZE = 50;
const TARGET_SUMMARY_VERSION = SUMMARY_VERSION.UNIFIED;

/**
 * 差分処理による要約生成バッチ
 */
async function generateSummariesDiff() {
  const startTime = Date.now();
  // チェックポイント: 処理開始時点の時刻を記録（TOCTOU回避）
  const processingCheckpoint = new Date();

  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let status: ProcessingStatus = 'success';

  // PostgreSQLアドバイザリロックで多重実行を防止
  const LOCK_KEY = 902202509n; // 固定キー（PROCESS_NAMEのハッシュ値）
  const lockResult = await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>`
    SELECT pg_try_advisory_lock(${LOCK_KEY})`;

  if (!lockResult[0]?.pg_try_advisory_lock) {
    logger.warn('Another batch run is in progress; skipping this run');
    return {
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      duration: 0,
      status: 'skipped' as ProcessingStatus
    };
  }

  try {
    // 前回処理情報を取得
    const lastProcessing = await prisma.processingLog.findUnique({
      where: { processName: PROCESS_NAME }
    });

    const lastProcessedAt = lastProcessing?.lastProcessedAt || new Date(0);

    logger.info({
      processName: PROCESS_NAME,
      lastProcessedAt,
      processingCheckpoint,
      status: 'starting'
    }, 'Starting summary generation batch (differential)');

    // 差分対象の記事を取得
    const articlesToProcess = await prisma.article.findMany({
      where: {
        OR: [
          // 要約が生成されていない記事
          { summary: null },
          { detailedSummary: null },
          // 古いバージョンの要約
          { summaryVersion: { lt: TARGET_SUMMARY_VERSION } },
          // 前回処理以降、チェックポイント以前に更新された記事
          { updatedAt: { gt: lastProcessedAt, lte: processingCheckpoint } }
        ],
        // コンテンツがある記事のみ
        NOT: {
          content: null
        }
      },
      include: {
        source: {
          select: {
            name: true
          }
        }
      },
      take: BATCH_SIZE,
      orderBy: { updatedAt: 'asc' }
    }) as ArticleWithSource[];

    logger.info({
      totalToProcess: articlesToProcess.length,
      batchSize: BATCH_SIZE
    }, 'Articles to process for summary generation');

    // バッチ処理
    for (const article of articlesToProcess) {
      try {
        // コンテンツチェック
        if (!article.content || article.content.length < 100) {
          logger.debug({
            articleId: article.id,
            contentLength: article.content?.length || 0
          }, 'Skipping article with insufficient content');
          skippedCount++;
          continue;
        }

        // 要約生成
        const result = await summaryGenerator.generateSummaryAndTags(
          article.title,
          article.content,
          article.url,
          article.source.name
        );

        if (result.summary && result.detailedSummary) {
          // データベース更新
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              summaryVersion: TARGET_SUMMARY_VERSION,
              summaryComputedAt: new Date(),
              tags: {
                connectOrCreate: result.tags.map(tag => ({
                  where: { name: tag },
                  create: { name: tag }
                }))
              }
            }
          });

          processedCount++;
          logger.info({
            articleId: article.id,
            title: article.title
          }, 'Summary generated successfully');
        } else {
          failedCount++;
          logger.warn({
            articleId: article.id,
            title: article.title
          }, 'Failed to generate summary');
        }

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (err) {
        failedCount++;
        logger.error({
          articleId: article.id,
          error: err
        }, 'Failed to process article for summary');
        status = failedCount > processedCount ? 'failed' : 'partial';
      }
    }

    // ProcessingLogを更新（成功時のみチェックポイント時刻を記録）
    await prisma.processingLog.upsert({
      where: { processName: PROCESS_NAME },
      update: {
        lastProcessedAt: processingCheckpoint,  // チェックポイント時刻を使用
        processedCount: {
          increment: processedCount
        },
        status,
        metadata: {
          duration: Date.now() - startTime,
          batchSize: BATCH_SIZE,
          lastRunProcessedCount: processedCount,
          lastRunSkippedCount: skippedCount,
          lastRunFailedCount: failedCount
        }
      },
      create: {
        processName: PROCESS_NAME,
        lastProcessedAt: processingCheckpoint,  // チェックポイント時刻を使用
        processedCount,
        status,
        metadata: {
          duration: Date.now() - startTime,
          batchSize: BATCH_SIZE,
          lastRunProcessedCount: processedCount,
          lastRunSkippedCount: skippedCount,
          lastRunFailedCount: failedCount
        }
      }
    });

    const duration = Date.now() - startTime;
    logger.info({
      processedCount,
      skippedCount,
      failedCount,
      duration,
      status,
      avgTimePerArticle: processedCount > 0 ? duration / processedCount : 0
    }, 'Summary generation batch completed');

    return {
      processedCount,
      skippedCount,
      failedCount,
      duration,
      status
    };

  } catch (err) {
    const error = err as Error;
    logger.error({
      error: err,
      processName: PROCESS_NAME
    }, 'Summary generation batch failed');

    // エラー時もProcessingLogを更新（失敗時はlastProcessedAtを更新しない）
    await prisma.processingLog.upsert({
      where: { processName: PROCESS_NAME },
      update: {
        // lastProcessedAtは更新しない（前回成功時の値を維持）
        status: 'failed',
        metadata: {
          error: error.message,
          duration: Date.now() - startTime
        }
      },
      create: {
        processName: PROCESS_NAME,
        lastProcessedAt: new Date(0),  // 失敗時は最初から処理するようにリセット
        processedCount: 0,
        status: 'failed',
        metadata: {
          error: error.message,
          duration: Date.now() - startTime
        }
      }
    });

    throw error;
  } finally {
    // アドバイザリロックを解放
    await prisma.$executeRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
    await prisma.$disconnect();
  }
}

// 全件処理モード（初回実行やリセット時）
async function generateSummariesFull() {
  logger.info('Running full summary generation (not differential)');

  // ProcessingLogをリセット
  await prisma.processingLog.delete({
    where: { processName: PROCESS_NAME }
  }).catch(() => {});

  // 差分処理を実行（リセットしたので全件対象になる）
  return generateSummariesDiff();
}

// 実行（ESM/CJS両対応）
// tsx経由で実行される場合を考慮
const isMainModule = (() => {
  // CJSの場合
  if (typeof require !== 'undefined' && require.main === module) {
    return true;
  }
  // ESMの場合（tsx実行時）
  // process.argv[1]に実行ファイルパスが含まれるかチェック
  if (process.argv[1] && __filename && process.argv[1] === __filename) {
    return true;
  }
  // tsx実行時の追加チェック
  if (process.argv[1] && process.argv[1].includes('generate-summaries-diff')) {
    return true;
  }
  return false;
})();

if (isMainModule) {
  const isDifferential = process.argv.includes('--diff');
  const processFn = isDifferential ? generateSummariesDiff : generateSummariesFull;

  processFn()
    .then(result => {
      console.log('✅ Summary generation batch completed:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Summary generation batch failed:', err);
      process.exit(1);
    });
}

export { generateSummariesDiff, generateSummariesFull };