import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep, _mockReset } from 'jest-mock-extended';

// Prismaクライアントのモック
export const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

// jestのグローバル設定
jest.mock('@/lib/database', () => ({
  prisma: prismaMock,
}));

// テスト用のデフォルトデータ生成ヘルパー
export const createMockArticle = (overrides?: Partial<any>) => ({
  id: 'test-article-id',
  title: 'Test Article',
  url: 'https://example.com/article',
  summary: 'Test summary',
  content: 'Test content',
  thumbnail: null,
  publishedAt: new Date('2024-01-01'),
  sourceId: 'test-source-id',
  qualityScore: 75,
  bookmarks: 10,
  userVotes: 5,
  difficulty: 'intermediate',
  detailedSummary: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockSource = (overrides?: Partial<any>) => ({
  id: 'test-source-id',
  name: 'Test Source',
  type: 'rss',
  url: 'https://example.com/feed',
  enabled: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockTag = (overrides?: Partial<any>) => ({
  id: 'test-tag-id',
  name: 'JavaScript',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});