/**
 * タグの記事数を有効なソースの記事だけで数える集計（issue #688）をテスト DB で確かめる。
 *
 * 上位の選定は生 SQL なので、`where` を検査するモックのテストでは順位の誤りを検出できない。
 * ここでは有効・無効のソースと記事を作り、件数と順位を実 DB で確かめる。
 * 自分で作ったタグ（名前に suffix を含む）だけを読むので、ほかのテストと並列に走っても干渉しない。
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { PrismaClient } from '@/lib/prisma-exports';
import { NextRequest } from 'next/server';
import {
  countTagArticlesInRange,
  findTopTags,
} from '@/lib/database/tag-article-counts';
import { GET as getNewTags } from '@/app/api/tags/new/route';

// 実 DB の PrismaClient は jest.requireActual で取る（enabled-source-filter.db.test.ts と同じ）
const { PrismaClient: RealPrismaClient } = jest.requireActual(
  '@/lib/prisma-exports'
);
const { PrismaPg } = jest.requireActual('@prisma/adapter-pg');
// route の prisma（lib/prisma）は jest.setup.node.js がモックした PrismaClient（= prismaMock）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../../test/utils/prisma-mock');
const DB_URL = process.env.DATABASE_URL;

// 書き込むので、DB 名が _test で終わるときだけ走らせる（開発 DB に行を残さないため）
const isTestDatabase = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    return /_test$/.test(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
};
const describeIf = isTestDatabase(DB_URL) ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;

describeIf('tag-article-counts（テスト DB）', () => {
  let prisma: PrismaClient;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * DAY_MS);

  // beforeAll が途中で失敗しても、作れた行だけを afterAll で消すために記録する
  const createdSourceIds: string[] = [];
  const createdTagIds: string[] = [];
  const tagIds: Record<string, string> = {};
  let articleSeq = 0;

  const createSource = async (label: string, enabled: boolean) => {
    const source = await prisma.source.create({
      data: {
        name: `${label} Source ${suffix}`,
        url: `https://example.com/tag-counts-${label}-${suffix}`,
        type: 'RSS',
        enabled,
      },
    });
    createdSourceIds.push(source.id);
    return source.id;
  };

  const createTag = async (key: string, name: string) => {
    const tag = await prisma.tag.create({ data: { name } });
    createdTagIds.push(tag.id);
    tagIds[key] = tag.id;
  };

  const createArticle = async (
    sourceId: string,
    publishedAt: Date,
    tagKeys: string[],
    isHidden = false
  ) => {
    articleSeq += 1;
    await prisma.article.create({
      data: {
        title: `tag-counts article ${articleSeq}`,
        url: `https://example.com/tag-counts-article-${suffix}-${articleSeq}`,
        sourceId,
        publishedAt,
        isHidden,
        tags: { connect: tagKeys.map((key) => ({ id: tagIds[key] })) },
      },
    });
  };

  beforeAll(async () => {
    prisma = new RealPrismaClient({
      adapter: new PrismaPg({ connectionString: DB_URL! }),
    });
    await prisma.$connect();

    const enabled = await createSource('enabled', true);
    const disabled = await createSource('disabled', false);

    // 順位の入れ替わり: X は無効 3 件・有効 1 件、Y は有効 2 件、Z は無効だけ
    await createTag('x', `rank-${suffix}-x`);
    await createTag('y', `rank-${suffix}-y`);
    await createTag('z', `rank-${suffix}-z`);
    for (let i = 0; i < 3; i++) {
      await createArticle(disabled, daysAgo(2), ['x']);
    }
    await createArticle(enabled, daysAgo(400), ['x']);
    await createArticle(enabled, daysAgo(2), ['y']);
    await createArticle(enabled, daysAgo(45), ['y']);
    await createArticle(disabled, daysAgo(2), ['z']);

    // LIKE のワイルドカードのエスケープ
    await createTag('pct', `like-${suffix}-a%b`);
    await createTag('any', `like-${suffix}-aXb`);
    await createArticle(enabled, daysAgo(2), ['pct', 'any']);

    // 対照: 全ソース有効のとき、今までの Prisma の集計と同じ結果になること（非表示の記事も数える）
    await createTag('c1', `ctl-${suffix}-1`);
    await createTag('c2', `ctl-${suffix}-2`);
    await createTag('c3', `ctl-${suffix}-3`);
    await createArticle(enabled, daysAgo(2), ['c1', 'c2', 'c3']);
    await createArticle(enabled, daysAgo(100), ['c1', 'c2']);
    await createArticle(enabled, daysAgo(3), ['c1'], true);
    await createArticle(enabled, daysAgo(200), ['c1']);

    // 新規タグ（/api/tags/new、既定は 7 日）: N1 は過去の出現が無効なソースだけ、N2 は有効なソースにもある
    await createTag('n1', `new-${suffix}-1`);
    await createTag('n2', `new-${suffix}-2`);
    await createTag('n3', `new-${suffix}-3`);
    await createArticle(disabled, daysAgo(30), ['n1']);
    await createArticle(enabled, daysAgo(1), ['n1', 'n2']);
    await createArticle(enabled, daysAgo(30), ['n2']);
    await createArticle(disabled, daysAgo(1), ['n3']);
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdSourceIds.length > 0) {
      await prisma.article.deleteMany({
        where: { sourceId: { in: createdSourceIds } },
      });
      await prisma.source.deleteMany({
        where: { id: { in: createdSourceIds } },
      });
    }
    if (createdTagIds.length > 0) {
      await prisma.tag.deleteMany({ where: { id: { in: createdTagIds } } });
    }
    await prisma.$disconnect();
  });

  describe('findTopTags', () => {
    it('limit=1 で、無効なソースの記事を除いた件数の多いタグが返る', async () => {
      const top = await findTopTags(prisma, {
        limit: 1,
        nameContains: `rank-${suffix}`,
      });

      expect(top.map((t) => [t.id, t.count])).toEqual([[tagIds.y, 2]]);
      expect(top[0]).toMatchObject({
        name: `rank-${suffix}-y`,
        category: null,
      });
    });

    it('有効なソースの記事が無いタグは返さない', async () => {
      const top = await findTopTags(prisma, {
        limit: 10,
        nameContains: `rank-${suffix}`,
      });

      expect(top.map((t) => [t.id, t.count])).toEqual([
        [tagIds.y, 2],
        [tagIds.x, 1],
      ]);
    });

    it('activeSince: 期間内に有効なソースの記事があるタグだけを、全期間の件数で選ぶ', async () => {
      const top = await findTopTags(prisma, {
        limit: 10,
        nameContains: `rank-${suffix}`,
        activeSince: daysAgo(30),
      });

      // X の期間内の記事は無効なソースだけなので出ない
      expect(top.map((t) => [t.id, t.count, t.periodCount])).toEqual([
        [tagIds.y, 2, 1],
      ]);
    });

    it('名前の % や _ はワイルドカードにならない', async () => {
      const top = await findTopTags(prisma, {
        limit: 10,
        nameContains: `like-${suffix}-a%b`,
      });

      expect(top.map((t) => t.id)).toEqual([tagIds.pct]);
    });

    it('対照: 全ソース有効なら、今までの Prisma の集計と同じ順位・件数（全期間）', async () => {
      const expected = await prisma.tag.findMany({
        where: { name: { contains: `ctl-${suffix}` } },
        include: { _count: { select: { articles: true } } },
        orderBy: { articles: { _count: 'desc' } },
      });
      const top = await findTopTags(prisma, {
        limit: 10,
        nameContains: `ctl-${suffix}`,
      });

      expect(expected.map((t) => t._count.articles)).toEqual([4, 2, 1]);
      expect(top.map((t) => [t.id, t.count])).toEqual(
        expected.map((t) => [t.id, t._count.articles])
      );
    });

    it('対照: 全ソース有効なら、今までの Prisma の集計と同じ順位・件数（期間あり）', async () => {
      const since = daysAgo(30);
      const expected = await prisma.tag.findMany({
        where: {
          name: { contains: `ctl-${suffix}` },
          articles: { some: { publishedAt: { gte: since } } },
        },
        select: {
          id: true,
          _count: {
            select: { articles: { where: { publishedAt: { gte: since } } } },
          },
        },
        orderBy: { articles: { _count: 'desc' } },
      });
      const top = await findTopTags(prisma, {
        limit: 10,
        nameContains: `ctl-${suffix}`,
        activeSince: since,
      });

      expect(expected.map((t) => t._count.articles)).toEqual([2, 1, 1]);
      expect(top.map((t) => [t.id, t.periodCount])).toEqual(
        expected.map((t) => [t.id, t._count.articles])
      );
    });
  });

  describe('countTagArticlesInRange', () => {
    it('範囲内の有効なソースの記事だけを数え、0 件のタグは入れない', async () => {
      const counts = await countTagArticlesInRange(
        prisma,
        [tagIds.x, tagIds.y, tagIds.z],
        { from: daysAgo(60), to: daysAgo(30) }
      );
      expect(Object.fromEntries(counts)).toEqual({ [tagIds.y]: 1 });

      const recent = await countTagArticlesInRange(
        prisma,
        [tagIds.x, tagIds.y, tagIds.z],
        { from: daysAgo(7), to: new Date(now + DAY_MS) }
      );
      expect(Object.fromEntries(recent)).toEqual({ [tagIds.y]: 1 });
    });

    it('範囲の終わりは含まない', async () => {
      const counts = await countTagArticlesInRange(prisma, [tagIds.y], {
        from: daysAgo(60),
        to: daysAgo(45),
      });
      expect(counts.size).toBe(0);
    });

    it('タグが空なら DB に問い合わせない', async () => {
      await expect(
        countTagArticlesInRange(prisma, [], {
          from: daysAgo(1),
          to: new Date(),
        })
      ).resolves.toEqual(new Map());
    });
  });

  describe('GET /api/tags/new（route の SQL を実 DB で実行）', () => {
    beforeEach(() => {
      prismaMock.$queryRaw.mockImplementation(
        (...args: Parameters<PrismaClient['$queryRaw']>) =>
          prisma.$queryRaw(...args)
      );
    });

    afterEach(() => {
      prismaMock.$queryRaw.mockReset();
    });

    it('無効なソースにしか出ていなかったタグは、有効なソースに初めて出たときに新規として扱う', async () => {
      const response = await getNewTags(
        new NextRequest('http://localhost:3000/api/tags/new?days=7')
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        tags: { id: string; articleCount: number }[];
      };
      const own = body.tags.filter((t) =>
        [tagIds.n1, tagIds.n2, tagIds.n3].includes(t.id)
      );

      // N2 は 30 日前に有効なソースの記事があるので新規ではない。N3 は無効なソースの記事だけなので出ない
      expect(own).toEqual([
        expect.objectContaining({ id: tagIds.n1, articleCount: 1 }),
      ]);
    });
  });
});
