/**
 * /api/trends/analysis?tag= のタグ照合が大文字小文字を区別しないこと（#672）
 */
jest.mock('@/lib/cache/trends-cache', () => ({
  trendsCache: {
    generateTrendsKey: jest.fn(() => 'trends:test'),
    getOrSetWithLock: jest.fn((_key: string, fn: () => Promise<unknown>) =>
      fn()
    ),
    getStats: jest.fn(() => ({ hits: 0, misses: 1 })),
  },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/trends/analysis/route';
import { expectAnalysisPeriodSql } from '../../helpers/sql-fragments';

const prismaMock = prisma as unknown as { $queryRaw: jest.Mock };

/** $queryRaw のテンプレートの文字列部分をつなげて返す */
function sqlOf(call: unknown[]): string {
  return (call[0] as string[]).join('?');
}

describe('GET /api/trends/analysis (tag)', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  it('matches the tag and excludes it from related tags by lower(name)', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/trends/analysis?tag=mcp&days=7'
      )
    );

    expect(response.status).toBe(200);
    // キャッシュの統計は公開しない（issue #783）
    expect(await response.json()).not.toHaveProperty('cache');
    const [timeline, related] = prismaMock.$queryRaw.mock.calls.map(sqlOf);
    expect(timeline).toContain('WHERE lower(t.name) = lower(?)');
    expect(related).toContain('WHERE lower(t1.name) = lower(?)');
    expect(related).toContain('AND lower(t2.name) <> lower(?)');
    // 入力の表記はそのまま渡す（小文字にするのは SQL 側）
    expect(prismaMock.$queryRaw.mock.calls[0]).toContain('mcp');
  });
});

describe('GET /api/trends/analysis: 無効化したソースの記事を数えない（issue #688）', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  it('タグ指定: 時系列と関連タグの両方', async () => {
    await GET(
      new NextRequest(
        'http://localhost:3000/api/trends/analysis?tag=mcp&days=7'
      )
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    // 期間（articleAggregationSql）の断片に、有効なソースと非表示でない条件が AND で入る
    for (const call of prismaMock.$queryRaw.mock.calls) {
      expectAnalysisPeriodSql(call, { days: 7 });
    }
    // タグの推移も日本時間の暦日でまとめる（全体の推移と同じ区切り）
    expect(sqlOf(prismaMock.$queryRaw.mock.calls[0])).toContain(
      `TO_CHAR(a."publishedAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')`
    );
  });

  it('全体: 上位タグとその時系列の両方', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { name: 'React', total_count: BigInt(3) },
    ]);

    await GET(
      new NextRequest('http://localhost:3000/api/trends/analysis?days=30')
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    // 期間（articleAggregationSql）の断片に、有効なソースと非表示でない条件が AND で入る
    for (const call of prismaMock.$queryRaw.mock.calls) {
      expectAnalysisPeriodSql(call, { days: 30 });
    }
  });
});
