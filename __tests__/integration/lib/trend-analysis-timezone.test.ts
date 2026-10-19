/**
 * トレンド概要の分析の集計（lib/services/trend-analysis.ts）が、DB のセッションのタイムゾーンに
 * 左右されないことの結合テスト。
 *
 * 以前は期間の ISO 文字列を `::timestamp`（タイムゾーンなし）で読み、日別のまとめを
 * `TO_CHAR(publishedAt, …)`（セッションのタイムゾーン）で、0 で埋める日付を UTC で作っていた。
 * セッションが UTC でないと、期間が時差の分ずれ、まとめと 0 埋めの日付も食い違う。
 * ここではセッションを America/Los_Angeles にして、次を確かめる。
 *
 * - 期間の下端（ちょうど 7 日前の少し後）の記事を数え、少し前の記事は数えない
 * - 集計の時刻より後（未来）の記事は数えない
 * - 日別のまとめは日本時間の暦日（JST の朝 8 時の記事は、UTC・LA では前日でも JST の日付に入る）
 * - 0 で埋める日付の並びが、日本時間の暦日で期間の両端を含む
 *
 * 実行方法（Docker。techtrend_test に migrate と seed を済ませてから流す）:
 *   docker compose -f docker-compose.test.yml run --rm -e TEST_FILE node-ci sh -c \
 *     'npx prisma migrate deploy && npx tsx prisma/seed-test.ts && npx jest -c jest.config.integration.js "$TEST_FILE"'
 *   （TEST_FILE=__tests__/integration/lib/trend-analysis-timezone.test.ts）
 */

const SESSION_TIME_ZONE = 'America/Los_Angeles';

// アプリの prisma を、セッションのタイムゾーンを UTC 以外にした接続に差し替える
jest.mock('@/lib/prisma', () => {
  const { createPrismaClient } = jest.requireActual(
    '@/lib/prisma/create-client'
  );
  const url = new URL(
    process.env.DATABASE_URL ||
      'postgresql://postgres:postgres_dev_password@localhost:5434/techtrend_test'
  );
  url.searchParams.set('options', '-c TimeZone=America/Los_Angeles');
  return {
    prisma: createPrismaClient({ connectionString: url.toString() }),
  };
});
// Redis のキャッシュは通さない
jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: {
    getOrSetWithLock: (_key: string, fn: () => Promise<unknown>) => fn(),
    generateTrendsKey: () => 'trends:test',
  },
}));

import { prisma as laSessionPrisma } from '@/lib/prisma';
import { createPrismaClient } from '@/lib/prisma/create-client';
import {
  getTrendAnalysis,
  type TrendAnalysis,
} from '@/lib/services/trend-analysis';

// テストのデータは UTC のセッションで作る。Prisma の pg アダプターは日時をオフセット無しで送るので、
// LA のセッションで書くと保存される時刻が時差の分ずれる（読む側の集計だけを LA のセッションにする）
const prisma = createPrismaClient({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres_dev_password@localhost:5434/techtrend_test',
});

const PREFIX = '__test_trend_tz_';
const TAG_NAME = `${PREFIX}tag`;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** 上位 10 タグに入るよう、このテストのタグに付ける記事の数（seed の直近 7 日の記事より多くする） */
const BOOST_COUNT = 40;

/** 日本時間の暦日（実装の Intl とは別の計算で出す） */
function jstDate(date: Date): string {
  return new Date(date.getTime() + 9 * HOUR_MS).toISOString().slice(0, 10);
}

/** 日本時間の date（YYYY-MM-DD）の hour 時 */
function jstAt(date: string, hour: number): Date {
  return new Date(
    Date.parse(`${date}T00:00:00.000Z`) - 9 * HOUR_MS + hour * HOUR_MS
  );
}

let sourceId: string;
let tagId: string;
let articleSeq = 0;

async function createTaggedArticle(publishedAt: Date) {
  articleSeq += 1;
  await prisma.article.create({
    data: {
      id: `${PREFIX}${articleSeq}`,
      title: `${PREFIX}article ${articleSeq}`,
      url: `https://trend-tz.example.com/${PREFIX}${articleSeq}`,
      sourceId,
      content: '本文',
      summary: '要約',
      summaryComputedAt: new Date(),
      publishedAt,
      tags: { connect: [{ id: tagId }] },
    },
  });
}

// PREFIX の _ は LIKE では任意の1文字になるので、starts_with で比べる
async function cleanup() {
  await prisma.$executeRaw`DELETE FROM "Article" WHERE starts_with(id, ${PREFIX})`;
  await prisma.$executeRaw`DELETE FROM "Tag" WHERE starts_with(name, ${PREFIX})`;
  await prisma.$executeRaw`DELETE FROM "Source" WHERE starts_with(name, ${PREFIX})`;
}

/** テストの記事の時刻。集計を呼ぶ直前の時刻から作る（集計は内部で new Date() を使う） */
let now: Date;
let insideStart: Date;
let jstMorning: Date;
let boostedAt: Date;

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();

  // 集計に使う接続のセッションのタイムゾーンが本当に UTC 以外になっている
  // （なっていなければこのテストは何も確かめない）
  const [{ TimeZone }] = await laSessionPrisma.$queryRaw<
    { TimeZone: string }[]
  >`SHOW TimeZone`;
  expect(TimeZone).toBe(SESSION_TIME_ZONE);
  // データを書く接続は UTC（違うと、保存される時刻がずれて件数の期待が外れる）
  const [{ TimeZone: writerTimeZone }] = await prisma.$queryRaw<
    { TimeZone: string }[]
  >`SHOW TimeZone`;
  expect(['UTC', 'Etc/UTC']).toContain(writerTimeZone);

  sourceId = (
    await prisma.source.create({
      data: {
        name: `${PREFIX}source`,
        type: 'RSS',
        url: 'https://trend-tz.example.com/source',
      },
    })
  ).id;
  tagId = (await prisma.tag.create({ data: { name: TAG_NAME } })).id;

  now = new Date();
  // 期間の下端（7 日前）の 1 時間後。::timestamp だと LA の時差（7〜8 時間）の分、下端が後ろへずれて落ちる
  insideStart = new Date(now.getTime() - 7 * DAY_MS + HOUR_MS);
  // 期間の下端の 1 時間前（数えない）
  const outsideStart = new Date(now.getTime() - 7 * DAY_MS - HOUR_MS);
  // 3 日前の日本時間の朝 8 時（UTC と LA では前日）
  jstMorning = jstAt(jstDate(new Date(now.getTime() - 3 * DAY_MS)), 8);
  // 集計の時刻より後（未来の日時の記事）
  const future = new Date(now.getTime() + HOUR_MS);
  boostedAt = new Date(now.getTime() - 5 * DAY_MS);

  for (const at of [insideStart, outsideStart, jstMorning, future]) {
    await createTaggedArticle(at);
  }
  for (let i = 0; i < BOOST_COUNT; i++) {
    await createTaggedArticle(boostedAt);
  }
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
  await laSessionPrisma.$disconnect();
});

/** このテストのタグの、日付ごとの件数（0 を除く） */
function countsOfTag(analysis: TrendAnalysis): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const day of analysis.timeline) {
    const value = Number(day[TAG_NAME] ?? 0);
    if (value > 0) counts[String(day.date)] = value;
  }
  return counts;
}

describe('トレンドの分析の集計（セッションのタイムゾーンが UTC 以外）', () => {
  it('期間は [7 日前, 集計の時刻]。日別のまとめは日本時間の暦日', async () => {
    const analysis = await getTrendAnalysis(7);

    const tag = analysis.topTags.find((t) => t.name === TAG_NAME);
    expect(tag).toBeDefined();
    // 下端の少し後・JST の朝・ブースト分を数え、下端の少し前と未来は数えない
    expect(tag?.totalCount).toBe(2 + BOOST_COUNT);

    expect(countsOfTag(analysis)).toEqual({
      [jstDate(insideStart)]: 1,
      [jstDate(jstMorning)]: 1,
      [jstDate(boostedAt)]: BOOST_COUNT,
    });
  });

  it('0 で埋める日付は、日本時間の暦日で期間の両端を含む', async () => {
    const analysis = await getTrendAnalysis(7);
    const from = new Date(analysis.period.from);
    const to = new Date(analysis.period.to);

    const expected: string[] = [];
    for (
      let day = jstDate(from);
      day <= jstDate(to);
      day = new Date(Date.parse(`${day}T00:00:00.000Z`) + DAY_MS)
        .toISOString()
        .slice(0, 10)
    ) {
      expected.push(day);
    }
    expect(analysis.timeline.map((day) => day.date)).toEqual(expected);
  });

  it('タグを指定した推移も、同じ期間と日本時間の暦日でまとめる', async () => {
    const analysis = await getTrendAnalysis(7, TAG_NAME);
    expect(analysis.timeline).toEqual(
      [
        { date: jstDate(insideStart), count: 1 },
        { date: jstDate(boostedAt), count: BOOST_COUNT },
        { date: jstDate(jstMorning), count: 1 },
      ].sort((a, b) => a.date.localeCompare(b.date))
    );
  });
});
