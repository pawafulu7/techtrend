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
import {
  ENABLED_SOURCE_SQL,
  sqlFragmentsOf,
} from '../../helpers/sql-fragments';

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
    const [timeline, related] = prismaMock.$queryRaw.mock.calls.map(sqlOf);
    expect(timeline).toContain('WHERE lower(t.name) = lower(?)');
    expect(related).toContain('WHERE lower(t1.name) = lower(?)');
    expect(related).toContain('AND lower(t2.name) <> lower(?)');
    // 入力の表記はそのまま渡す（小文字にするのは SQL 側）
    expect(prismaMock.$queryRaw.mock.calls[0]).toContain('mcp');
  });
});

describe('GET /api/trends/analysis: 無効化したソースの記事を数えない（issue #688）', () => {
  const ENABLED = `a."sourceId" ${ENABLED_SOURCE_SQL}`;

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
    for (const call of prismaMock.$queryRaw.mock.calls) {
      expect(sqlFragmentsOf(call, { afterAnd: true })).toEqual([ENABLED]);
    }
  });

  it('全体: 上位タグとその時系列の両方', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { name: 'React', total_count: BigInt(3) },
    ]);

    await GET(
      new NextRequest('http://localhost:3000/api/trends/analysis?days=30')
    );

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    for (const call of prismaMock.$queryRaw.mock.calls) {
      expect(sqlFragmentsOf(call, { afterAnd: true })).toEqual([ENABLED]);
    }
  });
});
