import { createPrismaClient } from '@/lib/prisma/create-client';
import { PrismaClient } from '@/lib/prisma-exports';
import { logger } from './logger';
import { env } from '@/lib/config/env';

// グローバルPrismaクライアントのインスタンス
let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = createPrismaClient({
      log: (() => {
        const debug = env.DEBUG?.trim();
        return debug && !/^(false|0)$/i.test(debug)
          ? (['query', 'info', 'warn', 'error'] as Array<
              'query' | 'info' | 'warn' | 'error'
            >)
          : (['error'] as Array<'query' | 'info' | 'warn' | 'error'>);
      })(),
    });
  }
  return prisma;
}

export async function withTransaction<T>(
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  const client = getPrismaClient();

  try {
    logger.debug('トランザクション開始');
    const result = await client.$transaction(async (tx) => {
      return await fn(tx as PrismaClient);
    });
    logger.debug('トランザクション完了');
    return result;
  } catch (_error) {
    logger.error('トランザクションエラー', _error);
    throw _error;
  }
}

export async function closePrismaClient() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.debug('データベース接続を閉じました');
  }
}

// プロセス終了時のクリーンアップ
process.on('beforeExit', async () => {
  await closePrismaClient();
});
