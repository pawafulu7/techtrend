import { PrismaClient } from '@prisma/client';
import { getPrismaConfig } from './database-config';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Singleton pattern to prevent multiple instances
const prismaClientSingleton = () => {
  const config = getPrismaConfig();
  // Use default config if DATABASE_URL is not set (for build time)
  return new PrismaClient(config || {
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

// Use existing instance or create new one
export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

// Preserve instance in development for hot reloading
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown handling
if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}