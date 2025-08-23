import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

export interface IDIContainer {
  get<T>(token: symbol): T;
  register<T>(token: symbol, provider: () => T): void;
  registerSingleton<T>(token: symbol, provider: () => T): void;
  reset(): void;
}

export interface IProviders {
  prisma: PrismaClient;
  redis: Redis | null;
}

export const DI_TOKENS = {
  PRISMA: Symbol('PRISMA'),
  REDIS: Symbol('REDIS'),
} as const;