/**
 * 記事の kNN（lib/rag/article-knn.ts と DB 関数 related_articles_knn）をテスト DB で確かめる。
 *
 * article-knn.test.ts は関数の呼び方だけを見る（Prisma はモック）。列の対応・結合・条件・閾値が
 * 実際に正しいことは、ここでマイグレーションを適用した実 DB（部分 HNSW あり）に対して確かめる。
 * 埋め込みのモデル名を実行ごとに一意にするので、ほかのテストの埋め込みは条件で落ち、干渉しない。
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { PrismaClient } from '@/lib/prisma-exports';
import { runArticleKnn } from '@/lib/rag/article-knn';

// 実 DB の PrismaClient は jest.requireActual で取る（enabled-source-filter.db.test.ts と同じ）
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

const DIMENSIONS = 1536;

/** 基準のベクトル（第 0 成分だけ 1）とのコサイン類似度が `similarity` になるベクトル */
function vectorWithSimilarity(similarity: number): string {
  const values = new Array<number>(DIMENSIONS).fill(0);
  values[0] = similarity;
  values[1] = Math.sqrt(1 - similarity * similarity);
  return `[${values.join(',')}]`;
}

describeIf('article-knn（テスト DB）', () => {
  let prisma: PrismaClient;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const model = `knn-test-${suffix}`;
  const version = 1;
  // beforeAll が途中で失敗しても、作れた行だけを afterAll で消すために記録する
  const createdSourceIds: string[] = [];
  const createdTagIds: string[] = [];
  const ids: Record<string, string> = {};
  let enabledSourceName: string;

  const createSource = async (label: string, enabled: boolean) => {
    const source = await prisma.source.create({
      data: {
        name: `knn ${label} ${suffix}`,
        url: `https://example.com/knn-${label}-${suffix}`,
        type: 'RSS',
        enabled,
      },
    });
    createdSourceIds.push(source.id);
    return source;
  };

  const createArticle = async (
    label: string,
    options: {
      sourceId: string;
      similarity: number;
      isHidden?: boolean;
      embeddingModel?: string;
      tagIds?: string[];
    }
  ) => {
    const article = await prisma.article.create({
      data: {
        title: `knn ${label}`,
        translatedTitle: `knn ${label} 訳`,
        summary: `knn ${label} summary`,
        url: `https://example.com/knn-${label}-${suffix}`,
        thumbnail: `https://example.com/knn-${label}.png`,
        sourceId: options.sourceId,
        publishedAt: new Date('2026-10-01T00:00:00Z'),
        qualityScore: 70,
        isHidden: options.isHidden ?? false,
        ...(options.tagIds
          ? { tags: { connect: options.tagIds.map((id) => ({ id })) } }
          : {}),
      },
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ArticleEmbedding" (id, "articleId", "embeddingKey", embedding, model, version)
       VALUES ($1, $2, 'summary', $3::vector, $4, $5)`,
      `emb-${label}-${suffix}`,
      article.id,
      vectorWithSimilarity(options.similarity),
      options.embeddingModel ?? model,
      version
    );
    ids[label] = article.id;
  };

  beforeAll(async () => {
    prisma = new RealPrismaClient({
      adapter: new PrismaPg({ connectionString: DB_URL! }),
    });
    await prisma.$connect();

    const enabled = await createSource('enabled', true);
    const disabled = await createSource('disabled', false);
    enabledSourceName = enabled.name;
    const tag = await prisma.tag.create({
      data: { name: `knn-tag-${suffix}` },
    });
    createdTagIds.push(tag.id);

    await createArticle('self', { sourceId: enabled.id, similarity: 1 });
    await createArticle('near', {
      sourceId: enabled.id,
      similarity: 0.95,
      tagIds: [tag.id],
    });
    await createArticle('middle', { sourceId: enabled.id, similarity: 0.9 });
    await createArticle('far', { sourceId: enabled.id, similarity: 0.8 });
    await createArticle('belowThreshold', {
      sourceId: enabled.id,
      similarity: 0.3,
    });
    await createArticle('hidden', {
      sourceId: enabled.id,
      similarity: 0.99,
      isHidden: true,
    });
    await createArticle('disabledSource', {
      sourceId: disabled.id,
      similarity: 0.98,
    });
    await createArticle('otherModel', {
      sourceId: enabled.id,
      similarity: 0.97,
      embeddingModel: `${model}-other`,
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    if (createdSourceIds.length > 0) {
      // 埋め込みとタグの結び付きは記事の削除で消える（onDelete: Cascade と暗黙の中間表）
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

  const search = (topK: number, similarityThreshold = 0.5) =>
    runArticleKnn(prisma, {
      articleId: ids.self,
      model,
      version,
      topK,
      similarityThreshold,
    });

  it('関数に計画の固定・JIT の停止・HNSW の設定が付いている（外すと全件走査や JIT に戻る）', async () => {
    const [fn] = await prisma.$queryRaw<{ proconfig: string[] }[]>`
      SELECT proconfig FROM pg_proc WHERE proname = 'related_articles_knn'
    `;

    expect(fn?.proconfig).toEqual(
      expect.arrayContaining([
        'enable_seqscan=off',
        'enable_bitmapscan=off',
        'enable_sort=off',
        'jit=off',
        'hnsw.ef_search=100',
        'hnsw.iterative_scan=relaxed_order',
      ])
    );
  });

  it('基準の記事に埋め込みが無ければ空の配列', async () => {
    const results = await runArticleKnn(prisma, {
      articleId: `no-such-article-${suffix}`,
      model,
      version,
      topK: 20,
      similarityThreshold: 0.5,
    });

    expect(results).toEqual([]);
  });

  it('自分自身・非表示・無効なソース・別のモデル・閾値未満を除き、類似度の高い順に返す', async () => {
    const results = await search(20);

    expect(results.map((r) => r.articleId)).toEqual([
      ids.near,
      ids.middle,
      ids.far,
    ]);
  });

  it('類似度は 1 - コサイン距離', async () => {
    const results = await search(20);

    expect(results.map((r) => r.similarity)).toEqual([
      expect.closeTo(0.95, 5),
      expect.closeTo(0.9, 5),
      expect.closeTo(0.8, 5),
    ]);
  });

  it('記事・ソース・タグの列を対応どおりに返す', async () => {
    const [near] = await search(20);

    expect(near).toEqual({
      articleId: ids.near,
      title: 'knn near',
      summary: 'knn near summary',
      translatedTitle: 'knn near 訳',
      publishedAt: new Date('2026-10-01T00:00:00Z'),
      sourceId: expect.any(String),
      qualityScore: 70,
      sourceName: enabledSourceName,
      thumbnail: 'https://example.com/knn-near.png',
      embeddingKey: 'summary',
      similarity: expect.any(Number),
      tags: [{ id: createdTagIds[0], name: `knn-tag-${suffix}` }],
    });
  });

  it('タグの無い記事は空の配列', async () => {
    const results = await search(20);

    expect(results.find((r) => r.articleId === ids.middle)?.tags).toEqual([]);
  });

  it('件数は topK まで（条件に合う近い順）', async () => {
    const results = await search(2);

    expect(results.map((r) => r.articleId)).toEqual([ids.near, ids.middle]);
  });

  it('閾値を上げると、満たす記事だけを返す', async () => {
    const results = await search(20, 0.92);

    expect(results.map((r) => r.articleId)).toEqual([ids.near]);
  });
});
