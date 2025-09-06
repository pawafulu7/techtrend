import { PrismaClient } from '@prisma/client';
import { getPrismaConfig } from './database-config';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Singleton pattern to prevent multiple instances
const prismaClientSingleton = (): PrismaClient => {
  const config = getPrismaConfig();
  // Use default config if DATABASE_URL is not set (for build time)
  return new PrismaClient(config || {
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

// Use existing instance or create new one
export const prisma: PrismaClient = globalForPrisma.prisma ?? prismaClientSingleton();

// Preserve instance in development for hot reloading
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma ??= prisma;
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