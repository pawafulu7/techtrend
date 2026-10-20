/**
 * /stats の集計（lib/services/dashboard-stats.ts）が、DB のセッションのタイムゾーンに左右されないことの
 * 結合テスト（issue #807）。
 *
 * 以前は日別のまとめを `TO_CHAR(publishedAt, …)`（セッションのタイムゾーン）で作り、期間に上限が無かった。
 * 7 日・30 日の件数は Prisma の count に Date を渡していて、pg アダプターがオフセット無しで送るため、
 * セッションが UTC でないと期間が時差の分ずれた。ここではセッションを America/Los_Angeles にして、次を確かめる。
 *
 * - 7 日・30 日の件数は [N 日前, 集計の時刻)。下端の少し後の記事を数え、少し前と未来の記事は数えない
 * - 日別のまとめは日本時間の暦日（JST の朝 8 時の記事は、UTC・LA では前日でも JST の日付に入る）で、期間も同じ
 * - 非表示の記事も、このページのほかの件数と同じく数える
 *
 * 総数・7 日・30 日の件数はテスト DB の全記事を数えるので、テストの記事を足す前後の差で確かめる。
 * テスト DB に記事を書くほかのテストと並べず、このファイルだけを流す。記事の数は時刻の種類ごとに変え、
 * 誤りどうしが打ち消し合わないようにする（以前の実装では、下端の少し後の記事が落ちた分を未来の記事が埋め、
 * どれも 1 件ずつだと差が合ってしまった）。
 *
 * 実行方法（Docker。techtrend_test に migrate と seed を済ませてから流す）:
 *   docker compose -f docker-compose.test.yml run --rm -e TEST_FILE node-ci sh -c \
 *     'npx prisma migrate deploy && npx tsx prisma/seed-test.ts && npx jest -c jest.config.integration.js "$TEST_FILE"'
 *   （TEST_FILE=__tests__/integration/lib/dashboard-stats-timezone.test.ts）
 */

const SESSION_TIME_ZONE = 'America/Los_Angeles';

// アプリの prisma を、セッションのタイムゾーンを UTC 以外にした接続に差し替える
jest.mock('@/lib/prisma', () => {
  const { createPrismaClient } = jest.requireActual(
    '@/lib/prisma/create-client'
  );
  // 接続先は下のデータを書く接続と同じ DATABASE_URL。テスト用の DB でなければ止める
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for this integration test');
  }
  const url = new URL(process.env.DATABASE_URL);
  if (url.pathname !== '/techtrend_test') {
    throw new Error('This integration test must run against techtrend_test');
  }
  url.searchParams.set('options', '-c TimeZone=America/Los_Angeles');
  return {
    prisma: createPrismaClient({ connectionString: url.toString() }),
  };
});
// Redis のキャッシュは通さない
jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    getOrSetWithLockWithMeta: async (
      _key: string,
      fetcher: () => Promise<unknown>
    ) => ({ value: await fetcher(), cacheHit: false }),
  })),
}));

import { prisma as laSessionPrisma } from '@/lib/prisma';
import { createPrismaClient } from '@/lib/prisma/create-client';
import { getDashboardStats } from '@/lib/services/dashboard-stats';

// テストのデータは UTC のセッションで作る。Prisma の pg アダプターは日時をオフセット無しで送るので、
// LA のセッションで書くと保存される時刻が時差の分ずれる（読む側の集計だけを LA のセッションにする）。
// テストのデータを作って消すので、テスト用の DB でなければ止める
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for this integration test');
}
if (new URL(process.env.DATABASE_URL).pathname !== '/techtrend_test') {
  throw new Error('This integration test must run against techtrend_test');
}
const prisma = createPrismaClient({
  connectionString: process.env.DATABASE_URL,
});

const PREFIX = '__test_stats_tz_';
const SOURCE_NAME = `${PREFIX}source`;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>['value'];

/** 日本時間の暦日（実装とは別の計算で出す） */
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
let articleSeq = 0;

async function createArticles(
  publishedAt: Date,
  count: number,
  isHidden = false
) {
  for (let i = 0; i < count; i++) {
    articleSeq += 1;
    await prisma.article.create({
      data: {
        id: `${PREFIX}${articleSeq}`,
        title: `${PREFIX}article ${articleSeq}`,
        url: `https://stats-tz.example.com/${PREFIX}${articleSeq}`,
        sourceId,
        content: '本文',
        summary: '要約',
        summaryComputedAt: new Date(),
        publishedAt,
        isHidden,
      },
    });
  }
}

// PREFIX の _ は LIKE では任意の1文字になるので、starts_with で比べる
async function cleanup() {
  await prisma.$executeRaw`DELETE FROM "Article" WHERE starts_with(id, ${PREFIX})`;
  await prisma.$executeRaw`DELETE FROM "Source" WHERE starts_with(name, ${PREFIX})`;
}

/** テストの記事の時刻と数。時刻は集計を呼ぶ直前の時刻から作る（集計は内部で new Date() を使う） */
const COUNTS = {
  inside30: 1,
  outside30: 1,
  inside7: 2,
  outside7: 1,
  jstMorning: 1,
  hidden: 1,
  future: 4,
};
/** 30 日の期間に入るテストの記事（[時刻, 数]）。日別の期待に使う */
let inPeriod: [Date, number][];
/** テストの記事を足す前と後の集計 */
let before: DashboardStats;
let after: DashboardStats;

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
        name: SOURCE_NAME,
        type: 'RSS',
        url: 'https://stats-tz.example.com/source',
      },
    })
  ).id;

  before = (await getDashboardStats()).value;

  const now = new Date();
  // 期間の下端の 1 時間後（数える）と 1 時間前（数えない）。Date のまま渡すと LA の時差（7〜8 時間）の分、
  // 下端が後ろへずれて、1 時間後の記事が落ちる
  const inside30 = new Date(now.getTime() - 30 * DAY_MS + HOUR_MS);
  const outside30 = new Date(now.getTime() - 30 * DAY_MS - HOUR_MS);
  const inside7 = new Date(now.getTime() - 7 * DAY_MS + HOUR_MS);
  // 7 日の期間の外で、30 日の期間の中
  const outside7 = new Date(now.getTime() - 7 * DAY_MS - HOUR_MS);
  // 3 日前の日本時間の朝 8 時（UTC と LA では前日）
  const jstMorning = jstAt(jstDate(new Date(now.getTime() - 3 * DAY_MS)), 8);
  // 集計の時刻より後（未来の日時の記事）
  const future = new Date(now.getTime() + HOUR_MS);
  const hiddenAt = new Date(now.getTime() - 2 * DAY_MS);

  await createArticles(inside30, COUNTS.inside30);
  await createArticles(outside30, COUNTS.outside30);
  await createArticles(inside7, COUNTS.inside7);
  await createArticles(outside7, COUNTS.outside7);
  await createArticles(jstMorning, COUNTS.jstMorning);
  await createArticles(future, COUNTS.future);
  await createArticles(hiddenAt, COUNTS.hidden, true);
  inPeriod = [
    [inside30, COUNTS.inside30],
    [inside7, COUNTS.inside7],
    [outside7, COUNTS.outside7],
    [jstMorning, COUNTS.jstMorning],
    [hiddenAt, COUNTS.hidden],
  ];

  after = (await getDashboardStats()).value;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
  await laSessionPrisma.$disconnect();
});

describe('/stats の集計（セッションのタイムゾーンが UTC 以外）', () => {
  it('7 日・30 日の件数は [N 日前, 集計の時刻)。非表示の記事も数える', () => {
    expect({
      total: after.overview.total - before.overview.total,
      last7Days: after.overview.last7Days - before.overview.last7Days,
      last30Days: after.overview.last30Days - before.overview.last30Days,
    }).toEqual({
      // 総数は期間を問わない（下端より前・未来・非表示を含む）
      total: Object.values(COUNTS).reduce((sum, n) => sum + n, 0),
      // 7 日の下端の少し後・JST の朝・非表示
      last7Days: COUNTS.inside7 + COUNTS.jstMorning + COUNTS.hidden,
      // 上に、30 日の下端の少し後と 7 日の下端の少し前を足す
      last30Days:
        COUNTS.inside7 +
        COUNTS.jstMorning +
        COUNTS.hidden +
        COUNTS.inside30 +
        COUNTS.outside7,
    });
  });

  it('日別は日本時間の暦日でまとめ、期間は 30 日の件数と同じ', () => {
    const counts: Record<string, number> = {};
    for (const day of after.daily) {
      const count = day.sources[SOURCE_NAME];
      if (count) counts[day.date] = count;
    }

    const expected: Record<string, number> = {};
    for (const [at, count] of inPeriod) {
      expected[jstDate(at)] = (expected[jstDate(at)] ?? 0) + count;
    }
    expect(counts).toEqual(expected);

    // 日別の合計は、同じ期間・同じ条件の 30 日の件数と一致する
    expect(after.daily.reduce((sum, day) => sum + day.total, 0)).toBe(
      after.overview.last30Days
    );
  });
});
