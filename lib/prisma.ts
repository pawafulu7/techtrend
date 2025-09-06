import { PrismaClient } from '@prisma/client';
import { getPrismaConfig } from './database-config';

// Type-safe global declaration
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const globalForPrisma = globalThis as unknown as { __prisma: PrismaClient | undefined };

// Singleton pattern to prevent multiple instances
const prismaClientSingleton = (): PrismaClient => {
  const config = getPrismaConfig();
  // Use default config if DATABASE_URL is not set (for build time)
  return new PrismaClient(config || {
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });
};

// Use existing instance or create new one
export const prisma: PrismaClient = globalForPrisma.__prisma ?? prismaClientSingleton();

// Preserve instance in development for hot reloading
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma ??= prisma;
}

// Graceful shutdown handling (skip in serverless environments)
if (process.env.NODE_ENV === 'production' && 
    !process.env.VERCEL && 
    !process.env.AWS_EXECUTION_ENV &&
    !process.env.NETLIFY) {
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