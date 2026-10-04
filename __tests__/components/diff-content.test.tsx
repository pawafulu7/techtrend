/**
 * 週間変化: 取得の失敗を「データがありません」と表示せず、生の文言も出さない（issue #701）
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DiffContent } from '@/app/trends/diff/_components/diff-content';

jest.mock('@/app/trends/diff/_components/diff-sections', () => ({
  DiffMainContent: () => <div data-testid="diff-main" />,
}));

jest.mock('@/lib/logger.client', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

describe('DiffContent: 取得の失敗（issue #701）', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('取得に失敗したら、空状態ではなく利用者向けの失敗と再試行を出す', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    });

    render(<DiffContent initialData={null} initialWeek="2026-W40" />);
    await userEvent.click(screen.getByRole('button', { name: /前週/ }));

    expect(
      await screen.findByText(
        '差分レポートの取得に失敗しました。時間をおいて再試行してください。'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();
    expect(screen.queryByText('Internal server error')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /再試行/ })).toBeInTheDocument();
  });
});
