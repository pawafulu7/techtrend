/**
 * PrismaClient factory for scripts, seeds, and tests.
 *
 * Uses PrismaPg driver adapter (Prisma v7 requirement).
 * For the app singleton, use lib/prisma.ts instead.
 */
import { PrismaClient } from '@/lib/prisma-exports';
import { PrismaPg } from '@prisma/adapter-pg';
import { getPoolConfig } from '@/lib/database-config';
import { env } from '@/lib/config/env';

type PrismaLogLevel = 'query' | 'info' | 'warn' | 'error';

/**
 * PRISMA_ERROR_LOG=false なら error を外す。Prisma の error ログには、DB に繋がらないときの
 * 接続先（ホスト）が入り、catch より先に出る。定期実行のログは公開されるので、そこでは外す
 */
export function withPrismaErrorLogSetting<T extends PrismaLogLevel>(levels: T[]): T[] {
  return env.PRISMA_ERROR_LOG === 'false'
    ? levels.filter((level) => level !== 'error')
    : levels;
}

export function createPrismaClient(options?: {
  connectionString?: string;
  log?: Array<'query' | 'info' | 'warn' | 'error'>;
}): PrismaClient {
  const poolConfig = getPoolConfig(options?.connectionString);

  if (!poolConfig) {
    throw new Error(
      'DATABASE_URL is not set. Provide connectionString or set the env var.'
    );
  }

  const adapter = new PrismaPg(poolConfig);

  return new PrismaClient({
    adapter,
    log: withPrismaErrorLogSetting(options?.log ?? ['error', 'warn']),
    transactionOptions: {
      timeout: env.DB_TRANSACTION_TIMEOUT,
    },
  });
}
