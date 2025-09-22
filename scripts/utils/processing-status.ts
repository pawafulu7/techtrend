import { PrismaClient, Prisma } from '@prisma/client';

// DI化: PrismaClientの多重生成を防ぐため依存性注入パターンを採用
let injectedPrisma: PrismaClient | null = null;

/**
 * PrismaClientインスタンスを設定
 * 呼び出し側スクリプトで起動時に一度だけ呼び出す
 */
export const setPrisma = (client: PrismaClient) => {
  injectedPrisma = client;
};

/**
 * PrismaClientインスタンスを取得
 * 未注入の場合は新規作成（後方互換性のため）
 */
export const getPrisma = (): PrismaClient => {
  if (!injectedPrisma) {
    // 警告: 理想的にはsetPrismaで注入すべき
    console.warn('[processing-status] PrismaClient not injected, creating new instance');
    injectedPrisma = new PrismaClient();
  }
  return injectedPrisma;
};

/**
 * 最終処理時刻を取得
 */
export async function getLastProcessedTime(processName: string): Promise<Date | null> {
  const log = await getPrisma().processingLog.findUnique({
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
  metadata?: Prisma.InputJsonValue,
  processedAt?: Date
): Promise<void> {
  const ts = processedAt ?? new Date();
  await getPrisma().processingLog.upsert({
    where: { processName },
    update: {
      lastProcessedAt: ts,
      processedCount,
      status,
      metadata,
      updatedAt: ts
    },
    create: {
      processName,
      lastProcessedAt: ts,
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

  // 将来時刻（時計ずれ）なら即処理する
  if (timeSinceLastProcess < 0) return true;
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

  const count = await getPrisma().article.count({
    where: {
      updatedAt: { gt: lastProcessedAt }
    }
  });

  return count > 0;
}

/**
 * 前回処理以降にコンテンツが更新された記事があるかチェック
 * （要約生成などの自己更新による再処理を防ぐため）
 */
export async function hasContentUpdatesSince(processName: string): Promise<boolean> {
  const lastProcessedAt = await getLastProcessedTime('summary-generation');

  if (!lastProcessedAt) {
    return true; // 初回実行
  }

  const count = await getPrisma().article.count({
    where: {
      contentUpdatedAt: { gt: lastProcessedAt }
    }
  });

  return count > 0;
}

/**
 * 処理ログのクリーンアップ（古いログを削除）
 */
export async function cleanupOldLogs(daysToKeep: number = 30): Promise<void> {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

  await getPrisma().processingLog.deleteMany({
    where: {
      updatedAt: { lt: cutoffDate }
    }
  });
}