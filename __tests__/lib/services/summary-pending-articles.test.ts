/**
 * 要約を作る対象の条件（pending-articles.ts）と、それを使う3つの経路のテスト
 */

import { SkipReason } from '@/lib/prisma-exports';
import {
  contentUnchangedSinceWhere,
  pendingSummaryWhere,
} from '@/lib/services/summary/pending-articles';
import { checkNewArticles } from '@/lib/services/summary/batch-processor';
import { generateMissingSummaries } from '@/lib/services/summary/summary-orchestrator';
import { SummaryManager } from '@/lib/services/summary/summary-manager';

jest.mock('@/lib/di/bootstrap', () => ({
  getAppDependencies: jest.fn(() => ({
    service: { generateSummary: jest.fn() },
    translator: { translateTitle: jest.fn() },
  })),
}));

jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: {
    onBulkImport: jest.fn().mockResolvedValue(undefined),
    onArticleUpdated: jest.fn().mockResolvedValue(undefined),
  },
}));

const NOW = new Date('2026-10-17T09:00:00.000Z');
const SEVEN_DAYS_AGO = new Date('2026-10-10T09:00:00.000Z');

function createPrismaMock(articles: unknown[] = []) {
  return {
    article: {
      findFirst: jest.fn().mockResolvedValue({ id: 'a1' }),
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue(articles),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    source: { findMany: jest.fn().mockResolvedValue([]) },
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
}

describe('pendingSummaryWhere', () => {
  it('取り込んだ日時か本文を更新した日時が期間内の、要約も skipReason も無い記事を選ぶ', () => {
    expect(pendingSummaryWhere(7, NOW)).toEqual({
      OR: [{ summary: null }, { summary: '' }],
      skipReason: null,
      AND: [
        {
          OR: [
            { createdAt: { gte: SEVEN_DAYS_AGO } },
            { contentUpdatedAt: { gte: SEVEN_DAYS_AGO } },
          ],
        },
      ],
    });
  });

  it('公開日時（publishedAt）では期間を切らない', () => {
    expect(JSON.stringify(pendingSummaryWhere(7, NOW))).not.toContain(
      'publishedAt'
    );
  });
});

describe('contentUnchangedSinceWhere', () => {
  it('本文を更新していないか、読んだ時刻より前に更新した記事だけに当たる', () => {
    expect(contentUnchangedSinceWhere(NOW)).toEqual({
      OR: [{ contentUpdatedAt: null }, { contentUpdatedAt: { lte: NOW } }],
    });
  });
});

describe('要約の対象を選ぶ3つの経路', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('新着の確認（checkNewArticles）は共通の条件を使う', async () => {
    const prisma = createPrismaMock();

    await checkNewArticles(prisma as never, { days: 7 });

    expect(prisma.article.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: pendingSummaryWhere(7, NOW) })
    );
  });

  it('generate は新着の確認と同じ条件で記事を選ぶ', async () => {
    const prisma = createPrismaMock();
    const manager = new SummaryManager(prisma as never);

    await manager.generateSummaries({ days: 7, source: 'Zenn' });

    const checkWhere = prisma.article.findFirst.mock.calls[0][0].where;
    const generateWhere = prisma.article.findMany.mock.calls[0][0].where;
    expect(checkWhere).toEqual({
      ...pendingSummaryWhere(7, NOW),
      source: { name: 'Zenn' },
    });
    expect(generateWhere).toEqual(checkWhere);
  });

  it('missing は既定で 7 日の共通の条件を使う', async () => {
    const prisma = createPrismaMock();

    await generateMissingSummaries(prisma as never, {}, jest.fn());

    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: pendingSummaryWhere(7, NOW) })
    );
  });

  it('記事 ID を指定したときは期間も skipReason も見ない', async () => {
    const prisma = createPrismaMock();

    await generateMissingSummaries(
      prisma as never,
      { articleIds: ['a1', 'a2'] },
      jest.fn()
    );

    expect(prisma.article.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ summary: null }, { summary: '' }],
      id: { in: ['a1', 'a2'] },
    });
  });
});

describe('本文の判定の書き込み', () => {
  const noContent = {
    id: 'no-content',
    title: 'No content',
    content: '',
    publishedAt: NOW,
    source: { id: 's1', name: 'Test' },
  };
  const thinContent = {
    id: 'thin',
    title: 'Thin',
    content: 'short',
    publishedAt: NOW,
    source: { id: 's1', name: 'Test' },
  };

  function skipReasonUpdates(prisma: ReturnType<typeof createPrismaMock>) {
    return prisma.article.updateMany.mock.calls
      .map(([args]) => args)
      .filter((args) => args.data?.skipReason);
  }

  it.each([
    [
      'generate',
      async (prisma: ReturnType<typeof createPrismaMock>) => {
        await new SummaryManager(prisma as never).generateSummaries({});
      },
    ],
    [
      'missing',
      async (prisma: ReturnType<typeof createPrismaMock>) => {
        await generateMissingSummaries(prisma as never, {}, jest.fn());
      },
    ],
  ])(
    '%s は、読んだ後に本文が書き換わった記事には本文なし・本文不足の印を付けない',
    async (_name, run) => {
      const prisma = createPrismaMock([noContent, thinContent]);

      await run(prisma);

      const updates = skipReasonUpdates(prisma);
      expect(updates.map((u) => u.data.skipReason).sort()).toEqual(
        [SkipReason.CONTENT_FETCH_FAILED, SkipReason.THIN_CONTENT].sort()
      );
      for (const update of updates) {
        expect(update.where.AND).toEqual([
          {
            OR: [
              { contentUpdatedAt: null },
              { contentUpdatedAt: { lte: expect.any(Date) } },
            ],
          },
        ]);
      }
    }
  );
});
