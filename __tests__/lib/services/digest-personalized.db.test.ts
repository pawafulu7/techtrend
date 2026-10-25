/**
 * ダイジェストの「あなたへのおすすめ」（lib/services/digest-service.ts の getPersonalizedArticles）の SQL を、
 * マイグレーションを適用したテスト DB で確かめる
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { PrismaClient } from '@/lib/prisma-exports';
import { DigestService } from '@/lib/services/digest-service';
import type { RedisCache } from '@/lib/cache/redis-cache';

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

const VECTOR = `[${new Array<number>(1536)
  .fill(0)
  .map((_, i) => (i === 0 ? 1 : 0))
  .join(',')}]`;

const HOUR_MS = 60 * 60 * 1000;

describeIf('ダイジェストの「あなたへのおすすめ」（テスト DB）', () => {
  let prisma: PrismaClient;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let sourceId: string | undefined;
  let userId: string | undefined;
  const categoryIds: string[] = [];
  let categoryA: string;
  let categoryB: string;
  const articles: Record<string, string> = {};

  const noCache = {
    get: async () => null,
    set: async () => undefined,
    delete: async () => undefined,
  } as unknown as RedisCache;

  /** 記事と要約の埋め込みを作り、分野ごとの点数を書く */
  const createScoredArticle = async (
    name: string,
    options: {
      hoursAgo: number;
      scores: Record<string, number>;
      isOffTopic?: boolean;
      summaryComputed?: boolean;
    }
  ) => {
    const article = await prisma.article.create({
      data: {
        title: `digest ${name}`,
        summary: '要約',
        content: '本文',
        url: `https://example.com/digest-${suffix}-${name}`,
        sourceId: sourceId!,
        publishedAt: new Date(Date.now() - options.hoursAgo * HOUR_MS),
        summaryComputedAt:
          options.summaryComputed === false ? null : new Date(),
        isOffTopic: options.isOffTopic ?? false,
      },
    });
    const [{ id: embeddingId }] = await prisma.$queryRawUnsafe<
      { id: string }[]
    >(
      `INSERT INTO "ArticleEmbedding" (id, "articleId", "embeddingKey", embedding, model, version, "computedAt")
       VALUES (gen_random_uuid()::text, $1, 'summary'::"EmbeddingKey", $2::vector, $3, 1, CURRENT_TIMESTAMP)
       RETURNING id`,
      article.id,
      VECTOR,
      `digest-test-${suffix}`
    );
    for (const [categoryId, score] of Object.entries(options.scores)) {
      await prisma.articleInterestScore.create({
        data: { articleId: article.id, categoryId, embeddingId, score },
      });
    }
    articles[name] = article.id;
    return article.id;
  };

  beforeAll(async () => {
    prisma = new RealPrismaClient({
      adapter: new PrismaPg({ connectionString: DB_URL! }),
    });
    await prisma.$connect();
    const source = await prisma.source.create({
      data: {
        name: `digest ${suffix}`,
        url: `https://example.com/digest-${suffix}`,
        type: 'RSS',
        enabled: true,
      },
    });
    sourceId = source.id;
    const user = await prisma.user.create({
      data: { email: `digest-${suffix}@example.com` },
    });
    userId = user.id;
    for (const name of ['A', 'B']) {
      const category = await prisma.interestCategory.create({
        data: { slug: `digest-${name}-${suffix}`, name: `Digest ${name}` },
      });
      categoryIds.push(category.id);
      await prisma.userCategoryPreference.create({
        data: { userId, categoryId: category.id },
      });
    }
    [categoryA, categoryB] = categoryIds;

    // B の点数の方が高い記事は、B を理由に出す
    await createScoredArticle('both', {
      hoursAgo: 2,
      scores: { [categoryA]: 0.5, [categoryB]: 0.7 },
    });
    await createScoredArticle('onlyA', {
      hoursAgo: 3,
      scores: { [categoryA]: 0.4 },
    });
    await createScoredArticle('offTopic', {
      hoursAgo: 1,
      scores: { [categoryA]: 0.9 },
      isOffTopic: true,
    });
    await createScoredArticle('notComputed', {
      hoursAgo: 1,
      scores: { [categoryA]: 0.85 },
      summaryComputed: false,
    });
    const readId = await createScoredArticle('read', {
      hoursAgo: 1,
      scores: { [categoryA]: 0.95 },
    });
    await prisma.articleView.create({
      data: {
        userId,
        articleId: readId,
        isRead: true,
        readAt: new Date(),
        viewedAt: new Date(),
      },
    });
    await createScoredArticle('threeDaysAgo', {
      hoursAgo: 72,
      scores: { [categoryA]: 0.99 },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    if (sourceId) {
      // 埋め込み・点数・閲覧は記事の削除で消える（onDelete: Cascade）
      await prisma.article.deleteMany({ where: { sourceId } });
      await prisma.source.delete({ where: { id: sourceId } });
    }
    // 分野の設定は分野・ユーザーの削除で消える
    await prisma.interestCategory.deleteMany({
      where: { id: { in: categoryIds } },
    });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const personalized = async (period: 'daily' | 'weekly') => {
    const digest = await new DigestService(prisma, noCache).getDigest(
      userId!,
      period
    );
    const section = digest.sections.find((s) => s.type === 'personalized')!;
    return section.articles.map((a) => ({
      id: a.articleId,
      reason: a.recommendationReason,
    }));
  };

  it('日次は直近 24 時間の未読の記事を点数の高い順に返し、点数の高い分野を理由に出す', async () => {
    expect(await personalized('daily')).toEqual([
      { id: articles.both, reason: 'あなたの興味: Digest B' },
      { id: articles.onlyA, reason: 'あなたの興味: Digest A' },
    ]);
  });

  it('週次は直近 7 日の記事を返す', async () => {
    expect((await personalized('weekly')).map((a) => a.id)).toEqual([
      articles.threeDaysAgo,
      articles.both,
      articles.onlyA,
    ]);
  });
});
