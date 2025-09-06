import { PrismaClient } from '@prisma/client';
import { getPrismaConfig } from './database-config';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Singleton pattern to prevent multiple instances
const prismaClientSingleton = () => {
  return new PrismaClient(getPrismaConfig());
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