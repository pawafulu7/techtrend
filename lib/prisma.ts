import { PrismaClient } from '@/lib/prisma-exports';
import { PrismaPg } from '@prisma/adapter-pg';
import { getPoolConfig } from '@/lib/database-config';
import { env } from '@/lib/config/env';

declare global {
  var __prisma: PrismaClient | undefined;
}

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
};

function createSingleton(): PrismaClient {
  const poolConfig = getPoolConfig();

  // Build time: no DATABASE_URL, use dummy adapter (pg.Pool connects lazily)
  const adapter = new PrismaPg(
    poolConfig ?? {
      connectionString: 'postgresql://dummy:dummy@localhost:5432/dummy',
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5000,
    }
  );

  const logLevels: Array<'query' | 'error' | 'warn'> =
    env.PRISMA_QUERY_LOG === 'true'
      ? ['query', 'error', 'warn']
      : ['error', 'warn'];

  return new PrismaClient({
    adapter,
    log: logLevels,
    errorFormat: process.env.NODE_ENV === 'production' ? 'minimal' : 'pretty',
    transactionOptions: {
      timeout: env.DB_TRANSACTION_TIMEOUT,
    },
  });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createSingleton();
  }
  return globalForPrisma.__prisma;
}

export const prisma: PrismaClient = getPrismaClient();

// Graceful shutdown handling (skip in serverless environments)
if (
  process.env.NODE_ENV === 'production' &&
  !env.VERCEL &&
  !env.AWS_EXECUTION_ENV &&
  !env.NETLIFY
) {
  const cleanup = async () => {
    try {
      await prisma.$disconnect();
    } catch {
      /* noop */
    }
  };
  process.once('beforeExit', cleanup);
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
}
