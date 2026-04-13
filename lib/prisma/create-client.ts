/**
 * PrismaClient factory for scripts, seeds, and tests.
 *
 * Uses PrismaPg driver adapter (Prisma v7 requirement).
 * For the app singleton, use lib/prisma.ts instead.
 */
import { PrismaClient } from '@/lib/prisma-exports';
import { PrismaPg } from '@prisma/adapter-pg';

export function createPrismaClient(options?: {
  connectionString?: string;
  log?: Array<'query' | 'info' | 'warn' | 'error'>;
}): PrismaClient {
  const connectionString =
    options?.connectionString ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Provide connectionString or set the env var.'
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: options?.log ?? ['error', 'warn'],
  });
}
