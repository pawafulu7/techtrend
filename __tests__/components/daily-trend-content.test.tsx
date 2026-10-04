/**
 * 日次トレンド: サーバーの英語の error（daily-data.ts）を画面にそのまま出さない（issue #701）
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
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
});
