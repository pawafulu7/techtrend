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
        initialNewTags={null}
        initialAnalysis={emptyAnalysis}
        initialSourceData={null}
      />
    );

    expect(
      screen.getByText('急上昇キーワードを読み込めませんでした')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('急上昇キーワードはありません')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('新着タグを読み込めませんでした')
    ).toBeInTheDocument();
    expect(screen.queryByText('新着タグはありません')).not.toBeInTheDocument();
    expect(
      screen.getByText('ソース別記事分布を読み込めませんでした')
    ).toBeInTheDocument();

    // 件数バーも 0 ではなく「取得できませんでした」
    expect(screen.getAllByText('取得できませんでした')).toHaveLength(2);

    await userEvent.click(
      within(getSection('急上昇キーワード')).getByRole('button', {
        name: '再試行',
      })
    );
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('取得に成功して該当なしのときは、従来どおり空として表示する', () => {
    render(
      <TrendsContent
        initialKeywords={[]}
        initialNewTags={[]}
        initialAnalysis={emptyAnalysis}
        initialSourceData={[]}
      />
    );

    expect(
      screen.getByText('急上昇キーワードはありません')
    ).toBeInTheDocument();
    expect(screen.getByText('新着タグはありません')).toBeInTheDocument();
    expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    expect(screen.queryByText('取得できませんでした')).not.toBeInTheDocument();
  });

  it('分析の取得に失敗したら、推移と人気タグに失敗を出し、再試行で取り直す', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => analysisWithTag,
    });

    render(
      <TrendsContent
        initialKeywords={[]}
        initialNewTags={[]}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );

    expect(
      screen.getByText('タグトレンドの推移を読み込めませんでした')
    ).toBeInTheDocument();
    expect(
      screen.getByText('人気タグを読み込めませんでした')
    ).toBeInTheDocument();
    // 件数バーの人気タグは 0 ではなく「取得できませんでした」
    expect(screen.getAllByText('取得できませんでした')).toHaveLength(1);
    // 「データがありません」はソース分布（空配列 = 該当なし）の1箇所だけ
    expect(screen.getAllByText('データがありません')).toHaveLength(1);

    const topTags = screen.getByText('人気タグ TOP10').closest('div.border');
    await userEvent.click(
      within(topTags as HTMLElement).getByRole('button', { name: '再試行' })
    );

    await waitFor(() => expect(screen.getByText('React')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/trends/analysis?days=7',
      expect.objectContaining({ cache: 'no-store' })
    );
    // 件数バーの人気タグも取り直した値になる
    expect(screen.queryByText('取得できませんでした')).not.toBeInTheDocument();
    expect(
      screen.queryByText('人気タグを読み込めませんでした')
    ).not.toBeInTheDocument();
  });

  it('期間を切り替えた取得が 500 を返したら、空ではなく失敗を出す', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    render(
      <TrendsContent
        initialKeywords={[]}
        initialNewTags={[]}
        initialAnalysis={analysisWithTag}
        initialSourceData={[]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '30日間' }));

    await waitFor(() =>
      expect(
        screen.getByText('人気タグを読み込めませんでした')
      ).toBeInTheDocument()
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
        initialNewTags={[]}
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
        initialNewTags={[]}
        initialAnalysis={{ ...analysisWithTag }}
        initialSourceData={[]}
      />
    );
    // 期間切り替えのデバウンス（300ms）を過ぎても取り直さない
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    // 30日の分析のまま（7日のサーバーの値で上書きしない）
    expect(screen.getByText('Go')).toBeInTheDocument();
    expect(screen.queryByText('React')).not.toBeInTheDocument();
  });

  it('7日表示中に router.refresh で新しい分析が届いたら反映する', () => {
    const { rerender } = render(
      <TrendsContent
        initialKeywords={null}
        initialNewTags={[]}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );
    expect(
      screen.getByText('人気タグを読み込めませんでした')
    ).toBeInTheDocument();

    rerender(
      <TrendsContent
        initialKeywords={[]}
        initialNewTags={[]}
        initialAnalysis={analysisWithTag}
        initialSourceData={[]}
      />
    );

    expect(screen.getByText('React')).toBeInTheDocument();
    expect(
      screen.queryByText('人気タグを読み込めませんでした')
    ).not.toBeInTheDocument();
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
        initialNewTags={[]}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );
    const topTags = screen.getByText('人気タグ TOP10').closest('div.border');
    await userEvent.click(
      within(topTags as HTMLElement).getByRole('button', { name: '再試行' })
    );

    expect(
      within(topTags as HTMLElement).getByRole('button', { name: '再試行中…' })
    ).toBeDisabled();
    expect(
      screen.getByText('タグトレンドの推移を読み込めませんでした')
    ).toBeInTheDocument();

    await act(async () => {
      resolveRetry({ ok: true, json: async () => analysisWithTag });
    });
    expect(await screen.findByText('React')).toBeInTheDocument();
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
        initialNewTags={[]}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );
    const topTags = screen.getByText('人気タグ TOP10').closest('div.border');
    await userEvent.click(
      within(topTags as HTMLElement).getByRole('button', { name: '再試行' })
    );
    await waitFor(() => expect(screen.getByText('React')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '30日間' }));
    await waitFor(() => expect(screen.getByText('Go')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '7日間' }));

    expect(screen.getByText('React')).toBeInTheDocument();
    expect(
      screen.queryByText('人気タグを読み込めませんでした')
    ).not.toBeInTheDocument();
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
        initialNewTags={[]}
        initialAnalysis={null}
        initialSourceData={[]}
      />
    );
    expect(
      screen.getByText('人気タグを読み込めませんでした')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '30日間' }));

    // デバウンス中も取得中も、7日の失敗や「再試行中…」ではなくスケルトン
    expect(
      screen.queryByText('人気タグを読み込めませんでした')
    ).not.toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('button', { name: '再試行中…' })
    ).not.toBeInTheDocument();

    await act(async () => {
      resolve30({ ok: true, json: async () => analysis30 });
    });
    expect(await screen.findByText('Go')).toBeInTheDocument();
  });
});
