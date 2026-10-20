/**
 * 「いま伸びている話題」の集計の純粋な関数（lib/services/trending-series.ts）。
 *
 * 成長率と急上昇の判定は、1 本の SQL にまとめる前の式（直近 24 時間の件数と、前の 6 日の件数 ÷ 6 を
 * 比べる）と同じ結果になること、区間を 0 で埋めること、急上昇のものだけを並べることを確かめる。
 */
import {
  buildTrendingSeries,
  compareTrending,
  scoreTrend,
  TREND_BUCKET_COUNT,
  type TagBucketRow,
} from '@/lib/services/trending-series';

/** 区間ごとの件数（添字 = 区間。0 が直近 24 時間）から、SQL の行を作る。0 の区間は SQL と同じく行を返さない */
function rowsOf(id: string, name: string, buckets: number[]): TagBucketRow[] {
  return buckets.flatMap((count, bucket) =>
    count > 0 ? [{ id, name, bucket, count }] : []
  );
}

/** まとめる前の式（trending-keywords.ts の旧 loadTrendingKeywords）をそのまま写したもの */
function legacyScore(recentCount: number, weeklyCount: number) {
  const weeklyAverage = weeklyCount / 6;
  const effectiveAverage = Math.max(weeklyAverage, 1.0);
  const rawGrowthRate =
    ((recentCount - effectiveAverage) / effectiveAverage) * 100;
  const growthRate = Math.min(Math.round(rawGrowthRate), 999);
  return {
    weeklyAverage: Math.round(weeklyAverage * 10) / 10,
    growthRate,
    isTrending: growthRate > 50 && recentCount >= 2,
  };
}

describe('scoreTrend', () => {
  it.each([
    // [直近 24 時間, 前の 6 日の合計, 成長率, 急上昇]
    [5, 12, 150, true], // 1日平均 2.0
    [4, 2, 300, true], // 1日平均 0.33 → 分母は 1.0
    [20, 0, 999, true], // 999% で打ち切る
    [2, 6, 100, true], // 1日平均 1.0
    [3, 12, 50, false], // ちょうど 50% は急上昇にしない
    [1, 0, 0, false], // 1 件では急上昇にしない
    [2, 0, 100, true], // 2 件なら急上昇
    [0, 6, -100, false],
  ])(
    '直近 %i 件・前の 6 日 %i 件 → 成長率 %i%%・急上昇 %s',
    (recent, previous, growthRate, isTrending) => {
      const score = scoreTrend(recent, previous);
      expect(score.growthRate).toBe(growthRate);
      expect(score.isTrending).toBe(isTrending);
    }
  );

  it('1日平均は 1.0 に切り上げる前の値を小数 1 桁で返す', () => {
    expect(scoreTrend(4, 2).weeklyAverage).toBe(0.3);
    expect(scoreTrend(4, 0).weeklyAverage).toBe(0);
    expect(scoreTrend(4, 11).weeklyAverage).toBe(1.8);
  });

  it('まとめる前の式と、すべての組み合わせで同じ結果になる', () => {
    for (let recent = 0; recent <= 30; recent++) {
      for (let weekly = 0; weekly <= 60; weekly++) {
        expect(scoreTrend(recent, weekly)).toEqual(legacyScore(recent, weekly));
      }
    }
  });
});

describe('buildTrendingSeries', () => {
  it('区間を 0 で埋め、古い順（末尾が直近 24 時間）に並べる', () => {
    const { trending } = buildTrendingSeries(
      rowsOf('t1', 'React', [4, 0, 1, 0, 0, 2, 0]),
      20
    );
    expect(trending).toHaveLength(1);
    expect(trending[0].series).toEqual([0, 2, 0, 0, 1, 0, 4]);
    expect(trending[0].series).toHaveLength(TREND_BUCKET_COUNT);
    expect(trending[0].recentCount).toBe(4);
    expect(trending[0].series.at(-1)).toBe(trending[0].recentCount);
    // 前の 6 日の合計 3 → 1日平均 0.5、分母は 1.0
    expect(trending[0].weeklyAverage).toBe(0.5);
    expect(trending[0].growthRate).toBe(300);
  });

  it('同じタグ・同じ区間の行は足す', () => {
    const { trending } = buildTrendingSeries(
      [
        { id: 't1', name: 'React', bucket: 0, count: 2 },
        { id: 't1', name: 'React', bucket: 0, count: 1 },
      ],
      20
    );
    expect(trending[0].recentCount).toBe(3);
  });

  it('範囲外の区間（負・7 以上・整数でない）は捨てる', () => {
    const { trending } = buildTrendingSeries(
      [
        { id: 't1', name: 'React', bucket: 0, count: 3 },
        { id: 't1', name: 'React', bucket: 7, count: 100 },
        { id: 't1', name: 'React', bucket: -1, count: 100 },
        { id: 't1', name: 'React', bucket: 1.5, count: 100 },
      ],
      20
    );
    expect(trending[0].series).toEqual([0, 0, 0, 0, 0, 0, 3]);
    expect(trending[0].growthRate).toBe(200);
  });

  it('急上昇のものだけを返す（3 件以上でも伸びていないタグは入れない）', () => {
    const { trending, trendingTotal } = buildTrendingSeries(
      [
        ...rowsOf('up', 'Up', [3, 0, 0, 0, 0, 0, 0]),
        // 直近 6 件だが、前の 6 日も毎日 6 件 → 成長率 0%
        ...rowsOf('flat', 'Flat', [6, 6, 6, 6, 6, 6, 6]),
        ...rowsOf('one', 'One', [1, 0, 0, 0, 0, 0, 0]),
      ],
      20
    );
    expect(trending.map((tag) => tag.id)).toEqual(['up']);
    expect(trendingTotal).toBe(1);
  });

  it('成長率の高い順、同じなら直近の件数の多い順、残りは名前の順に並べる', () => {
    const { trending } = buildTrendingSeries(
      [
        ...rowsOf('b', 'B', [3, 0, 0, 0, 0, 0, 0]), // 200%
        ...rowsOf('a', 'A', [3, 0, 0, 0, 0, 0, 0]), // 200%
        ...rowsOf('c', 'C', [5, 6, 0, 0, 0, 0, 0]), // 1日平均 1.0 → 400%
        ...rowsOf('d', 'D', [4, 6, 6, 0, 0, 0, 0]), // 1日平均 2.0 → 100%
        ...rowsOf('e', 'E', [6, 6, 6, 0, 0, 0, 0]), // 1日平均 2.0 → 200%、直近 6 件
      ],
      20
    );
    expect(trending.map((tag) => tag.id)).toEqual(['c', 'e', 'a', 'b', 'd']);
  });

  it('上位 limit 件に打ち切り、総数は打ち切る前の数を返す', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      rowsOf(`t${i}`, `T${i}`, [2 + i, 0, 0, 0, 0, 0, 0])
    ).flat();
    const { trending, trendingTotal } = buildTrendingSeries(rows, 6);
    expect(trending).toHaveLength(6);
    expect(trendingTotal).toBe(8);
    expect(trending[0].id).toBe('t7');
  });

  it('行が無ければ空', () => {
    expect(buildTrendingSeries([], 20)).toEqual({
      trending: [],
      trendingTotal: 0,
    });
  });
});

describe('compareTrending', () => {
  it('名前も同じなら ID の順', () => {
    const base = {
      name: 'Same',
      recentCount: 3,
      weeklyAverage: 0,
      growthRate: 200,
      isTrending: true,
    };
    expect(compareTrending({ ...base, id: 'a' }, { ...base, id: 'b' })).toBe(
      -1
    );
    expect(compareTrending({ ...base, id: 'b' }, { ...base, id: 'a' })).toBe(1);
  });
});
