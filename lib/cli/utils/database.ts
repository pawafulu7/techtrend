import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// グローバルPrismaクライアントのインスタンス
let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.DEBUG ? ['query', 'info', 'warn', 'error'] : ['error'],
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
