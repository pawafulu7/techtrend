import type { PrismaClient } from '@/lib/prisma-exports';
import { findNewTags } from '@/lib/database/new-tags';
import { articleAggregationWhere } from '@/lib/database/article-aggregation-filter';
import {
  findTagIdGroupsByNames,
  findTagIdsByNames,
} from '@/lib/services/tag-service';
import { findTopTags } from '@/lib/database/tag-article-counts';

const { PrismaClient: RealPrismaClient } = jest.requireActual(
  '@/lib/prisma-exports'
);
const { PrismaPg } = jest.requireActual('@prisma/adapter-pg');
const dbUrl = process.env.DATABASE_URL;
const describeDb =
  dbUrl && /_test$/.test(new URL(dbUrl).pathname) ? describe : describe.skip;

describeDb('新着タグの公開集計と別名検索（実 DB）', () => {
  let db: PrismaClient;
  const prefix = `milestone1-${Date.now()}-`;
  const from = new Date('2041-01-02T00:00:00Z');
  const to = new Date('2041-01-03T00:00:00Z');
  const old = new Date('2041-01-01T00:00:00Z');
  let sourceId: string;
  let disabledId: string;

  beforeAll(async () => {
    db = new RealPrismaClient({
      adapter: new PrismaPg({ connectionString: dbUrl }),
    });
    sourceId = (
      await db.source.create({
        data: {
          name: `${prefix}enabled`,
          type: 'RSS',
          url: 'https://example.com/enabled',
        },
      })
    ).id;
    disabledId = (
      await db.source.create({
        data: {
          name: `${prefix}disabled`,
          type: 'RSS',
          url: 'https://example.com/disabled',
          enabled: false,
        },
      })
    ).id;
    const add = (
      label: string,
      tag: string,
      publishedAt: Date,
      isHidden = false,
      source = sourceId
    ) =>
      db.article.create({
        data: {
          title: label,
          url: `https://example.com/${prefix}${label}`,
          sourceId: source,
          publishedAt,
          isHidden,
          tags: {
            connectOrCreate: {
              where: { name: `${prefix}${tag}` },
              create: { name: `${prefix}${tag}` },
            },
          },
        },
      });
    await add('fresh', 'fresh', from);
    await add('old-visible', 'existing', old);
    await add('recent-visible', 'existing', from);
    await add('old-hidden', 'hidden-history', old, true);
    await add('recent-after-hidden', 'hidden-history', from);
    await add('old-disabled', 'disabled-history', old, false, disabledId);
    await add('recent-after-disabled', 'disabled-history', from);
    await add('hidden-only', 'hidden-only', from, true);
    await add('disabled-only', 'disabled-only', from, false, disabledId);
    await add('at-end', 'future', to);
  });

  afterAll(async () => {
    if (!db) return;
    await db.article.deleteMany({
      where: { sourceId: { in: [sourceId, disabledId].filter(Boolean) } },
    });
    await db.tag.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.source.deleteMany({
      where: { id: { in: [sourceId, disabledId].filter(Boolean) } },
    });
    await db.$disconnect();
  });

  it('初出は可視の記事のみで判定し、過去の非表示・無効記事は無視する。期間は [from,to)', async () => {
    const rows = (await findNewTags(db, { from, to })).filter((tag) =>
      tag.name.startsWith(prefix)
    );
    expect(rows.map((tag) => tag.name).sort()).toEqual(
      ['fresh', 'hidden-history', 'disabled-history']
        .map((tag) => `${prefix}${tag}`)
        .sort()
    );
    expect(rows.every((tag) => tag.count === 1)).toBe(true);
    const articles = await db.article.findMany({
      where: { AND: [articleAggregationWhere({ from, to }), { sourceId }] },
    });
    expect(articles).toHaveLength(4);
  });

  it('同数の順序は ID で安定し、limit は同じ集計結果の先頭を返す', async () => {
    const rows = await findNewTags(db, { from, to });
    expect(await findNewTags(db, { from, to, limit: 2 })).toEqual(
      rows.slice(0, 2)
    );
  });

  it('表示名・別名で探しても正式名を変えず、AND 検索のグループを混ぜない', async () => {
    // 辞書の正式名は既存データにも存在するため、作成・関連付けはロールバックする。
    await expect(
      db.$transaction(async (tx) => {
        const tag = await tx.tag.upsert({
          where: { name: 'Cybersecurity' },
          create: { name: 'Cybersecurity' },
          update: {},
        });
        await tx.article.create({
          data: {
            title: 'alias',
            url: `https://example.com/${prefix}alias`,
            sourceId,
            publishedAt: from,
            tags: { connect: { id: tag.id } },
          },
        });
        expect(await findTagIdsByNames(['サイバーセキュリティ'], tx)).toContain(
          tag.id
        );
        const groups = await findTagIdGroupsByNames(
          ['サイバーセキュリティ', `${prefix}fresh`, `${prefix}missing`],
          tx
        );
        expect(groups[0]).toContain(tag.id);
        expect(groups[1]).toHaveLength(1);
        expect(groups[1]).not.toContain(tag.id);
        expect(groups[2]).toEqual([]);
        const top = await findTopTags(tx, {
          limit: 100,
          nameContains: 'サイバー',
          canonicalNames: ['Cybersecurity'],
        });
        expect(top.map((t) => t.id)).toContain(tag.id);
        expect(
          (await tx.tag.findUniqueOrThrow({ where: { id: tag.id } })).name
        ).toBe('Cybersecurity');
        throw new Error('rollback alias fixture');
      })
    ).rejects.toThrow('rollback alias fixture');
  });

  it('重複索引が消え、通常名と lower(name) の UNIQUE を保持する', async () => {
    const indexes = await db.$queryRaw<
      { indexname: string }[]
    >`SELECT indexname FROM pg_indexes WHERE tablename IN ('Article', 'Tag')`;
    const names = indexes.map((i) => i.indexname);
    for (const name of [
      'Article_publishedAt_idx',
      'Article_createdAt_idx',
      'Article_qualityScore_idx',
      'Article_sourceId_idx',
      'Article_sourceId_publishedAt_idx',
      'Tag_name_idx',
      'idx_tag_name',
    ])
      expect(names).not.toContain(name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Tag_name_key',
        'Tag_name_lower_key',
        'idx_article_published_at',
        'idx_article_source_published',
      ])
    );
  });
});
