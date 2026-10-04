/**
 * 日次トレンド: サーバーの英語の error（daily-data.ts）を画面にそのまま出さない（issue #701）
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DailyTrendContent } from '@/app/trends/daily/_components/daily-trend-content';

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
