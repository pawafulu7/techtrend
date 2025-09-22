import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 最終処理時刻を取得
 */
export async function getLastProcessedTime(processName: string): Promise<Date | null> {
  const log = await prisma.processingLog.findUnique({
    where: { processName }
  });

  return log?.lastProcessedAt || null;
}

/**
 * 処理状態を保存
 */
export async function saveProcessingStatus(
  processName: string,
  processedCount: number,
  status: 'success' | 'failed' | 'partial' = 'success',
  metadata?: any
): Promise<void> {
  await prisma.processingLog.upsert({
    where: { processName },
    update: {
      lastProcessedAt: new Date(),
      processedCount,
      status,
      metadata,
      updatedAt: new Date()
    },
    create: {
      processName,
      lastProcessedAt: new Date(),
      processedCount,
      status,
      metadata
    }
  });
}

/**
 * 処理が必要かチェック（前回処理から指定時間経過しているか）
 */
export async function shouldProcess(
  processName: string,
  intervalHours: number = 1
): Promise<boolean> {
  const lastProcessedAt = await getLastProcessedTime(processName);

  if (!lastProcessedAt) {
    return true; // 初回実行
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  const timeSinceLastProcess = Date.now() - lastProcessedAt.getTime();

  return timeSinceLastProcess >= intervalMs;
}

/**
 * 前回処理以降に更新された記事があるかチェック
 */
export async function hasUpdatedArticlesSince(processName: string): Promise<boolean> {
  const lastProcessedAt = await getLastProcessedTime(processName);

  if (!lastProcessedAt) {
    return true; // 初回実行
  }

  const count = await prisma.article.count({
    where: {
      updatedAt: { gt: lastProcessedAt }
    }
  });

  return count > 0;
}

/**
 * 処理ログのクリーンアップ（古いログを削除）
 */
export async function cleanupOldLogs(daysToKeep: number = 30): Promise<void> {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  await prisma.processingLog.deleteMany({
    where: {
      updatedAt: { lt: cutoffDate }
    }
  });
}