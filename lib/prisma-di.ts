// Prisma client export (DI integration)
import { PrismaClient } from '@/lib/prisma-exports';
import { initializeDI, getPrismaClient } from './di';

// Initialize DI container (skip in test environments)
if (process.env.NODE_ENV !== 'test') {
  initializeDI();
}

// Get PrismaClient via DI (lazy evaluation)
export function getPrisma(): PrismaClient {
  return getPrismaClient();
}

// Backwards-compatible proxy export
export const prisma = new Proxy({} as PrismaClient, {
  get: (_target, prop) => {
    const client = getPrisma();
    return client[prop as keyof PrismaClient];
  },
});
