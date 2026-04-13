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

export async function closePrismaConnection(): Promise<void> {
  await prisma.$disconnect();
  // Reset global singleton so a fresh client is created on next access
  // (relevant for scripts that disconnect mid-process)
  const g = globalThis as unknown as { __prisma: unknown };
  g.__prisma = undefined;
}
