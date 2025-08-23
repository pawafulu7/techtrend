import { PrismaClient } from '@prisma/client';
import { container } from '../container';
import { DI_TOKENS } from '../types';

let prismaInstance: PrismaClient | null = null;

export function registerPrismaProvider(): void {
  container.registerSingleton(DI_TOKENS.PRISMA, () => {
    if (!prismaInstance) {
      prismaInstance = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    }
    return prismaInstance;
  });
}

export function getPrismaClient(): PrismaClient {
  return container.get<PrismaClient>(DI_TOKENS.PRISMA);
}

export async function closePrismaConnection(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}