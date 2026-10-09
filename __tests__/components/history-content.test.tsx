/**
 * 閲覧履歴: 取得に失敗したらスケルトンのまま止めず、失敗と再試行を出す（Issue #700 のレビューで発見）
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { HistoryContent } from '@/app/history/_components/history-content';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// 履歴カードの先で better-auth（ESM）を読み込むので、認証クライアントと履歴カードは差し替える
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'user-1' } }, isPending: false }),
  },
}));

jest.mock('@/app/components/article/history-card', () => ({
  HistoryArticleCard: () => null,
}));

jest.mock('@/app/hooks/use-favorite-statuses', () => ({
  useFavoriteStatuses: () => ({
    statuses: {},
    isLoading: false,
    isError: false,
  }),
}));

describe('HistoryContent: 取得の失敗', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('取得に失敗すると、見出しと失敗の表示と再試行を出す', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    render(<HistoryContent />);

    expect(
      await screen.findByText('閲覧履歴を読み込めませんでした')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: '閲覧履歴' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /再試行/ })).toBeEnabled();
    // 0件と誤って伝えない
    expect(screen.queryByText('(0件)')).not.toBeInTheDocument();
    expect(screen.queryByText('閲覧履歴がありません')).not.toBeInTheDocument();
  });

  it('再試行で取得できたら、失敗の表示を消して結果を出す', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ views: [] }),
      });

    render(<HistoryContent />);

    await userEvent.click(
      await screen.findByRole('button', { name: /再試行/ })
    );

    expect(await screen.findByText('閲覧履歴がありません')).toBeInTheDocument();
    expect(
      screen.queryByText('閲覧履歴を読み込めませんでした')
    ).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
