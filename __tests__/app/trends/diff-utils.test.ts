/**
 * トレンド差分画面のカテゴリ横断の統合が、分析と同じ照合キーを使うことを検証する（issue #655 項目 5）
 */

import type { DiffChange } from '@/lib/ai/extraction/extraction-schemas';
import {
  getGroupedChanges,
  type DiffSummaryData,
  type DiffSummaryResponse,
} from '@/app/trends/diff/_components/diff-utils';

function change(topic: string, type: DiffChange['type']): DiffChange {
  return {
    type,
    topic,
    description: `${topic} の説明。30 文字以上になるように文章を足しておく。`,
    significance: 'medium',
  };
}

function category(
  categoryName: string,
  changes: DiffChange[]
): DiffSummaryData {
  return {
    categorySlug: categoryName,
    categoryName,
    currentPeriod: '2026-W39',
    baselinePeriod: '2026-W38',
    changes,
    unchanged: [],
    modelVersion: 'm',
    promptVersion: 'p',
    generatedAt: '2026-09-28T00:00:00Z',
  };
}

function response(data: DiffSummaryData[]): DiffSummaryResponse {
  return {
    success: true,
    week: '2026-W39',
    previousWeek: '2026-W38',
    data,
    meta: { totalCategories: data.length, summarizedCategories: data.length },
  };
}

describe('getGroupedChanges のカテゴリ横断の統合', () => {
  it('範囲の違うトピック（Claude と Claude Code、REST と REST API）は別のカードにする', () => {
    const grouped = getGroupedChanges(
      response([
        category('AI', [
          change('Claude', 'trending'),
          change('REST', 'deprecated'),
        ]),
        category('海外', [
          change('Claude Code', 'new'),
          change('REST API', 'new'),
        ]),
      ])
    );

    expect(grouped.trending.map((c) => c.topic)).toEqual(['Claude']);
    expect(grouped.new.map((c) => c.topic)).toEqual([
      'Claude Code',
      'REST API',
    ]);
    expect(grouped.deprecated.map((c) => c.topic)).toEqual(['REST']);
  });

  it('同じトピック（同義語・大文字小文字の違い）は 1 枚にまとめ、表示名は正式名', () => {
    const grouped = getGroupedChanges(
      response([
        category('AI', [change('js', 'new')]),
        category('海外', [change('javascript', 'trending')]),
        category('国内', [change('JavaScript', 'updated')]),
      ])
    );

    const all = [...grouped.new, ...grouped.trending, ...grouped.updated];
    expect(all).toHaveLength(1);
    // 種類は優先度の高い trending、カテゴリは全部
    expect(grouped.trending[0].topic).toBe('JavaScript');
    expect(grouped.trending[0].category).toBe('AI、海外、国内');
  });
});
