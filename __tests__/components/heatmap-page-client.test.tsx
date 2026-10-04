/**
 * セクターマップ: 取得の失敗を「データがありません」と表示せず、生の文言も出さない（issue #701）
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeatmapPageClient } from '@/app/trends/heatmap/page-client';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/app/components/trends', () => ({
  TechSectorTreemap: ({ data }: { data: unknown[] }) =>
    data.length === 0 ? (
      <p>データがありません</p>
    ) : (
      <div data-testid="treemap" />
    ),
}));

function renderHeatmap() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <HeatmapPageClient />
    </QueryClientProvider>
  );
}

describe('HeatmapPageClient: 取得の失敗（issue #701）', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('失敗したら、空状態ではなく利用者向けの文言と再試行を出し、再試行中も失敗表示を残す', async () => {
    let resolveRetry: (value: unknown) => void = () => {};
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRetry = resolve;
          })
      );

    renderHeatmap();

    expect(
      await screen.findByText(
        'セクターマップを読み込めませんでした。時間をおいて再試行してください。'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();
    expect(screen.queryByText('HTTP 500')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(
      await screen.findByRole('button', { name: '再試行中…' })
    ).toBeDisabled();
    expect(screen.queryByText('データがありません')).not.toBeInTheDocument();

    resolveRetry({
      ok: true,
      json: async () => ({ categories: [{ category: 'ai', count: 1 }] }),
    });
    expect(await screen.findByTestId('treemap')).toBeInTheDocument();
  });
});
