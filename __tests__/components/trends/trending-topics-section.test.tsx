/**
 * トレンド概要の「いま伸びている話題」の順位表（app/trends/_components/keyword-sections.tsx の
 * TrendingKeywordsSection と app/components/trends/overview/TrendingTopicRow.tsx）と、件数の読み出し
 * （TrendStatsBar）。
 *
 * - 順位表は1つの ol（role="list"）。2 列のときは縦に流す（行の数 = 件数の半分の切り上げ）
 * - 各行: 話題名のリンク（ホームをそのタグで絞り込む）・直近 24 時間の件数・成長率・前の 6 日の1日平均。
 *   折れ線は読み上げから隠し、7 区間の件数を文字で伝える。成長率の色は熱の段
 * - 総数が一覧より多いときは「全 N 件のうち上位 M 件」と出す
 * - 統計バーの「伸びている話題」は総数（一覧を打ち切った数ではない）
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { TrendingKeywordWithSeries } from '@/lib/services/trending-series';
import { TrendingKeywordsSection } from '@/app/trends/_components/keyword-sections';
import { TrendStatsBar } from '@/app/components/trends/overview/TrendStatsBar';
import { heatLevel } from '@/app/components/trends/trend-heat';

function topic(
  i: number,
  overrides: Partial<TrendingKeywordWithSeries> = {}
): TrendingKeywordWithSeries {
  return {
    id: `t${i}`,
    name: `Topic ${i}`,
    recentCount: 4,
    weeklyAverage: 0.8,
    growthRate: 300,
    isTrending: true,
    series: [0, 1, 0, 2, 0, 1, 4],
    ...overrides,
  };
}

const noop = () => undefined;

describe('TrendingKeywordsSection（いま伸びている話題）', () => {
  it('1つの ol に順位の順で行を並べ、2 列のときの行の数を件数の半分（切り上げ）にする', () => {
    const keywords = Array.from({ length: 5 }, (_, i) => topic(i + 1));
    render(
      <TrendingKeywordsSection
        keywords={keywords}
        total={5}
        aggregatedAt="2026-10-18T07:54:00.000Z"
        onRetry={noop}
        retrying={false}
      />
    );

    const section = screen
      .getByRole('heading', { level: 2, name: 'いま伸びている話題' })
      .closest('section') as HTMLElement;
    const list = within(section).getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(list.style.getPropertyValue('--trend-rows')).toBe('repeat(3, auto)');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(
      items.map((item) => within(item).getByRole('link').textContent)
    ).toEqual(['Topic 1', 'Topic 2', 'Topic 3', 'Topic 4', 'Topic 5']);
    // 総数と一覧が同じなら「上位」の注記は出さない
    expect(section).not.toHaveTextContent('件のうち');
  });

  it('各行は話題名のリンク・件数・成長率・前の6日の1日平均を出し、折れ線は件数の文字で読ませる', () => {
    render(
      <TrendingKeywordsSection
        keywords={[topic(1, { name: 'Claude Code' })]}
        total={1}
        aggregatedAt={null}
        onRetry={noop}
        retrying={false}
      />
    );

    const row = screen.getByTestId('trending-topic');
    expect(
      within(row).getByRole('link', { name: 'Claude Code' })
    ).toHaveAttribute('href', '/?tags=Claude%20Code');
    expect(row).toHaveTextContent('4件');
    expect(row).toHaveTextContent('+300%');
    expect(row).toHaveTextContent('前の6日は1日平均0.8件');
    expect(within(row).getByTestId('sparkline')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(row).toHaveTextContent(
      '24時間ごとの件数（7日前から直近まで）: 0、1、0、2、0、1、4'
    );
    // 成長率の文字の色は熱の段（300% は熱 3）
    expect(within(row).getByText('+300%')).toHaveStyle({
      color: 'var(--tt-color-heat3)',
    });
  });

  it('前の6日が0件のときは「前の6日は0件」と出す', () => {
    render(
      <TrendingKeywordsSection
        keywords={[topic(1, { weeklyAverage: 0 })]}
        total={1}
        onRetry={noop}
        retrying={false}
      />
    );
    expect(screen.getByTestId('trending-topic')).toHaveTextContent(
      '前の6日は0件'
    );
  });

  it('総数が一覧より多いときは、上位だけを出していることを書く', () => {
    render(
      <TrendingKeywordsSection
        keywords={Array.from({ length: 20 }, (_, i) => topic(i + 1))}
        total={46}
        onRetry={noop}
        retrying={false}
      />
    );
    expect(
      screen.getByText('全 46 件のうち、伸びの大きい順に上位 20 件')
    ).toBeInTheDocument();
  });

  it('0 件は空の表示、取得の失敗は再試行を出す', () => {
    const { rerender } = render(
      <TrendingKeywordsSection
        keywords={[]}
        total={0}
        onRetry={noop}
        retrying={false}
      />
    );
    expect(
      screen.getByText('いま伸びている話題はありません')
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();

    rerender(
      <TrendingKeywordsSection
        keywords={null}
        total={null}
        onRetry={noop}
        retrying={false}
      />
    );
    expect(
      screen.getByText('いま伸びている話題を読み込めませんでした')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });
});

describe('heatLevel（成長率 → 熱 1〜4）', () => {
  it.each([
    [51, 1],
    [199, 1],
    [200, 2],
    [299, 2],
    [300, 3],
    [499, 3],
    [500, 4],
    [999, 4],
  ])('%i%% → 熱 %i', (growthRate, level) => {
    expect(heatLevel(growthRate)).toBe(level);
  });
});

describe('TrendStatsBar（件数の読み出し）', () => {
  it('数を、何の数かと組にして読ませる。取得の失敗は「—」', () => {
    render(
      <TrendStatsBar trendingCount={46} newTagCount={10} topTagCount={null} />
    );
    const bar = screen.getByTestId('trend-stats-bar');
    const terms = within(bar).getAllByRole('term');
    const definitions = within(bar).getAllByRole('definition');
    expect(terms.map((t) => t.textContent)).toEqual([
      '伸びている話題',
      '新着タグ',
      '人気タグ',
    ]);
    expect(definitions[0]).toHaveTextContent('46');
    expect(definitions[1]).toHaveTextContent('10');
    expect(definitions[2]).toHaveTextContent('取得できませんでした');
  });
});
