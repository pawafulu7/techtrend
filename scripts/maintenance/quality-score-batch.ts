/**
 * 品質スコアバッチ処理（差分処理対応）
 *
 * ProcessingLogを使用して前回処理時点からの差分のみを処理
 * これにより処理時間と負荷を大幅に削減
 */

import { PrismaClient, Prisma, ProcessingStatus } from '@prisma/client';
import logger from '@/lib/logger';

const prisma = new PrismaClient();

const PROCESS_NAME = 'quality_score_batch';
const BATCH_SIZE = 100;

/**
 * 品質スコアを計算する（既存ロジック）
 */
function calculateQualityScore(article: any): number {
  let score = 50; // ベーススコア

  // 要約の品質
  if (article.summary) {
    const summaryLength = article.summary.length;
    if (summaryLength > 100 && summaryLength < 500) {
      score += 10;
    }
  }

  // 詳細要約の存在
  if (article.detailedSummary) {
    score += 15;
  }

  // タグの数
  const tagCount = article.tags?.length || 0;
  if (tagCount >= 3 && tagCount <= 10) {
    score += 10;
  }

  // コンテンツの存在
  if (article.content && article.content.length > 1000) {
    score += 15;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * 差分処理によるバッチ実行
 */
async function processBatch() {
  const startTime = Date.now();
  // チェックポイント: 処理開始時点の時刻を記録（TOCTOU回避）
  const processingCheckpoint = new Date();

  let processedCount = 0;
  let status: ProcessingStatus = 'success';
  let error: Error | null = null;

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
    }, 'Starting quality score batch processing');

    // 差分対象の記事を取得
    const articlesToProcess = await prisma.article.findMany({
      where: {
        OR: [
          { qualityScoreComputedAt: null },
          // 前回処理以降、チェックポイント以前に更新された記事
          { updatedAt: { gt: lastProcessedAt, lte: processingCheckpoint } }
        ]
      },
      include: {
        tags: true
      },
      take: BATCH_SIZE,
      orderBy: {
        updatedAt: 'asc'
      }
    });

    logger.info({
      totalToProcess: articlesToProcess.length,
      batchSize: BATCH_SIZE
    }, 'Articles to process');

    // バッチ処理: スコアを計算してタプルを収集
    const computedAt = new Date();
    const tuples: Array<{ id: string; score: number; computedAt: Date }> = [];

    for (const article of articlesToProcess) {
      const newScore = calculateQualityScore(article);
      tuples.push({ id: article.id, score: newScore, computedAt });
    }

    // 一括 UPDATE
    if (tuples.length > 0) {
      try {
        const values = Prisma.join(
          tuples.map(t => Prisma.sql`(${t.id}, ${t.score}, ${t.computedAt})`),
          ', '
        );
        await prisma.$executeRaw`
          UPDATE "Article"
          SET
            "qualityScore" = v.score::double precision,
            "qualityScoreComputedAt" = v.computed_at::timestamptz,
            "updatedAt" = NOW()
          FROM (VALUES ${values}) AS v(id, score, computed_at)
          WHERE "Article".id = v.id::text
        `;
        processedCount += tuples.length;
      } catch (err) {
        logger.error({
          error: err,
          batchSize: tuples.length
        }, 'Failed to bulk update quality scores');
        status = 'partial';
      }
    }

    // ProcessingLogを更新（成功時のみチェックポイント時刻を記録）
    const bulkSucceeded = status !== 'partial';
    await prisma.processingLog.upsert({
      where: { processName: PROCESS_NAME },
      update: {
        // バルク UPDATE 失敗時は lastProcessedAt を更新しない（前回成功時の値を維持）
        ...(bulkSucceeded ? { lastProcessedAt: processingCheckpoint } : {}),
        processedCount: {
          increment: processedCount
        },
        status,
        metadata: {
          duration: Date.now() - startTime,
          batchSize: BATCH_SIZE,
          lastRunProcessedCount: processedCount
        }
      },
      create: {
        processName: PROCESS_NAME,
        lastProcessedAt: bulkSucceeded ? processingCheckpoint : new Date(0),
        processedCount,
        status,
        metadata: {
          duration: Date.now() - startTime,
          batchSize: BATCH_SIZE,
          lastRunProcessedCount: processedCount
        }
      }
    });

    const duration = Date.now() - startTime;
    logger.info({
      processedCount,
      duration,
      status,
      avgTimePerArticle: processedCount > 0 ? duration / processedCount : 0
    }, 'Quality score batch processing completed');

    return {
      processedCount,
      duration,
      status
    };

  } catch (err) {
    error = err as Error;
    logger.error({
      error: err,
      processName: PROCESS_NAME
    }, 'Quality score batch processing failed');

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
    await prisma.$disconnect();
  }
}

// 実行
if (require.main === module) {
  processBatch()
    .then(result => {
      console.log('✅ Quality score batch processing completed:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Quality score batch processing failed:', err);
      process.exit(1);
    });
}

export { processBatch, calculateQualityScore };