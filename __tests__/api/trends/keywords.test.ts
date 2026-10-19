/**
 * /api/trends/keywords エンドポイントのテスト
 *
 * 成長率計算ロジック:
 *   effectiveAverage = Math.max(weeklyAverage, 1.0)
 *   growthRate = Math.min(Math.round(((recentCount - effectiveAverage) / effectiveAverage) * 100), 999)
 *
 * $queryRaw呼び出し順序:
 *   1回目: タグ別・24 時間ごとの区間別の件数（区間 0 = 直近 24 時間、1〜6 = 前の 6 日）
 *   2回目: newTags（新規タグ）
 *
 * 一覧に入れるのは急上昇（growthRate > 50 かつ recentCount >= 2）のタグだけ
 */

jest.mock('@/lib/cache/keywords-cache', () => ({
  keywordsCache: {
    getOrSetWithLock: jest.fn((_key: string, fn: () => Promise<unknown>) =>
      fn()
    ),
    getStats: jest.fn(() => ({ hits: 0, misses: 1, size: 0 })),
  },
}));

jest.mock('@/lib/database', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { GET } from '@/app/api/trends/keywords/route';
import { prisma } from '@/lib/database';
import {
  ENABLED_SOURCE_SQL,
  sqlFragmentsOf,
} from '../../helpers/sql-fragments';

const prismaMock = prisma as any;

/**
 * まとめる前の2本の集計（直近 24 時間・前の 6 日）の値から、区間別の集計の行を作る。
 * 前の 6 日の件数は区間 1 に置く（判定は区間 1〜6 の合計しか見ない）
 */
function bucketRows(
  tags: Array<{ id: string; name: string; recent: number; weekly?: number }>
) {
  return tags.flatMap(({ id, name, recent, weekly = 0 }) => [
    ...(recent > 0 ? [{ id, name, bucket: 0, count: recent }] : []),
    ...(weekly > 0 ? [{ id, name, bucket: 1, count: weekly }] : []),
  ]);
}

function mockQueries(rows: unknown[], newTags: unknown[] = []) {
  prismaMock.$queryRaw.mockResolvedValueOnce(rows).mockResolvedValueOnce(newTags);
}

describe('/api/trends/keywords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculates growthRate correctly when weeklyAverage >= 1 (normal case)', async () => {
    // recentCount=5, weekly_count=12 → weeklyAverage=12/6=2.0
    // effectiveAverage = max(2.0, 1.0) = 2.0
    // growthRate = min(round(((5 - 2.0) / 2.0) * 100), 999) = 150
    mockQueries(bucketRows([{ id: 'tag-1', name: 'React', recent: 5, weekly: 12 }]));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.trending).toHaveLength(1);

    const tag = data.trending[0];
    expect(tag.id).toBe('tag-1');
    expect(tag.name).toBe('React');
    expect(tag.recentCount).toBe(5);
    expect(tag.weeklyAverage).toBe(2.0);
    expect(tag.growthRate).toBe(150);
    expect(tag.isTrending).toBe(true);
  });

  it('applies effectiveAverage=1.0 when weeklyAverage < 1 (inflation prevention)', async () => {
    // recentCount=4, weekly_count=2 → weeklyAverage=round(2/6*10)/10=0.3 (API returns rounded value)
    // effectiveAverage = max(2/6, 1.0) = 1.0 (uses raw value for calculation)
    // growthRate = min(round(((4 - 1.0) / 1.0) * 100), 999) = 300
    mockQueries(bucketRows([{ id: 'tag-1', name: 'Vercel', recent: 4, weekly: 2 }]));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.trending).toHaveLength(1);

    const tag = data.trending[0];
    expect(tag.recentCount).toBe(4);
    expect(tag.weeklyAverage).toBe(0.3);
    expect(tag.growthRate).toBe(300);
    expect(tag.isTrending).toBe(true);
  });

  it('caps growthRate at 999% (cap test)', async () => {
    // recentCount=20, weekly_count=0 → weeklyAverage=0
    // effectiveAverage = max(0, 1.0) = 1.0
    // rawGrowthRate = ((20 - 1.0) / 1.0) * 100 = 1900
    // growthRate = min(round(1900), 999) = 999
    mockQueries(bucketRows([{ id: 'tag-1', name: 'GPT-5', recent: 20 }]));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.trending).toHaveLength(1);

    const tag = data.trending[0];
    expect(tag.recentCount).toBe(20);
    expect(tag.weeklyAverage).toBe(0);
    expect(tag.growthRate).toBe(999);
    expect(tag.isTrending).toBe(true);
  });

  it('uses effectiveAverage=1.0 for weeklyAverage=0 (unified handling)', async () => {
    // recentCount=4, no weekly data → weeklyAverage=0
    // effectiveAverage = max(0, 1.0) = 1.0
    // growthRate = min(round(((4 - 1.0) / 1.0) * 100), 999) = 300
    // Old behavior would have been fixed 100%, new behavior gives 300%
    mockQueries(bucketRows([{ id: 'tag-1', name: 'NewFramework', recent: 4 }]));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    const tag = data.trending[0];
    expect(tag.weeklyAverage).toBe(0);
    expect(tag.growthRate).toBe(300);
    expect(tag.isTrending).toBe(true);
    // Confirm it is NOT the old fixed 100%
    expect(tag.growthRate).not.toBe(100);
  });

  it('sorts by growthRate desc, then recentCount desc', async () => {
    // Tag A: recentCount=5, weeklyAvg=2.0 → growthRate=150, isTrending=true
    // Tag B: recentCount=10, weeklyAvg=2.0 → growthRate=400, isTrending=true (capped? no: ((10-2)/2)*100=400)
    // Tag C: recentCount=5, weeklyAvg=1.0 → growthRate=400, isTrending=true
    // Expected sort: B first (400, recentCount=10), then C (400, recentCount=5), then A (150)
    mockQueries(
      bucketRows([
        { id: 'tag-a', name: 'TagA', recent: 5, weekly: 12 }, // avg=2.0
        { id: 'tag-b', name: 'TagB', recent: 10, weekly: 12 }, // avg=2.0
        { id: 'tag-c', name: 'TagC', recent: 5, weekly: 6 }, // avg=1.0
      ])
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.trending).toHaveLength(3);

    // growthRate desc: B(400) = C(400) > A(150)
    // Same growthRate → recentCount desc: B(10) > C(5)
    expect(data.trending[0].name).toBe('TagB');
    expect(data.trending[0].growthRate).toBe(400);
    expect(data.trending[1].name).toBe('TagC');
    expect(data.trending[1].growthRate).toBe(400);
    expect(data.trending[2].name).toBe('TagA');
    expect(data.trending[2].growthRate).toBe(150);
  });

  it('returns only trending tags (growthRate>50 and recentCount>=2); frequent but flat tags are excluded', async () => {
    // Tag A: recentCount=1, weeklyAvg=1.0 → growthRate=0, isTrending=false → EXCLUDED
    // Tag B: recentCount=2, weeklyAvg=1.0 → growthRate=100, isTrending=true → INCLUDED
    // Tag C: recentCount=3, weeklyAvg=3.0 → growthRate=0, isTrending=false → EXCLUDED
    //   （帯の「いま伸びている話題」と食い違わないよう、件数が多いだけのタグは入れない）
    // Tag D: recentCount=1, weeklyAvg=0.5→eff=1.0 → growthRate=0, isTrending=false → EXCLUDED
    mockQueries(
      bucketRows([
        { id: 'tag-a', name: 'LowTag', recent: 1, weekly: 6 }, // avg=1.0
        { id: 'tag-b', name: 'TrendTag', recent: 2, weekly: 6 }, // avg=1.0
        { id: 'tag-c', name: 'FrequentTag', recent: 3, weekly: 18 }, // avg=3.0
        { id: 'tag-d', name: 'RareTag', recent: 1, weekly: 3 }, // avg=0.5 → eff=1.0
      ])
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);

    const names = data.trending.map((t: any) => t.name);
    expect(names).toEqual(['TrendTag']);
    // 区間の件数は API の応答に含めない（応答の形は変えない）
    expect(data.trending[0]).not.toHaveProperty('series');
  });

  it('returns 500 with fallback response on database error', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('Connection refused'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch trending keywords');
    expect(data.trending).toEqual([]);
    expect(data.newTags).toEqual([]);
    expect(data.period).toBeDefined();
    expect(data.period.from).toBeDefined();
    expect(data.period.to).toBeDefined();
  });

  it('includes cache stats and period in response', async () => {
    mockQueries(
      bucketRows([{ id: 'tag-1', name: 'Next.js', recent: 5, weekly: 6 }]),
      [{ id: 'tag-2', name: 'BrandNew', count: BigInt(2) }]
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // キャッシュの統計は公開しない（issue #783）
    expect(data).not.toHaveProperty('cache');
    // Period structure
    expect(data.period).toBeDefined();
    expect(data.period.from).toBeDefined();
    expect(data.period.to).toBeDefined();
    expect(new Date(data.period.from).getTime()).not.toBeNaN();
    expect(new Date(data.period.to).getTime()).not.toBeNaN();
    // newTags
    expect(data.newTags).toHaveLength(1);
    expect(data.newTags[0]).toEqual({
      id: 'tag-2',
      name: 'BrandNew',
      count: 2,
    });
  });

  it('無効化したソースの記事を数えない。新規タグの判定の内側も同じ（issue #688）', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    const [buckets, newTags] = prismaMock.$queryRaw.mock.calls;
    for (const call of [buckets, newTags]) {
      const sql = sqlFragmentsOf(call).join(' ');
      expect(sql).toContain(`a."sourceId" ${ENABLED_SOURCE_SQL}`);
      expect(sql).toContain('a."isHidden" = false');
    }
    const newSql = sqlFragmentsOf(newTags).join(' ');
    expect(newSql).toContain(`a2."sourceId" ${ENABLED_SOURCE_SQL}`);
    expect(newSql).toContain('a2."isHidden" = false');
  });

  it('区間の集計はホームに出る記事だけを数える（論文・技術以外・要約の無い記事・本文の無い記事を除く）', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await GET();

    const sql = sqlFragmentsOf(prismaMock.$queryRaw.mock.calls[0]).join(' ');
    expect(sql).toContain('a."isOffTopic" = false');
    expect(sql).toContain('a."summaryComputedAt" IS NOT NULL');
    expect(sql).toContain('a.content IS NOT NULL');
    expect(sql).toMatch(/a\."sourceId" NOT IN \(/);
  });
});
