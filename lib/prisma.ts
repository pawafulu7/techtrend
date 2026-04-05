import { PrismaClient } from '@prisma/client';
import { getPrismaConfig } from './database-config';
import { env } from '@/lib/config/env';

// Type-safe global declaration
declare global {
  var __prisma: PrismaClient | undefined;
}

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
};

// Singleton pattern to prevent multiple instances
const prismaClientSingleton = (): PrismaClient => {
  const config = getPrismaConfig();
  // Use default config if DATABASE_URL is not set (for build time)
  return new PrismaClient(
    config || {
      log:
        env.PRISMA_QUERY_LOG === 'true'
          ? ['query', 'error', 'warn']
          : ['error', 'warn'],
    }
  );
};

// Use existing instance or create new one with lazy initialization
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = prismaClientSingleton();
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
