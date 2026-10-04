/**
 * タグ統計: 取得に失敗した項目を 0 件と表示せず、失敗と再試行を出す（issue #701）
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TagStats } from '../TagStats';

jest.mock('@/lib/logger.client', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

type Responses = {
  stats: () => Promise<unknown>;
  cloud: () => Promise<unknown>;
  newTags: () => Promise<unknown>;
};

const ok = (body: unknown) => () =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });
const fail = () => () => Promise.resolve({ ok: false, status: 500 });

function mockFetch(responses: Responses) {
  global.fetch = jest.fn((url: string) => {
    if (url.startsWith('/api/tags/stats')) return responses.stats();
    if (url.startsWith('/api/tags/cloud')) return responses.cloud();
    if (url.startsWith('/api/tags/new')) return responses.newTags();
    throw new Error(`unexpected url: ${url}`);
  }) as jest.Mock;
}

function renderTagStats() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TagStats />
    </QueryClientProvider>
  );
  return { queryClient };
}

const cloudBody = {
  tags: [
    { name: 'React', count: 5, trend: 'rising', growthRate: 40 },
    { name: 'Go', count: 3, trend: 'stable', growthRate: 0 },
  ],
};

describe('TagStats', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('すべて取得できたときは件数を出し、失敗の表示を出さない', async () => {
    mockFetch({
      stats: ok({ total: 120 }),
      cloud: ok(cloudBody),
      newTags: ok({ count: 1 }),
    });

    renderTagStats();

    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.queryByTestId('error-state')).not.toBeInTheDocument();
  });

  it('失敗した項目は「—」にして失敗と再試行を出し、再試行で失敗した取得だけをやり直す', async () => {
    const statsResponses = [fail(), ok({ total: 120 })];
    let statsCalls = 0;
    mockFetch({
      stats: () => statsResponses[Math.min(statsCalls++, 1)](),
      cloud: ok(cloudBody),
      newTags: ok({ count: 1 }),
    });

    renderTagStats();

    expect(
      await screen.findByText('一部の統計を読み込めませんでした')
    ).toBeInTheDocument();
    // 総タグ数は 0 ではなく取得できなかったことを示す
    expect(screen.getAllByText('取得できませんでした')).toHaveLength(1);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    // 取得できた項目はそのまま出す
    expect(screen.getByText('2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '再試行' }));

    expect(await screen.findByText('120')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId('error-state')).not.toBeInTheDocument()
    );
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0]);
    expect(
      urls.filter((u: string) => u.startsWith('/api/tags/stats'))
    ).toHaveLength(2);
    expect(
      urls.filter((u: string) => u.startsWith('/api/tags/cloud'))
    ).toHaveLength(1);
    expect(
      urls.filter((u: string) => u.startsWith('/api/tags/new'))
    ).toHaveLength(1);
  });

  it('アクティブか新規のどちらかが失敗したら、成長率も「—」にする', async () => {
    mockFetch({
      stats: ok({ total: 120 }),
      cloud: ok(cloudBody),
      newTags: fail(),
    });

    renderTagStats();

    expect(
      await screen.findByText('一部の統計を読み込めませんでした')
    ).toBeInTheDocument();
    // 新規（週間）と成長率
    expect(screen.getAllByText('取得できませんでした')).toHaveLength(2);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('再試行中も取得済みの値を残し、再試行中であることを示す', async () => {
    let resolveRetry: (value: unknown) => void = () => {};
    let statsCalls = 0;
    mockFetch({
      stats: () => {
        statsCalls += 1;
        if (statsCalls === 1) return fail()();
        return new Promise((resolve) => {
          resolveRetry = resolve;
        });
      },
      cloud: ok(cloudBody),
      newTags: ok({ count: 1 }),
    });

    renderTagStats();

    await userEvent.click(
      await screen.findByRole('button', { name: '再試行' })
    );

    // スケルトンに戻らず、取得済みの「アクティブ: 2」と失敗中の「—」を出したまま
    expect(
      await screen.findByRole('button', { name: '再試行中…' })
    ).toBeDisabled();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('取得できませんでした')).toHaveLength(1);

    resolveRetry({ ok: true, status: 200, json: async () => ({ total: 120 }) });
    expect(await screen.findByText('120')).toBeInTheDocument();
  });

  it('取得済みの値がある状態で再取得に失敗したら、値を残して古いことを示す', async () => {
    let statsCalls = 0;
    mockFetch({
      stats: () => {
        statsCalls += 1;
        return statsCalls === 1 ? ok({ total: 120 })() : fail()();
      },
      cloud: ok(cloudBody),
      newTags: ok({ count: 1 }),
    });

    const { queryClient } = renderTagStats();
    expect(await screen.findByText('120')).toBeInTheDocument();

    await act(() => queryClient.refetchQueries({ queryKey: ['tag-stats'] }));

    expect(
      await screen.findByText('最新の統計を読み込めませんでした')
    ).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.queryByText('取得できませんでした')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
  });
});
