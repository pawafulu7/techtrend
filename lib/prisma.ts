import { PrismaClient } from '@/lib/prisma-exports';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { getPoolConfig } from '@/lib/database-config';
import { env } from '@/lib/config/env';

// Prisma v7 PrismaPg: ensure pg returns Date objects for timestamp columns.
// PrismaPg's adapter may override pg's default timestamp parsing, causing
// $queryRaw results to return strings instead of Date objects.
// OID 1114 = timestamp without time zone, OID 1184 = timestamp with time zone.
pg.types.setTypeParser(1114, (val: string) => new Date(val + '+00:00'));
pg.types.setTypeParser(1184, (val: string) => new Date(val));

// Prisma v7 PrismaPg returns BigInt for PostgreSQL bigint columns (e.g. COUNT(*)).
// JSON.stringify doesn't handle BigInt natively, causing "Do not know how to
// serialize a BigInt" errors in Redis cache and API responses.
// Safe for this project: all bigint values are counts that fit in Number.
if (
  typeof (BigInt.prototype as unknown as { toJSON?: unknown }).toJSON ===
  'undefined'
) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function (this: bigint) {
      return Number(this);
    },
    writable: true,
    configurable: true,
  });
}

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
