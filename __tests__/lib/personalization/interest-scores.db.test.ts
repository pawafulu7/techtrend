/**
 * 記事の興味の分野の点数（lib/personalization/interest-scores.ts）と、重心の作り直し
 * （lib/personalization/centroid-service.ts）を、マイグレーションを適用したテスト DB で確かめる。
 *
 * refreshCentroidsAndScores() はテスト DB の ArticleInterestScore を全件書き直すので、同じ表を使う
 * 他の DB テスト（digest-personalized.db.test.ts）と並列にしない。通常の jest からは除外していて
 * （jest.config.node.js の SERIAL_DB_TEST_PATHS）、`npm run test:node:serial`、または
 * `JEST_SERIAL_DB=1 TEST_FILE=<このファイル> npm run docker:test:file` で流す
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import type { PrismaClient } from '@/lib/prisma-exports';
import {
  getInterestEmbedding,
  lockInterestScores,
  refreshInterestScoresForArticle,
} from '@/lib/personalization/interest-scores';
import { CentroidService } from '@/lib/personalization/centroid-service';

// 実 DB の PrismaClient は jest.requireActual で取る（article-knn.db.test.ts と同じ）
const { PrismaClient: RealPrismaClient } = jest.requireActual(
  '@/lib/prisma-exports'
);
const { PrismaPg } = jest.requireActual('@prisma/adapter-pg');
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

/** 1536 次元のベクトル。先頭の 2 つの成分だけを指定する */
const vector = (x: number, y: number): string =>
  `[${new Array<number>(1536)
    .fill(0)
    .map((_, i) => (i === 0 ? x : i === 1 ? y : 0))
    .join(',')}]`;

describeIf('記事の興味の分野の点数（テスト DB）', () => {
  let prisma: PrismaClient;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let sourceId: string | undefined;
  const categoryIds: string[] = [];
  const tagIds: string[] = [];
  let categoryA: string;
  let categoryB: string;

  const createArticle = async (embedding: string | null, tagId?: string) => {
    const article = await prisma.article.create({
      data: {
        title: 'interest score title',
        summary: '要約',
        url: `https://example.com/interest-score-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
        sourceId: sourceId!,
        publishedAt: new Date('2026-10-01T00:00:00Z'),
        ...(tagId ? { tags: { connect: { id: tagId } } } : {}),
      },
    });
    if (embedding) await writeSummaryEmbedding(article.id, embedding);
    return article.id;
  };

  /** ワーカー（article-embedding-pipeline.ts）と同じ書き方で要約の埋め込みを書く */
  const writeSummaryEmbedding = (articleId: string, embedding: string) =>
    prisma.$executeRawUnsafe(
      `INSERT INTO "ArticleEmbedding" (id, "articleId", "embeddingKey", embedding, model, version, "computedAt")
       VALUES (gen_random_uuid()::text, $1, 'summary'::"EmbeddingKey", $2::vector, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT ("articleId", "embeddingKey", model, version)
       DO UPDATE SET embedding = EXCLUDED.embedding, "computedAt" = CURRENT_TIMESTAMP`,
      articleId,
      embedding,
      getInterestEmbedding().model,
      getInterestEmbedding().version
    );

  const setCentroid = (categoryId: string, centroid: string) =>
    prisma.$executeRawUnsafe(
      `UPDATE "InterestCategory" SET "centroidEmbedding" = $2::vector WHERE id = $1`,
      categoryId,
      centroid
    );

  /** 記事の点数（テストで作った分野だけ）を分野ごとに返す */
  const scoresOf = async (articleId: string) => {
    const rows = await prisma.articleInterestScore.findMany({
      where: { articleId, categoryId: { in: categoryIds } },
      select: { categoryId: true, score: true },
    });
    return Object.fromEntries(rows.map((r) => [r.categoryId, r.score]));
  };

  beforeAll(async () => {
    prisma = new RealPrismaClient({
      adapter: new PrismaPg({ connectionString: DB_URL! }),
    });
    await prisma.$connect();
    const source = await prisma.source.create({
      data: {
        name: `interest score ${suffix}`,
        url: `https://example.com/interest-score-${suffix}`,
        type: 'RSS',
        enabled: true,
      },
    });
    sourceId = source.id;
    for (const name of ['a', 'b']) {
      const category = await prisma.interestCategory.create({
        data: { slug: `test-${name}-${suffix}`, name: `Test ${name}` },
      });
      categoryIds.push(category.id);
      const tag = await prisma.tag.create({
        data: { name: `interest-score-${name}-${suffix}` },
      });
      tagIds.push(tag.id);
      await prisma.tagCategoryMapping.create({
        data: { tagId: tag.id, categoryId: category.id },
      });
    }
    [categoryA, categoryB] = categoryIds;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (sourceId) {
      // 埋め込みと点数は記事の削除で消える（onDelete: Cascade）
      await prisma.article.deleteMany({ where: { sourceId } });
      await prisma.source.delete({ where: { id: sourceId } });
    }
    // 対応付けは分野・タグの削除で消える
    await prisma.interestCategory.deleteMany({
      where: { id: { in: categoryIds } },
    });
    await prisma.tag.deleteMany({ where: { id: { in: tagIds } } });
    await prisma.$disconnect();
  });

  describe('refreshInterestScoresForArticle', () => {
    beforeEach(async () => {
      await setCentroid(categoryA, vector(1, 0));
      await setCentroid(categoryB, vector(0, 1));
    });

    it('しきい値以上の分野だけに点数を書き、埋め込みを書き直したら点数も書き直す', async () => {
      const articleId = await createArticle(vector(1, 0));

      expect(await refreshInterestScoresForArticle(prisma, articleId)).toBe(1);
      const first = await scoresOf(articleId);
      expect(Object.keys(first)).toEqual([categoryA]);
      expect(first[categoryA]).toBeCloseTo(1, 5);

      await writeSummaryEmbedding(articleId, vector(0.6, 0.8));
      await refreshInterestScoresForArticle(prisma, articleId);
      const second = await scoresOf(articleId);
      expect(second[categoryA]).toBeCloseTo(0.6, 5);
      expect(second[categoryB]).toBeCloseTo(0.8, 5);

      // しきい値を下回った分野の点数は消える
      await writeSummaryEmbedding(articleId, vector(0, 1));
      await refreshInterestScoresForArticle(prisma, articleId);
      expect(Object.keys(await scoresOf(articleId))).toEqual([categoryB]);
    });

    it('要約を消して埋め込みが消えたら、点数も消える', async () => {
      const articleId = await createArticle(vector(1, 0));
      await refreshInterestScoresForArticle(prisma, articleId);
      expect(Object.keys(await scoresOf(articleId))).toEqual([categoryA]);

      await prisma.article.update({
        where: { id: articleId },
        data: { summary: null },
      });

      expect(await scoresOf(articleId)).toEqual({});
    });

    /** 点数のロックを待っている接続の数。最大 3 秒、1 以上になるのを待つ */
    const waitForAdvisoryLockWaiter = async (): Promise<number> => {
      for (let i = 0; i < 30; i++) {
        const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND wait_event = 'advisory'
        `;
        if (count > 0) return count;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return 0;
    };

    it('全記事の書き直しの途中は待ち、確定した新しい重心で書く', async () => {
      const articleId = await createArticle(vector(1, 0));
      let written: Promise<number> | undefined;

      await prisma.$transaction(
        async (tx) => {
          await lockInterestScores(tx);
          // 全記事の書き直しが A の重心を変えた（まだ確定していない）
          await tx.$executeRawUnsafe(
            `UPDATE "InterestCategory" SET "centroidEmbedding" = $2::vector WHERE id = $1`,
            categoryA,
            vector(0, 1)
          );
          written = refreshInterestScoresForArticle(prisma, articleId);
          expect(await waitForAdvisoryLockWaiter()).toBeGreaterThanOrEqual(1);
        },
        { timeout: 10_000 }
      );

      await written;
      // 待たずに前の重心（A = (1, 0)）で書いていれば、A に点数 1 で入る。新しい重心ではどの分野にも入らない
      expect(await scoresOf(articleId)).toEqual({});
    });

    it('要約の埋め込みが無い記事には書かない', async () => {
      const articleId = await createArticle(null);

      expect(await refreshInterestScoresForArticle(prisma, articleId)).toBe(0);
      expect(await scoresOf(articleId)).toEqual({});
    });
  });

  describe('CentroidService.refreshCentroidsAndScores', () => {
    it('重心を「分野の記事の平均 − 全記事の平均」にし、その重心で全記事の点数を書き直す', async () => {
      const [tagA, tagB] = tagIds;
      // 対応付けたタグの無い分野。前の重心が残っていても消す
      const categoryC = (
        await prisma.interestCategory.create({
          data: { slug: `test-c-${suffix}`, name: 'Test c' },
        })
      ).id;
      categoryIds.push(categoryC);
      await setCentroid(categoryC, vector(1, 1));
      const articleA1 = await createArticle(vector(1, 0), tagA);
      const articleA2 = await createArticle(vector(1, 0), tagA);
      const articleB1 = await createArticle(vector(0, 1), tagB);
      const articleB2 = await createArticle(vector(0, 1), tagB);

      const result = await new CentroidService(
        prisma
      ).refreshCentroidsAndScores();

      const sampleCounts = Object.fromEntries(
        result.categories
          .filter((c) => categoryIds.includes(c.categoryId))
          .map((c) => [c.categoryId, c.sampleCount])
      );
      expect(sampleCounts).toEqual({
        [categoryA]: 2,
        [categoryB]: 2,
        [categoryC]: 0,
      });
      expect(result.scoreCount).toBeGreaterThanOrEqual(4);

      // 全記事の平均を引くので、A の記事は A にだけ、B の記事は B にだけ入る
      for (const articleId of [articleA1, articleA2]) {
        expect(Object.keys(await scoresOf(articleId))).toEqual([categoryA]);
      }
      for (const articleId of [articleB1, articleB2]) {
        expect(Object.keys(await scoresOf(articleId))).toEqual([categoryB]);
      }

      const computedAt = Object.fromEntries(
        (
          await prisma.interestCategory.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, centroidComputedAt: true },
          })
        ).map((c) => [c.id, c.centroidComputedAt])
      );
      expect(computedAt[categoryA]).not.toBeNull();
      expect(computedAt[categoryB]).not.toBeNull();
      expect(computedAt[categoryC]).toBeNull();
      const [{ hasCentroid }] = await prisma.$queryRaw<
        { hasCentroid: boolean }[]
      >`SELECT "centroidEmbedding" IS NOT NULL AS "hasCentroid" FROM "InterestCategory" WHERE id = ${categoryC}`;
      expect(hasCentroid).toBe(false);
    });
  });
});
