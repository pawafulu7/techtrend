/**
 * トレンドレポートの集計元（fetchArticles）から、無効化したソースの記事を除く（issue #688）
 */
import { fetchArticles } from '@/lib/services/trend-report/trend-data-aggregator';
import { enabledSourceWhere } from '@/lib/database/enabled-source-filter';
import type { PrismaClient } from '@/lib/prisma-exports';

describe('fetchArticles', () => {
  it('期間内の記事のうち、有効なソースの記事だけを引く', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { article: { findMany } } as unknown as PrismaClient;
    const start = new Date('2026-09-30T15:00:00Z');
    const end = new Date('2026-10-01T15:00:00Z');

    await fetchArticles(prisma, start, end);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({
      publishedAt: { gte: start, lt: end },
      AND: [enabledSourceWhere()],
    });
  });
});
