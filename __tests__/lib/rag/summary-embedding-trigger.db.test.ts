/**
 * 一覧要約を空・NULL にしたときに要約の埋め込みを消すトリガーと、要約の無い記事に要約の埋め込みを
 * 書かせないトリガー（マイグレーション 20261022140000_delete_summary_embedding_on_summary_clear）を、
 * マイグレーションを適用したテスト DB で確かめる（issue #819）
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

describeIf('要約の埋め込みのトリガー（テスト DB）', () => {
  let prisma: PrismaClient;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const model = `summary-trigger-test-${suffix}`;
  let sourceId: string | undefined;
  let articleId: string;

  /** ワーカー（article-embedding-pipeline.ts）と同じ書き方で埋め込みを書き、書いた行数を返す */
  const writeEmbedding = (client: PrismaClient, key: 'title' | 'summary') =>
    client.$executeRawUnsafe(
      `INSERT INTO "ArticleEmbedding" (id, "articleId", "embeddingKey", embedding, model, version, "computedAt")
       VALUES (gen_random_uuid()::text, $1, $2::"EmbeddingKey", $3::vector, $4, 1, CURRENT_TIMESTAMP)
       ON CONFLICT ("articleId", "embeddingKey", model, version)
       DO UPDATE SET embedding = EXCLUDED.embedding, "computedAt" = CURRENT_TIMESTAMP`,
      articleId,
      key,
      VECTOR,
      model
    );

  const embeddingKeys = async () => {
    const rows = await prisma.$queryRaw<{ embeddingKey: string }[]>`
      SELECT "embeddingKey"::text AS "embeddingKey" FROM "ArticleEmbedding"
      WHERE "articleId" = ${articleId} AND model = ${model}
      ORDER BY "embeddingKey"
    `;
    return rows.map((row) => row.embeddingKey);
  };

  beforeAll(async () => {
    prisma = new RealPrismaClient({
      adapter: new PrismaPg({ connectionString: DB_URL! }),
    });
    await prisma.$connect();
    const source = await prisma.source.create({
      data: {
        name: `summary trigger ${suffix}`,
        url: `https://example.com/summary-trigger-${suffix}`,
        type: 'RSS',
        enabled: true,
      },
    });
    sourceId = source.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (sourceId) {
      // 埋め込みは記事の削除で消える（onDelete: Cascade）
      await prisma.article.deleteMany({ where: { sourceId } });
      await prisma.source.delete({ where: { id: sourceId } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const article = await prisma.article.create({
      data: {
        title: 'trigger title',
        summary: '元の要約',
        detailedSummary: '・元の詳細要約',
        url: `https://example.com/summary-trigger-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
        sourceId: sourceId!,
        publishedAt: new Date('2026-10-01T00:00:00Z'),
      },
    });
    articleId = article.id;
    await writeEmbedding(prisma, 'title');
    await writeEmbedding(prisma, 'summary');
  });

  it('要約を別の文に書き換えても、詳細要約だけを消しても、埋め込みは消さない（作り直しはジョブが行う）', async () => {
    await prisma.article.update({
      where: { id: articleId },
      data: { summary: '新しい要約' },
    });
    await prisma.article.update({
      where: { id: articleId },
      data: { detailedSummary: null },
    });

    expect(await embeddingKeys()).toEqual(['summary', 'title']);
  });

  it.each([
    ['空文字', ''],
    ['NULL', null],
  ])(
    '要約を%sにしたら、要約の埋め込みだけを消し、タイトルの埋め込みは残す',
    async (_label, summary) => {
      await prisma.article.update({
        where: { id: articleId },
        data: { summary },
      });

      expect(await embeddingKeys()).toEqual(['title']);
    }
  );

  it('要約が空の記事には、要約の埋め込みを書かない（タイトルは書く）', async () => {
    await prisma.article.update({
      where: { id: articleId },
      data: { summary: null },
    });

    expect(await writeEmbedding(prisma, 'summary')).toBe(0);
    expect(await writeEmbedding(prisma, 'title')).toBe(1);
    expect(await embeddingKeys()).toEqual(['title']);

    // 要約を書き直せば、また書ける
    await prisma.article.update({
      where: { id: articleId },
      data: { summary: '書き直した要約' },
    });
    expect(await writeEmbedding(prisma, 'summary')).toBe(1);
    expect(await embeddingKeys()).toEqual(['summary', 'title']);
  });

  /** 埋め込みを書く文がロックを待っている接続の数。最大 3 秒、1 以上になるのを待つ */
  const waitForLockedEmbeddingWrite = async (): Promise<number> => {
    for (let i = 0; i < 30; i++) {
      const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE 'INSERT INTO "ArticleEmbedding"%'
      `;
      if (count > 0) return count;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return 0;
  };

  it('要約を消す更新の途中に書こうとした埋め込みは、更新の確定を待ってから書かずに終わる', async () => {
    let written: Promise<number> | undefined;

    await prisma.$transaction(
      async (tx) => {
        await tx.article.update({
          where: { id: articleId },
          data: { summary: null },
        });
        // 消す前の要約で作った埋め込みを、別の接続（ワーカー）が書こうとする。
        // PrismaPromise は then を呼ぶまで DB に送らないので、ここで送る
        written = writeEmbedding(prisma, 'summary').then((count) => count);
        // 記事の行のロック（FOR SHARE）を待っている
        expect(await waitForLockedEmbeddingWrite()).toBeGreaterThanOrEqual(1);
      },
      { timeout: 10_000 }
    );

    expect(await written).toBe(0);
    expect(await embeddingKeys()).toEqual(['title']);
  });
});
