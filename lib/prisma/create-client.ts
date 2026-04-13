/**
 * PrismaClient factory for scripts, seeds, and tests.
 *
 * Uses PrismaPg driver adapter (Prisma v7 requirement).
 * For the app singleton, use lib/prisma.ts instead.
 */
import { PrismaClient } from '@/lib/prisma-exports';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { getPoolConfig } from '@/lib/database-config';
import { env } from '@/lib/config/env';

// Ensure pg returns Date objects for timestamp columns (same as lib/prisma.ts)
pg.types.setTypeParser(1114, (val: string) => new Date(val + '+00:00'));
pg.types.setTypeParser(1184, (val: string) => new Date(val));

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
    log: options?.log ?? ['error', 'warn'],
    transactionOptions: {
      timeout: env.DB_TRANSACTION_TIMEOUT,
    },
  });
}
