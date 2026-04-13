import { PrismaClient } from '@/lib/prisma-exports';
import { container } from '../container';
import { DI_TOKENS } from '../types';
import { prisma } from '@/lib/prisma';

export function registerPrismaProvider(): void {
  container.registerSingleton(DI_TOKENS.PRISMA, () => {
    return prisma;
  });
}

export function getPrismaClient(): PrismaClient {
  return container.get<PrismaClient>(DI_TOKENS.PRISMA);
}

/**
 * Disconnect the singleton PrismaClient.
 * After calling this, the exported `prisma` const still holds the old instance.
 * Only call this at process exit — do not attempt to reuse prisma afterwards.
 */
export async function closePrismaConnection(): Promise<void> {
  await prisma.$disconnect();
}
