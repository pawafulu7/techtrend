import { PrismaClient } from '@/lib/prisma-exports';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '@/lib/config/env';

declare global {
  var __prisma: PrismaClient | undefined;
}

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
};

function createSingleton(): PrismaClient {
  const connectionString = env.DATABASE_URL;

  // Build time: no DATABASE_URL available, use dummy adapter
  // (pg.Pool connects lazily, so this won't attempt a real connection)
  const connStr =
    connectionString ?? 'postgresql://dummy:dummy@localhost:5432/dummy';

  // Append connect_timeout to connection string if not already present
  const url = new URL(connStr);
  if (!url.searchParams.has('connect_timeout')) {
    url.searchParams.set('connect_timeout', String(env.DB_CONNECT_TIMEOUT));
  }

  const adapter = new PrismaPg({
    connectionString: url.toString(),
    max: connectionString ? env.DB_CONNECTION_LIMIT : 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: connectionString
      ? env.DB_POOL_TIMEOUT * 1000
      : 5000,
  });

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
