/**
 * 無効化したソースの記事を除く条件（issue #688）をテスト DB で確かめる。
 *
 * 各経路のテストは、渡された where・SQL にこの条件が入っていることだけを見る（Prisma はモック）。
 * 条件そのものが正しく記事を除くことは、ここで実 DB に対して確かめる。
 * 自分で作ったソースの記事だけを読むので、ほかのテストと並列に走っても干渉しない。
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { PrismaClient } from '@/lib/prisma-exports';
// jest.setup.node.js のモックは PrismaClient だけを差し替え、Prisma（sql・raw）は本物のまま
import { Prisma } from '@/lib/prisma-exports';
import {
  type ArticleSourceIdColumn,
  disabledSourceSql,
  enabledSourceSql,
  enabledSourceWhere,
} from '@/lib/database/enabled-source-filter';

// 実 DB の PrismaClient は jest.requireActual で取る（__tests__/api/workers/embedding.test.ts と同じ）
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

describe('enabled-source-filter（DB を使わない検査）', () => {
  it('enabledSourceWhere は呼ぶたびに新しいオブジェクトを返す', () => {
    const first = enabledSourceWhere();
    (first.source as { is: { enabled: boolean } }).is.enabled = false;

    expect(enabledSourceWhere()).toEqual({ source: { is: { enabled: true } } });
  });

  it('enabledSourceSql は表に無い列名を実行時にも拒否する', () => {
    expect(() =>
      enabledSourceSql('s.id; DROP TABLE x' as ArticleSourceIdColumn)
    ).toThrow('Unsupported sourceId column');
    expect(() => enabledSourceSql('toString' as ArticleSourceIdColumn)).toThrow(
      'Unsupported sourceId column'
    );
    expect(() =>
      disabledSourceSql('s.id; DROP TABLE x' as ArticleSourceIdColumn)
    ).toThrow('Unsupported sourceId column');
  });
});

describeIf('enabled-source-filter（テスト DB）', () => {
  let prisma: PrismaClient;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // beforeAll が途中で失敗しても、作れた行だけを afterAll で消すために記録する
  const createdSourceIds: string[] = [];
  let enabledSourceId: string;
  let disabledSourceId: string;
  let enabledArticleId: string;
  let disabledArticleId: string;

  const createSource = async (label: string, enabled: boolean) => {
    const source = await prisma.source.create({
      data: {
        name: `${label} Source ${suffix}`,
        url: `https://example.com/${label}-${suffix}`,
        type: 'RSS',
        enabled,
      },
    });
    createdSourceIds.push(source.id);
    return source.id;
  };

  const createArticle = async (label: string, sourceId: string) =>
    (
      await prisma.article.create({
        data: {
          title: `${label} source article`,
          url: `https://example.com/${label}-article-${suffix}`,
          sourceId,
          publishedAt: new Date(),
        },
      })
    ).id;

  beforeAll(async () => {
    prisma = new RealPrismaClient({
      adapter: new PrismaPg({ connectionString: DB_URL! }),
    });
    await prisma.$connect();

    enabledSourceId = await createSource('enabled', true);
    disabledSourceId = await createSource('disabled', false);
    enabledArticleId = await createArticle('enabled', enabledSourceId);
    disabledArticleId = await createArticle('disabled', disabledSourceId);
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
    await prisma.$disconnect();
  });

  const ownSourceIds = (): string[] => [enabledSourceId, disabledSourceId];

  it('Prisma の where: 無効なソースの記事を除く', async () => {
    const articles = await prisma.article.findMany({
      where: {
        sourceId: { in: ownSourceIds() },
        AND: [enabledSourceWhere()],
      },
      select: { id: true },
    });

    expect(articles.map((a) => a.id)).toEqual([enabledArticleId]);
  });

  it('Prisma の where: 条件が無ければ両方とも返る（対照）', async () => {
    const articles = await prisma.article.findMany({
      where: { sourceId: { in: ownSourceIds() } },
      select: { id: true },
    });

    expect(articles.map((a) => a.id).sort()).toEqual(
      [enabledArticleId, disabledArticleId].sort()
    );
  });

  it('生 SQL（別名 a）: 無効なソースの記事を除く', async () => {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT a.id FROM "Article" a
      WHERE a."sourceId" = ANY(${ownSourceIds()}::text[])
        AND ${enabledSourceSql()}
    `);

    expect(rows.map((r) => r.id)).toEqual([enabledArticleId]);
  });

  it('生 SQL（別名なし）: 無効なソースの記事を除く', async () => {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM "Article"
      WHERE "sourceId" = ANY(${ownSourceIds()}::text[])
        AND ${enabledSourceSql('"sourceId"')}
    `);

    expect(rows.map((r) => r.id)).toEqual([enabledArticleId]);
  });

  it('生 SQL（別名 a2）: 無効なソースの記事を除く', async () => {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT a2.id FROM "Article" a2
      WHERE a2."sourceId" = ANY(${ownSourceIds()}::text[])
        AND ${enabledSourceSql('a2."sourceId"')}
    `);

    expect(rows.map((r) => r.id)).toEqual([enabledArticleId]);
  });

  it('disabledSourceSql: 無効なソースの記事だけを返す（enabledSourceSql の補集合）', async () => {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT a.id FROM "Article" a
      WHERE a."sourceId" = ANY(${ownSourceIds()}::text[])
        AND ${disabledSourceSql()}
    `);

    expect(rows.map((r) => r.id)).toEqual([disabledArticleId]);
  });
});
