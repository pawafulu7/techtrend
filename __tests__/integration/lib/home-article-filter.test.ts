/**
 * ホームに出る記事の条件（lib/database/home-article-filter.ts）と、タグ別・24 時間ごとの区間の集計
 * （lib/database/tag-day-buckets.ts）の結合テスト。
 *
 * - 帯の件数と、帯を押した先のホームの一覧の件数をそろえるため、生 SQL の条件が一覧 API の
 *   Prisma の where（buildWhereClause にホームが渡す条件を足したもの）と同じ記事を数えることを確かめる
 * - 区間の境界（ちょうど 24 時間前・7 日前・集計の時刻）が、期間の条件 [from, to) と同じ側に入ることを確かめる
 *
 * mock の単体テストでは SQL の意味を確かめられないので、実際の Postgres で流す。
 *
 * 実行方法（Docker。techtrend_test に migrate と seed を済ませてから流す）:
 *   docker compose -f docker-compose.test.yml run --rm -e TEST_FILE node-ci sh -c \
 *     'npx prisma migrate deploy && npx tsx prisma/seed-test.ts && npx jest -c jest.config.integration.js "$TEST_FILE"'
 *   （TEST_FILE=__tests__/integration/lib/home-article-filter.test.ts）
 */

// 一覧の件数のキャッシュ（Redis）は使わない。読み込むと Redis への接続が残るため
jest.mock('@/app/api/articles/list/cache-config', () => ({ countCache: {} }));

import { Prisma } from '@/lib/prisma-exports';
import { createPrismaClient } from '@/lib/prisma/create-client';
import { homeArticleSql } from '@/lib/database/home-article-filter';
import { countTagsByDayBucket } from '@/lib/database/tag-day-buckets';
import {
  buildWhereClause,
  type WhereClauseParams,
} from '@/app/api/articles/list/query-helpers';
import { ARXIV_SOURCE_ID } from '@/lib/constants/source-categories';
import { PAPER_SOURCE_IDS_PARAM } from '@/lib/utils/source/paper-source';

const PREFIX = '__test_home_filter_';
const DAY_MS = 24 * 60 * 60 * 1000;

const prisma = createPrismaClient({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres_dev_password@localhost:5434/techtrend_test',
});

/** 絞り込みの無いホームが一覧 API（/api/articles/list）に渡す条件 */
const HOME_LIST_PARAMS: WhereClauseParams = {
  tag: null,
  tags: null,
  tagMode: 'OR',
  dateRange: null,
  dateFrom: null,
  dateTo: null,
  readFilter: null,
  category: null,
  excludeUnprocessed: true,
  excludeLowQuality: false,
  includeOffTopic: false,
  finalSortBy: 'publishedAt',
  tagIdGroups: [],
  sources: null,
  sourceId: null,
  excludeSources: PAPER_SOURCE_IDS_PARAM,
  search: null,
  userId: undefined,
};

let enabledSourceId: string;
let disabledSourceId: string;
let slideSourceId: string | null = null;
let articleSeq = 0;

async function createArticle(
  data: Partial<Prisma.ArticleUncheckedCreateInput> & {
    publishedAt: Date;
  }
): Promise<string> {
  articleSeq += 1;
  const id = `${PREFIX}${articleSeq}`;
  await prisma.article.create({
    data: {
      id,
      title: `${PREFIX}article ${articleSeq}`,
      url: `https://home-filter.example.com/${PREFIX}${articleSeq}`,
      sourceId: enabledSourceId,
      content: '本文',
      summary: '要約',
      summaryComputedAt: new Date(),
      ...data,
    },
  });
  return id;
}

async function cleanup() {
  await prisma.$executeRaw`DELETE FROM "Article" WHERE id LIKE ${PREFIX + '%'}`;
  await prisma.$executeRaw`DELETE FROM "Tag" WHERE name LIKE ${PREFIX + '%'}`;
  await prisma.$executeRaw`DELETE FROM "Source" WHERE name LIKE ${PREFIX + '%'}`;
}

/** 生 SQL の条件で数えた、このテストの記事の件数 */
async function countBySql(period: { from: Date; to: Date }) {
  const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM "Article" a
    WHERE ${homeArticleSql(period)}
      AND a.id LIKE ${PREFIX + '%'}
  `;
  return count;
}

/** 一覧 API の Prisma の where で数えた、このテストの記事の件数 */
async function countByListApi(period: { from: Date; to: Date }) {
  return prisma.article.count({
    where: {
      AND: [
        buildWhereClause(HOME_LIST_PARAMS),
        { id: { startsWith: PREFIX } },
        { publishedAt: { gte: period.from, lt: period.to } },
      ],
    },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();
  enabledSourceId = (
    await prisma.source.create({
      data: {
        name: `${PREFIX}enabled`,
        type: 'RSS',
        url: 'https://home-filter.example.com/enabled',
      },
    })
  ).id;
  disabledSourceId = (
    await prisma.source.create({
      data: {
        name: `${PREFIX}disabled`,
        type: 'RSS',
        url: 'https://home-filter.example.com/disabled',
        enabled: false,
      },
    })
  ).id;
  // 論文のソース（seed には無い）。無ければ PREFIX の名前で作り、cleanup で消す
  if (!(await prisma.source.findUnique({ where: { id: ARXIV_SOURCE_ID } }))) {
    await prisma.source.create({
      data: {
        id: ARXIV_SOURCE_ID,
        name: `${PREFIX}arxiv`,
        type: 'RSS',
        url: 'https://home-filter.example.com/arxiv',
      },
    });
  }
  slideSourceId =
    (await prisma.source.findUnique({ where: { name: 'Speaker Deck' } }))
      ?.id ?? null;
});

afterAll(async () => {
  // 作った論文のソースも名前（PREFIX）で消える
  await cleanup();
  await prisma.$disconnect();
});

describe('ホームに出る記事の条件（生 SQL）と一覧 API の条件', () => {
  const now = new Date();
  const period = { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
  const at = new Date(now.getTime() - 60 * 60 * 1000);

  it('記事の種類ごとに、出す・出さないが一覧 API と一致する', async () => {
    const cases: Array<{
      label: string;
      shown: boolean;
      data: Partial<Prisma.ArticleUncheckedCreateInput>;
    }> = [
      { label: '普通の記事', shown: true, data: {} },
      { label: '非表示', shown: false, data: { isHidden: true } },
      {
        label: '無効なソース',
        shown: false,
        data: { sourceId: disabledSourceId },
      },
      {
        label: '論文のソース',
        shown: false,
        data: { sourceId: ARXIV_SOURCE_ID },
      },
      { label: '技術以外', shown: false, data: { isOffTopic: true } },
      {
        label: '要約なし',
        shown: false,
        data: { summary: null, summaryComputedAt: null },
      },
      { label: '本文なし', shown: false, data: { content: null } },
      { label: '本文が空', shown: false, data: { content: '' } },
      { label: '本文が空白', shown: false, data: { content: '\n\n' } },
      {
        label: '要約の無いスライド（URL で判定・画像あり）',
        shown: true,
        data: {
          url: `https://speakerdeck.com/${PREFIX}slide-with-image`,
          summary: null,
          summaryComputedAt: null,
          thumbnail: 'https://files.speakerdeck.com/thumb.jpg',
        },
      },
      {
        label: '要約の無いスライド（URL で判定・画像なし）',
        shown: false,
        data: {
          url: `https://www.docswell.com/${PREFIX}slide-without-image`,
          summary: null,
          summaryComputedAt: null,
          thumbnail: null,
        },
      },
      {
        label: '要約の無いスライド（画像が http(s) でない）',
        shown: false,
        data: {
          url: `https://speakerdeck.com/${PREFIX}slide-data-uri`,
          summary: null,
          summaryComputedAt: null,
          thumbnail: 'data:image/png;base64,AAAA',
        },
      },
      ...(slideSourceId
        ? [
            {
              label: '要約の無いスライド（ソース名で判定・画像あり）',
              shown: true,
              data: {
                sourceId: slideSourceId,
                summary: null,
                summaryComputedAt: null,
                thumbnail: 'http://example.com/slide.png',
              },
            },
          ]
        : []),
      {
        label: '期間の外（7 日より前）',
        shown: false,
        data: { publishedAt: new Date(period.from.getTime() - 1) },
      },
    ];

    for (const c of cases) {
      await createArticle({ publishedAt: at, ...c.data });
    }

    const expected = cases.filter((c) => c.shown).length;
    expect(await countBySql(period)).toBe(expected);
    expect(await countByListApi(period)).toBe(expected);
  });

  it('記事ごとに見ても、生 SQL と一覧 API の結果が同じ記事になる', async () => {
    const bySql = await prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id FROM "Article" a
      WHERE ${homeArticleSql(period)} AND a.id LIKE ${PREFIX + '%'}
      ORDER BY a.id
    `;
    const byApi = await prisma.article.findMany({
      where: {
        AND: [
          buildWhereClause(HOME_LIST_PARAMS),
          { id: { startsWith: PREFIX } },
          { publishedAt: { gte: period.from, lt: period.to } },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(bySql.map((row) => row.id)).toEqual(byApi.map((row) => row.id));
    expect(bySql.length).toBeGreaterThan(0);
  });
});

describe('タグ別・24 時間ごとの区間の集計（countTagsByDayBucket）', () => {
  // 秒の端数を持たない時刻にして、境界の記事の時刻をちょうどにする
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  let tagId: string;

  beforeAll(async () => {
    tagId = (await prisma.tag.create({ data: { name: `${PREFIX}tag` } })).id;

    const publishedAts: Array<[label: string, ms: number]> = [
      ['集計の時刻ちょうど（期間の外）', 0],
      ['1 ミリ秒前', 1],
      ['24 時間前の 1 ミリ秒後', DAY_MS - 1],
      ['ちょうど 24 時間前', DAY_MS],
      ['24 時間前の 1 ミリ秒前', DAY_MS + 1],
      ['3 日と少し前', 3 * DAY_MS + 5000],
      ['ちょうど 7 日前', 7 * DAY_MS],
      ['7 日前の 1 ミリ秒前（期間の外）', 7 * DAY_MS + 1],
    ];
    for (const [, ms] of publishedAts) {
      const articleId = await createArticle({
        publishedAt: new Date(now.getTime() - ms),
      });
      await prisma.$executeRaw`INSERT INTO "_ArticleToTag" ("A", "B") VALUES (${articleId}, ${tagId})`;
    }
    // ホームに出ない記事（技術以外）は数えない
    const offTopicId = await createArticle({
      publishedAt: new Date(now.getTime() - 1000),
      isOffTopic: true,
    });
    await prisma.$executeRaw`INSERT INTO "_ArticleToTag" ("A", "B") VALUES (${offTopicId}, ${tagId})`;
  });

  it('区間 k は [now − (k+1)×24h, now − k×24h)。ちょうど 24 時間前は区間 0、ちょうど 7 日前は区間 6', async () => {
    const rows = (await countTagsByDayBucket(prisma, { now })).filter(
      (row) => row.id === tagId
    );
    const byBucket = Object.fromEntries(
      rows.map((row) => [row.bucket, row.count])
    );
    // 区間 0: 1 ミリ秒前・24 時間前の 1 ミリ秒後・ちょうど 24 時間前
    // 区間 1: 24 時間前の 1 ミリ秒前
    // 区間 3: 3 日と少し前
    // 区間 6: ちょうど 7 日前
    expect(byBucket).toEqual({ 0: 3, 1: 1, 3: 1, 6: 1 });
    expect(rows.every((row) => row.name === `${PREFIX}tag`)).toBe(true);
    expect(rows.every((row) => typeof row.count === 'number')).toBe(true);
  });

  it('区間 0 の件数は、期間の条件 [now − 24h, now) で数えた件数と同じ', async () => {
    const rows = (await countTagsByDayBucket(prisma, { now })).filter(
      (row) => row.id === tagId
    );
    const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM "Article" a
      JOIN "_ArticleToTag" at ON at."A" = a.id
      WHERE ${homeArticleSql({ from: new Date(now.getTime() - DAY_MS), to: now })}
        AND at."B" = ${tagId}
    `;
    expect(rows.find((row) => row.bucket === 0)?.count).toBe(count);
  });
});
