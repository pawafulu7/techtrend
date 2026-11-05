/**
 * 要約を作る対象の条件（pending-articles.ts）と、それを使う3つの経路のテスト
 */

import { SkipReason } from '@/lib/prisma-exports';
import {
  CONTENT_FETCH_FAILURE_PREFIX,
  PENDING_SUMMARY_ORDER_BY,
  noContentSkipReason,
  noSummaryFailureYetWhere,
  pendingSummaryWhere,
  recordContentSkipReasons,
  recordNoContentSkipReasons,
} from '@/lib/summary/pending-articles';
import {
  checkNewArticles,
  processArticleWithTimeout,
} from '@/lib/summary/batch-processor';
import { generateMissingSummaries } from '@/lib/summary/summary-orchestrator';
import { SummaryManager } from '@/lib/summary/summary-manager';

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

describe('recordContentSkipReasons', () => {
  it('読んだときと本文の長さが同じ記事だけに印を付け、本文が取れなかった理由（summaryError）は消さない', async () => {
    const prisma = createPrismaMock();

    await recordContentSkipReasons(
      prisma as never,
      [
        { id: 'a1', contentLength: null },
        { id: 'a2', contentLength: 42 },
      ],
      SkipReason.THIN_CONTENT
    );

    expect(prisma.article.updateMany.mock.calls.map(([args]) => args)).toEqual([
      {
        where: {
          id: 'a1',
          OR: [{ summary: null }, { summary: '' }],
          contentLength: null,
        },
        data: { skipReason: SkipReason.THIN_CONTENT },
      },
      {
        where: {
          id: 'a2',
          OR: [{ summary: null }, { summary: '' }],
          contentLength: 42,
        },
        data: { skipReason: SkipReason.THIN_CONTENT },
      },
    ]);
  });

  it('対象が無ければ何も書かない', async () => {
    const prisma = createPrismaMock();

    await recordContentSkipReasons(prisma as never, [], SkipReason.THIN_CONTENT);

    expect(prisma.article.updateMany).not.toHaveBeenCalled();
  });
});

describe('noContentSkipReason', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ',
  ])('本文の無い YouTube の動画（%s）は VIDEO', (url) => {
    expect(noContentSkipReason(url)).toBe(SkipReason.VIDEO);
  });

  it.each([
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/playlist?list=PL0123456789',
    'https://www.youtube.com/watch?v=short',
  ])('動画でない URL（%s）は CONTENT_FETCH_FAILED', (url) => {
    expect(noContentSkipReason(url)).toBe(SkipReason.CONTENT_FETCH_FAILED);
  });
});

describe('recordNoContentSkipReasons', () => {
  it('動画には VIDEO、それ以外には CONTENT_FETCH_FAILED を付ける', async () => {
    const prisma = createPrismaMock();

    await recordNoContentSkipReasons(prisma as never, [
      { id: 'video', url: 'https://youtu.be/dQw4w9WgXcQ', contentLength: null },
      { id: 'page', url: 'https://example.com/post', contentLength: 0 },
    ]);

    expect(
      prisma.article.updateMany.mock.calls.map(([args]) => [
        args.where.id,
        args.data.skipReason,
      ])
    ).toEqual([
      ['page', SkipReason.CONTENT_FETCH_FAILED],
      ['video', SkipReason.VIDEO],
    ]);
  });

  it('VIDEO を書けなくても（enum を足すマイグレーションの前）取得失敗は付け、例外を投げない', async () => {
    const prisma = createPrismaMock();
    prisma.article.updateMany.mockImplementation(async (args) => {
      if (args.data.skipReason === SkipReason.VIDEO) {
        throw new Error('invalid input value for enum "SkipReason": "VIDEO"');
      }
      return { count: 1 };
    });

    await expect(
      recordNoContentSkipReasons(prisma as never, [
        { id: 'video', url: 'https://youtu.be/dQw4w9WgXcQ', contentLength: null },
        { id: 'page', url: 'https://example.com/post', contentLength: 0 },
      ])
    ).resolves.toBeUndefined();

    expect(prisma.article.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'page' }),
        data: { skipReason: SkipReason.CONTENT_FETCH_FAILED },
      })
    );
  });
});

describe('noSummaryFailureYetWhere', () => {
  it('要約の失敗がまだ無い記事として、summaryError が空か、本文を取れなかった理由だけの記事を選ぶ', () => {
    expect(noSummaryFailureYetWhere()).toEqual({
      OR: [
        { summaryError: null },
        { summaryError: { startsWith: CONTENT_FETCH_FAILURE_PREFIX } },
      ],
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
    expect(prisma.article.findMany.mock.calls[0][0].orderBy).toEqual(
      PENDING_SUMMARY_ORDER_BY
    );
  });

  it('missing は既定で 7 日の共通の条件を使う', async () => {
    const prisma = createPrismaMock();

    await generateMissingSummaries(prisma as never, {}, jest.fn(), jest.fn());

    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: pendingSummaryWhere(7, NOW),
        orderBy: { createdAt: 'desc' },
      })
    );
  });

  it('記事 ID を指定したときは期間も skipReason も見ない', async () => {
    const prisma = createPrismaMock();

    await generateMissingSummaries(
      prisma as never,
      { articleIds: ['a1', 'a2'] },
      jest.fn(),
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
    url: 'https://example.com/no-content',
    content: '',
    contentLength: 0,
    publishedAt: NOW,
    source: { id: 's1', name: 'Test' },
  };
  const noContentVideo = {
    id: 'video',
    title: 'Video',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    content: null,
    contentLength: null,
    publishedAt: NOW,
    source: { id: 's1', name: 'Test' },
  };
  const thinContent = {
    id: 'thin',
    title: 'Thin',
    url: 'https://example.com/thin',
    content: 'short',
    contentLength: 5,
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
        await generateMissingSummaries(prisma as never, {}, jest.fn(), jest.fn());
      },
    ],
  ])(
    '%s は、読んだときと本文の長さが同じ記事にだけ本文なし・本文不足・動画の印を付ける',
    async (_name, run) => {
      const prisma = createPrismaMock([noContent, noContentVideo, thinContent]);

      await run(prisma);

      const updates = skipReasonUpdates(prisma);
      expect(
        updates.map((u) => [u.where.id, u.where.contentLength, u.data.skipReason])
      ).toEqual(
        expect.arrayContaining([
          ['no-content', 0, SkipReason.CONTENT_FETCH_FAILED],
          ['video', null, SkipReason.VIDEO],
          ['thin', 5, SkipReason.THIN_CONTENT],
        ])
      );
      expect(updates).toHaveLength(3);
    }
  );
});

describe('要約の一時的な失敗の数え方', () => {
  it('本文を取れなかった理由だけが入った記事は、要約の失敗の1回目として扱う（QUALITY_FAILED にしない）', async () => {
    const prisma = createPrismaMock();
    const article = {
      id: 'recovered',
      title: 'Recovered',
      url: 'https://example.com/recovered',
      source: { id: 's1', name: 'Test' },
    };

    await processArticleWithTimeout(
      article as never,
      'body '.repeat(100),
      jest.fn().mockRejectedValue(new Error('network error')),
      prisma as never,
      jest.fn()
    );

    expect(prisma.article.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.article.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'recovered',
        skipReason: null,
        OR: [{ summary: null }, { summary: '' }],
        AND: [noSummaryFailureYetWhere()],
      },
      data: { summaryError: 'network error' },
    });
  });
});
