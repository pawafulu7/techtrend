/**
 * 日次トレンド: サーバーの英語の error（daily-data.ts）を画面にそのまま出さない（issue #701）
 * 見出しと前日／翌日の移動は読み込み中・失敗時も出す（Issue #700）
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DailyTrendContent } from '@/app/trends/daily/_components/daily-trend-content';
import type { TrendReportData } from '@/lib/services/trend-report/types';

jest.mock('@/app/components/trends/daily', () => ({
  DailyTrendHero: () => null,
  TopArticleList: () => null,
  CategoryDistribution: () => null,
}));

describe('DailyTrendContent: 取得の失敗の文言（issue #701）', () => {
  it('サーバー描画の失敗は利用者向けの文言で出す', () => {
    render(
      <DailyTrendContent
        initialData={{ success: false, error: 'Internal server error' }}
      />
    );

    expect(screen.getByText('データの取得に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('Internal server error')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
  });

  it('レポートが無いときは、まだ生成されていないことを伝える', () => {
    render(
      <DailyTrendContent
        initialData={{
          success: false,
          error: 'No report found for this date',
          latestAvailableDate: null,
        }}
      />
    );

    expect(
      screen.getByText('この日のトレンドレポートはまだ生成されていません')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No report found for this date')
    ).not.toBeInTheDocument();
  });

  it('再試行の応答が JSON にならない 500 でも、ネットワークエラーではなく取得の失敗として出す', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });

    try {
      render(
        <DailyTrendContent
          initialData={{ success: false, error: 'Internal server error' }}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /再試行/ }));

      expect(
        await screen.findByText('データの取得に失敗しました')
      ).toBeInTheDocument();
      expect(
        screen.queryByText('ネットワークエラーが発生しました')
      ).not.toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('DailyTrendContent: 見出しと前日／翌日の移動（Issue #700）', () => {
  // サーバーからは日時が ISO 文字列で届く（daily-data.ts が toISOString() で渡す）。型は Date のまま
  const iso = (value: string) => value as unknown as Date;
  const report: TrendReportData = {
    periodType: 'DAILY',
    periodStart: iso('2026-09-28T15:00:00.000Z'), // JST 2026-09-29
    periodEnd: iso('2026-09-29T15:00:00.000Z'),
    articleCount: 10,
    topArticles: [],
    categories: [],
    tags: [],
  };

  it('レポートがあるときは h1・日付・前日／翌日のボタンを出し、移動先が無い方は押せない', () => {
    render(
      <DailyTrendContent
        initialData={{
          success: true,
          data: report,
          navigation: { prevDate: '2026-09-28', nextDate: null },
        }}
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'デイリートレンド' })
    ).toBeInTheDocument();
    expect(screen.getByText('2026年9月29日(火)')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '前日のトレンドを表示' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: '翌日のトレンドを表示' })
    ).toBeDisabled();
  });

  it('前日を押すとその日のレポートを取得し、読み込み中もボタンを出したまま押せなくする', async () => {
    const originalFetch = global.fetch;
    let resolveFetch: (value: unknown) => void = () => {};
    global.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    try {
      render(
        <DailyTrendContent
          initialData={{
            success: true,
            data: report,
            navigation: { prevDate: '2026-09-28', nextDate: '2026-09-30' },
          }}
        />
      );
      await userEvent.click(
        screen.getByRole('button', { name: '前日のトレンドを表示' })
      );

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/trends/daily?date=2026-09-28'
      );
      expect(
        screen.getByRole('heading', { level: 1, name: 'デイリートレンド' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '前日のトレンドを表示' })
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: '翌日のトレンドを表示' })
      ).toBeDisabled();

      resolveFetch({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              ...report,
              periodStart: iso('2026-09-27T15:00:00.000Z'),
            },
            navigation: { prevDate: null, nextDate: '2026-09-29' },
          }),
      });

      expect(await screen.findByText('2026年9月28日(月)')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '前日のトレンドを表示' })
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: '翌日のトレンドを表示' })
      ).toBeEnabled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('取得に失敗しても h1 は出す', () => {
    render(
      <DailyTrendContent
        initialData={{ success: false, error: 'Internal server error' }}
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'デイリートレンド' })
    ).toBeInTheDocument();
  });
});
