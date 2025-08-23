import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { container } from '../container';
import { DI_TOKENS } from '../types';

export function registerTestProviders(): void {
  // Prismaモックの登録
  const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;
  container.register(DI_TOKENS.PRISMA, () => prismaMock);

  // Redisモックの登録
  const redisMock = {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    keys: jest.fn(),
    flushdb: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
  };
  container.register(DI_TOKENS.REDIS, () => redisMock);
}

export function resetTestProviders(): void {
  container.reset();
  registerTestProviders();
}