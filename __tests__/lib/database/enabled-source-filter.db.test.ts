/**
 * 無効化したソースの記事を除く条件（issue #688）をテスト DB で確かめる。
 *
 * 各経路のテストは、渡された where・SQL にこの条件が入っていることだけを見る（Prisma はモック）。
 * 条件そのものが正しく記事を除くことは、ここで実 DB に対して確かめる。
 * 自分で作ったソースの記事だけを読むので、ほかのテストと並列に走っても干渉しない。
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { PrismaClient } from '@/lib/prisma-exports';

// jest.setup.node.js の Prisma のモックを外す（__tests__/api/workers/embedding.test.ts と同じ）
jest.mock('@/lib/prisma-exports', () =>
  jest.requireActual('@/lib/prisma-exports')
);

import { Prisma } from '@/lib/prisma-exports';
import {
  enabledSourceSql,
  enabledSourceWhere,
} from '@/lib/database/enabled-source-filter';

const { PrismaClient: RealPrismaClient } = jest.requireActual(
  '@/lib/prisma-exports'
);
const { PrismaPg } = jest.requireActual('@prisma/adapter-pg');
const DB_URL = process.env.DATABASE_URL;
const isSafeTestDb =
  !!DB_URL && /(localhost|127\.0\.0\.1|test|_test)/i.test(DB_URL);
const describeIf = isSafeTestDb ? describe : describe.skip;

describeIf('enabled-source-filter（テスト DB）', () => {
  let prisma: PrismaClient;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let enabledSourceId: string;
  let disabledSourceId: string;
  let enabledArticleId: string;
  let disabledArticleId: string;

  beforeAll(async () => {
    prisma = new RealPrismaClient({
      adapter: new PrismaPg({ connectionString: DB_URL! }),
    });
    await prisma.$connect();

    const [enabledSource, disabledSource] = await Promise.all([
      prisma.source.create({
        data: {
          name: `Enabled Source ${suffix}`,
          url: `https://example.com/enabled-${suffix}`,
          type: 'RSS',
          enabled: true,
        },
      }),
      prisma.source.create({
        data: {
          name: `Disabled Source ${suffix}`,
          url: `https://example.com/disabled-${suffix}`,
          type: 'RSS',
          enabled: false,
        },
      }),
    ]);
    enabledSourceId = enabledSource.id;
    disabledSourceId = disabledSource.id;

    const [enabledArticle, disabledArticle] = await Promise.all([
      prisma.article.create({
        data: {
          title: 'enabled source article',
          url: `https://example.com/enabled-article-${suffix}`,
          sourceId: enabledSourceId,
          publishedAt: new Date(),
        },
      }),
      prisma.article.create({
        data: {
          title: 'disabled source article',
          url: `https://example.com/disabled-article-${suffix}`,
          sourceId: disabledSourceId,
          publishedAt: new Date(),
        },
      }),
    ]);
    enabledArticleId = enabledArticle.id;
    disabledArticleId = disabledArticle.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.article.deleteMany({
      where: { sourceId: { in: [enabledSourceId, disabledSourceId] } },
    });
    await prisma.source.deleteMany({
      where: { id: { in: [enabledSourceId, disabledSourceId] } },
    });
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

  it('Prisma の where: 条件が無ければ両方とも返る（検体の対照）', async () => {
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

  it('enabledSourceWhere は呼ぶたびに新しいオブジェクトを返す', () => {
    const first = enabledSourceWhere();
    (first.source as { is: { enabled: boolean } }).is.enabled = false;

    expect(enabledSourceWhere()).toEqual({ source: { is: { enabled: true } } });
  });
});
