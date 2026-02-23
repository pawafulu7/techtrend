/**
 * /api/trends/keywords エンドポイントのテスト
 *
 * 成長率計算ロジック:
 *   effectiveAverage = Math.max(weeklyAverage, 1.0)
 *   growthRate = Math.min(Math.round(((recentCount - effectiveAverage) / effectiveAverage) * 100), 999)
 *
 * $queryRaw呼び出し順序:
 *   1回目: recentTags（直近24h）
 *   2回目: weeklyTags（2-7日前）
 *   3回目: newTags（新規タグ）
 */

jest.mock('@/lib/cache/keywords-cache', () => ({
  keywordsCache: {
    getOrSet: jest.fn((_key: string, fn: () => Promise<unknown>) => fn()),
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

const prismaMock = prisma as any;

describe('/api/trends/keywords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculates growthRate correctly when weeklyAverage >= 1 (normal case)', async () => {
    // recentCount=5, weekly_count=12 → weeklyAverage=12/6=2.0
    // effectiveAverage = max(2.0, 1.0) = 2.0
    // growthRate = min(round(((5 - 2.0) / 2.0) * 100), 999) = 150
    const recentTags = [
      { id: 'tag-1', name: 'React', recent_count: BigInt(5) },
    ];
    const weeklyTags = [
      { id: 'tag-1', name: 'React', weekly_count: BigInt(12) },
    ];
    const newTags: any[] = [];

    prismaMock.$queryRaw
      .mockResolvedValueOnce(recentTags)
      .mockResolvedValueOnce(weeklyTags)
      .mockResolvedValueOnce(newTags);

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
    const recentTags = [
      { id: 'tag-1', name: 'Vercel', recent_count: BigInt(4) },
    ];
    const weeklyTags = [
      { id: 'tag-1', name: 'Vercel', weekly_count: BigInt(2) },
    ];
    const newTags: any[] = [];

    prismaMock.$queryRaw
      .mockResolvedValueOnce(recentTags)
      .mockResolvedValueOnce(weeklyTags)
      .mockResolvedValueOnce(newTags);

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
    const recentTags = [
      { id: 'tag-1', name: 'GPT-5', recent_count: BigInt(20) },
    ];
    const weeklyTags: any[] = [];
    const newTags: any[] = [];

    prismaMock.$queryRaw
      .mockResolvedValueOnce(recentTags)
      .mockResolvedValueOnce(weeklyTags)
      .mockResolvedValueOnce(newTags);

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
    const recentTags = [
      { id: 'tag-1', name: 'NewFramework', recent_count: BigInt(4) },
    ];
    const weeklyTags: any[] = [];
    const newTags: any[] = [];

    prismaMock.$queryRaw
      .mockResolvedValueOnce(recentTags)
      .mockResolvedValueOnce(weeklyTags)
      .mockResolvedValueOnce(newTags);

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
    const recentTags = [
      { id: 'tag-a', name: 'TagA', recent_count: BigInt(5) },
      { id: 'tag-b', name: 'TagB', recent_count: BigInt(10) },
      { id: 'tag-c', name: 'TagC', recent_count: BigInt(5) },
    ];
    const weeklyTags = [
      { id: 'tag-a', name: 'TagA', weekly_count: BigInt(12) }, // avg=2.0
      { id: 'tag-b', name: 'TagB', weekly_count: BigInt(12) }, // avg=2.0
      { id: 'tag-c', name: 'TagC', weekly_count: BigInt(6) }, // avg=1.0
    ];
    const newTags: any[] = [];

    prismaMock.$queryRaw
      .mockResolvedValueOnce(recentTags)
      .mockResolvedValueOnce(weeklyTags)
      .mockResolvedValueOnce(newTags);

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

  it('filters out tags that are neither trending (growthRate>50 and recentCount>=2) nor frequent (recentCount>=3)', async () => {
    // Tag A: recentCount=1, weeklyAvg=1.0 → growthRate=0, isTrending=false, recentCount<3 → EXCLUDED
    // Tag B: recentCount=2, weeklyAvg=1.0 → growthRate=100, isTrending=true → INCLUDED
    // Tag C: recentCount=3, weeklyAvg=3.0 → growthRate=0, isTrending=false, recentCount>=3 → INCLUDED
    // Tag D: recentCount=1, weeklyAvg=0.5→eff=1.0 → growthRate=0, isTrending=false, recentCount<3 → EXCLUDED
    const recentTags = [
      { id: 'tag-a', name: 'LowTag', recent_count: BigInt(1) },
      { id: 'tag-b', name: 'TrendTag', recent_count: BigInt(2) },
      { id: 'tag-c', name: 'FrequentTag', recent_count: BigInt(3) },
      { id: 'tag-d', name: 'RareTag', recent_count: BigInt(1) },
    ];
    const weeklyTags = [
      { id: 'tag-a', name: 'LowTag', weekly_count: BigInt(6) }, // avg=1.0
      { id: 'tag-b', name: 'TrendTag', weekly_count: BigInt(6) }, // avg=1.0
      { id: 'tag-c', name: 'FrequentTag', weekly_count: BigInt(18) }, // avg=3.0
      { id: 'tag-d', name: 'RareTag', weekly_count: BigInt(3) }, // avg=0.5 → eff=1.0
    ];
    const newTags: any[] = [];

    prismaMock.$queryRaw
      .mockResolvedValueOnce(recentTags)
      .mockResolvedValueOnce(weeklyTags)
      .mockResolvedValueOnce(newTags);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);

    const names = data.trending.map((t: any) => t.name);
    expect(names).toContain('TrendTag');
    expect(names).toContain('FrequentTag');
    expect(names).not.toContain('LowTag');
    expect(names).not.toContain('RareTag');
    expect(data.trending).toHaveLength(2);
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
    const recentTags = [
      { id: 'tag-1', name: 'Next.js', recent_count: BigInt(5) },
    ];
    const weeklyTags = [
      { id: 'tag-1', name: 'Next.js', weekly_count: BigInt(6) },
    ];
    const newTags = [
      { id: 'tag-2', name: 'BrandNew', count: BigInt(2) },
    ];

    prismaMock.$queryRaw
      .mockResolvedValueOnce(recentTags)
      .mockResolvedValueOnce(weeklyTags)
      .mockResolvedValueOnce(newTags);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // Cache structure
    expect(data.cache).toBeDefined();
    expect(data.cache.hit).toBe(false);
    expect(data.cache.stats).toEqual({ hits: 0, misses: 1, size: 0 });
    // Period structure
    expect(data.period).toBeDefined();
    expect(data.period.from).toBeDefined();
    expect(data.period.to).toBeDefined();
    expect(new Date(data.period.from).getTime()).not.toBeNaN();
    expect(new Date(data.period.to).getTime()).not.toBeNaN();
    // newTags
    expect(data.newTags).toHaveLength(1);
    expect(data.newTags[0]).toEqual({ id: 'tag-2', name: 'BrandNew', count: 2 });
  });
});
