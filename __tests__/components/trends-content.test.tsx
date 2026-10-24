/**
 * トレンド概要: 取得に失敗したセクションを「0件」や「データがありません」と表示せず、
 * 失敗と再試行を出す（issue #701）
 */
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { TrendsContent } from '@/app/trends/_components/trends-content';
import type { TrendAnalysis } from '@/app/trends/_components/trends-data';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: jest.fn() }),
}));

// next/dynamic を経由せず、実物のチャートを使う（失敗・空の分岐は recharts を描かない）
jest.mock('@/app/components/trends', () => ({
  TrendLineChart: jest.requireActual('@/app/components/trends/TrendLineChart')
    .TrendLineChart,
  SourcePieChart: jest.requireActual('@/app/components/trends/SourcePieChart')
    .SourcePieChart,
}));

jest.mock('@/app/components/trends/overview/TrendNavigationCards', () => ({
  TrendNavigationCards: () => null,
}));

const emptyAnalysis: TrendAnalysis = {
  topTags: [],
  timeline: [],
  period: { from: '2026-09-27', to: '2026-10-04', days: 7 },
};

const analysisWithTag: TrendAnalysis = {
  ...emptyAnalysis,
  topTags: [{ name: 'React', totalCount: 12 }],
};

// 30日の応答は別のタグにして、7日のデータと取り違えたら分かるようにする
const analysis30: TrendAnalysis = {
  ...emptyAnalysis,
  period: { from: '2026-09-04', to: '2026-10-04', days: 30 },
  topTags: [{ name: 'Go', totalCount: 30 }],
};

function getSection(heading: string): HTMLElement {
  const section = screen
    .getByRole('heading', { name: heading })
    .closest('section');
  if (!section) throw new Error(`section not found: ${heading}`);
  return section;
}

const ANALYSIS_ERROR = 'タグトレンドの推移を読み込めませんでした';

// 分析の推移のカード（失敗と再試行はここに出る）
function lineChartCard(): HTMLElement {
  const card = screen
    .getByRole('heading', { name: 'タグトレンドの推移' })
    .closest('div.border');
  if (!card) throw new Error('line chart card not found');
  return card as HTMLElement;
}

// 表示している分析の期間（集計の表示「直近N日の記事を…に集計」から読む）。
// 7日と30日の応答を取り違えていないかを、この値で見分ける
function shownPeriodDays(): string | undefined {
  return screen
    .queryByText(/^直近\d+日の記事を/)
    ?.textContent?.match(/直近(\d+)日/)?.[1];
}

describe('TrendsContent: 取得の失敗（issue #701）', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('サーバーで取得に失敗したセクションは失敗と再試行を出し、0件と表示しない', async () => {
    render(
      <TrendsContent
        initialKeywords={null}
        trendingTotal={null}
        initialAnalysis={emptyAnalysis}
        initialSourceData={null}
      />
    );

    expect(
      screen.getByText('いま伸びている話題を読み込めませんでした')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('いま伸びている話題はありません')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('ソース別記事分布を読み込めませんでした')
    ).toBeInTheDocument();

    await userEvent.click(
      within(getSection('いま伸びている話題')).getByRole('button', {
        name: '再試行',
      })
    );
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('取得に成功して該当なしのときは、従来どおり空として表示する', () => {
    render(
      <TrendsContent
        initialKeywords={[]}
        trendingTotal={0}
        initialAnalysis={emptyAnalysis}
        initialSourceData={[]}
      />
    );

    // 空の表示は、ページの下地ではなく見出しと同じカード（枠と背景）の中に出す（issue #763）
    const section = getSection('いま伸びている話題');
    expect(section).toHaveClass('bg-background', 'border', 'rounded-lg');
    expect(
      within(within(section).getByTestId('empty-state')).getByText(
        'いま伸びている話題はありません'
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    expect(screen.queryByText('取得できませんでした')).not.toBeInTheDocument();
  });

  it('人気タグと新着タグは出さない（タグ分析にまとめた、Issue #709）', () => {
    render(
      <TrendsContent
        initialKeywords={[]}
        trendingTotal={0}
        initialAnalysis={analysisWithTag}
        initialSourceData={[]}
      />
    );

    expect(screen.queryByText('人気タグ TOP10')).not.toBeInTheDocument();
    expect(screen.queryByText(/^新着タグ/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('trend-stats-bar')).not.toBeInTheDocument();
  });

  it('分析の取得に失敗したら、推移に失敗を出し、再試行で取り直す', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => analysisWithTag,
    });

    render(
      <TrendsContent
        initialKeywords={[]}
        trendingTotal={0}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );

    expect(screen.getByText(ANALYSIS_ERROR)).toBeInTheDocument();
    // 「データがありません」はソース分布（空配列 = 該当なし）の1箇所だけ
    expect(screen.getAllByText('データがありません')).toHaveLength(1);

    await userEvent.click(
      within(lineChartCard()).getByRole('button', { name: '再試行' })
    );

    await waitFor(() =>
      expect(screen.queryByText(ANALYSIS_ERROR)).not.toBeInTheDocument()
    );
    expect(shownPeriodDays()).toBe('7');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/trends/analysis?days=7',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('期間を切り替えた取得が 500 を返したら、空ではなく失敗を出す', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    render(
      <TrendsContent
        initialKeywords={[]}
        trendingTotal={0}
        initialAnalysis={analysisWithTag}
        initialSourceData={[]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '30日間' }));

    await waitFor(() =>
      expect(screen.getByText(ANALYSIS_ERROR)).toBeInTheDocument()
    );
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/trends/analysis?days=30',
      expect.anything()
    );
    // 「データがありません」はソース分布（空配列 = 該当なし）の1箇所だけ
    expect(screen.getAllByText('データがありません')).toHaveLength(1);
  });

  it('他セクションの再試行で props が作り直されても、表示中の分析を取り直さない', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => analysis30,
    });

    const { rerender } = render(
      <TrendsContent
        initialKeywords={null}
        trendingTotal={null}
        initialAnalysis={analysisWithTag}
        initialSourceData={[]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '30日間' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // router.refresh の後: サーバーの分析は同じ内容でも、オブジェクトは作り直される
    rerender(
      <TrendsContent
        initialKeywords={[]}
        trendingTotal={0}
        initialAnalysis={{ ...analysisWithTag }}
        initialSourceData={[]}
      />
    );
    // 期間切り替えのデバウンス（300ms）を過ぎても取り直さない
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    // 30日の分析のまま（7日のサーバーの値で上書きしない）
    expect(shownPeriodDays()).toBe('30');
  });

  it('7日表示中に router.refresh で新しい分析が届いたら反映する', () => {
    const { rerender } = render(
      <TrendsContent
        initialKeywords={null}
        trendingTotal={null}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );
    expect(screen.getByText(ANALYSIS_ERROR)).toBeInTheDocument();

    rerender(
      <TrendsContent
        initialKeywords={[]}
        trendingTotal={0}
        initialAnalysis={analysisWithTag}
        initialSourceData={[]}
      />
    );

    expect(shownPeriodDays()).toBe('7');
    expect(screen.queryByText(ANALYSIS_ERROR)).not.toBeInTheDocument();
  });

  it('分析の再試行中も、スケルトンに戻さず失敗表示を残す', async () => {
    let resolveRetry: (value: unknown) => void = () => {};
    global.fetch = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRetry = resolve;
        })
    );

    render(
      <TrendsContent
        initialKeywords={[]}
        trendingTotal={0}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );
    await userEvent.click(
      within(lineChartCard()).getByRole('button', { name: '再試行' })
    );

    // 再試行中は aria-disabled で押せない状態にする（disabled だとフォーカスが外れるため。Issue #700）
    expect(
      within(lineChartCard()).getByRole('button', { name: '再試行中…' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(ANALYSIS_ERROR)).toBeInTheDocument();

    await act(async () => {
      resolveRetry({ ok: true, json: async () => analysisWithTag });
    });
    await waitFor(() => expect(shownPeriodDays()).toBe('7'));
  });

  it('7日で取り直して成功した分析は、30日に切り替えて7日に戻しても残る', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.includes('days=30') ? analysis30 : analysisWithTag,
      })
    );

    render(
      <TrendsContent
        initialKeywords={[]}
        trendingTotal={0}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );
    await userEvent.click(
      within(lineChartCard()).getByRole('button', { name: '再試行' })
    );
    await waitFor(() => expect(shownPeriodDays()).toBe('7'));

    await userEvent.click(screen.getByRole('button', { name: '30日間' }));
    await waitFor(() => expect(shownPeriodDays()).toBe('30'));
    await userEvent.click(screen.getByRole('button', { name: '7日間' }));

    expect(shownPeriodDays()).toBe('7');
    expect(screen.queryByText(ANALYSIS_ERROR)).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('失敗した期間から切り替えたら、読み込み中は前の期間の失敗を出さない', async () => {
    let resolve30: (value: unknown) => void = () => {};
    global.fetch = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolve30 = resolve;
        })
    );

    render(
      <TrendsContent
        initialKeywords={[]}
        trendingTotal={0}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );
    expect(screen.getByText(ANALYSIS_ERROR)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '30日間' }));

    // デバウンス中も取得中も、7日の失敗や「再試行中…」、空表示ではなくスケルトン
    expect(screen.queryByText(ANALYSIS_ERROR)).not.toBeInTheDocument();
    // 「データがありません」はソース分布（空配列 = 該当なし）の1箇所だけ
    expect(screen.getAllByText('データがありません')).toHaveLength(1);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('button', { name: '再試行中…' })
    ).not.toBeInTheDocument();

    await act(async () => {
      resolve30({ ok: true, json: async () => analysis30 });
    });
    await waitFor(() => expect(shownPeriodDays()).toBe('30'));
  });

  it('router.refresh でサーバーの分析がまだ失敗（null）でも、取り直した分析を残す', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => analysisWithTag,
    });

    const { rerender } = render(
      <TrendsContent
        initialKeywords={null}
        trendingTotal={null}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );
    await userEvent.click(
      within(lineChartCard()).getByRole('button', { name: '再試行' })
    );
    await waitFor(() => expect(shownPeriodDays()).toBe('7'));

    rerender(
      <TrendsContent
        initialKeywords={[]}
        trendingTotal={0}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );
    // 期間を往復しても、最後に成功した7日の分析に戻る
    await userEvent.click(screen.getByRole('button', { name: '30日間' }));
    await userEvent.click(screen.getByRole('button', { name: '7日間' }));

    expect(shownPeriodDays()).toBe('7');
    expect(screen.queryByText(ANALYSIS_ERROR)).not.toBeInTheDocument();
  });
});
