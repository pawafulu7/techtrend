import type { PrismaClient } from '@/lib/prisma-exports';

/**
 * TrendReportGenerator の generate*Report を DB なしで通すための Prisma のモック。
 * 既存のレポートは無く、期間の記事は 1 件。保存（trendReport.create）に渡した値を create で見られる
 */
export function createTrendReportPrismaMock() {
  const article = {
    id: 'article-1',
    title: 'TypeScript 6 の新しい型推論',
    translatedTitle: null,
    url: 'https://example.com/articles/1',
    thumbnail: null,
    detailedSummary: null,
    publishedAt: new Date('2026-10-23T03:00:00Z'),
    source: { name: 'Example Blog' },
    tags: [{ name: 'TypeScript' }],
    _count: { articleViews: 3, favorites: 1 },
  };
  const create = jest.fn(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'report-1',
      ...data,
    })
  );
  const prisma = {
    trendReport: { findUnique: jest.fn(async () => null), create },
    article: { findMany: jest.fn(async () => [article]) },
  } as unknown as PrismaClient;
  return { prisma, create };
}

/** 保存したレポートの AI 要約まわりの値 */
export function savedAiFields(create: jest.Mock) {
  const { data } = create.mock.calls[0][0] as {
    data: { aiSummary?: string; aiModel?: string; promptVersion?: string };
  };
  return {
    aiSummary: data.aiSummary,
    aiModel: data.aiModel,
    promptVersion: data.promptVersion,
  };
}
