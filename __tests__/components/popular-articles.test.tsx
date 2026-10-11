/**
 * 人気記事ランキング: 取得の失敗を「0件のランキング」として見せない（issue #701）
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PopularArticles } from '@/app/components/popular/PopularArticles';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/popular',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/app/components/common/off-topic-toggle', () => ({
  OffTopicToggle: () => null,
  INCLUDE_OFF_TOPIC_PARAM: 'includeOffTopic',
}));

function renderPopular() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <PopularArticles limit={3} />
    </QueryClientProvider>
  );
  return { queryClient };
}

describe('PopularArticles: 取得の失敗と空（issue #701）', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('失敗したら件数 0 のランキングではなく失敗と再試行を出し、再試行中も失敗表示を残す', async () => {
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

    renderPopular();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ランキングを読み込めませんでした'
    );
    // 件数バー（「ランキング」の件数）は出さず、見出しだけにする。指標のタブは残す
    expect(screen.getAllByText('ランキング')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: /総合/ })).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(
      await screen.findByRole('button', { name: '再試行中…' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.queryByText('ランキングを読み込んでいます...')
    ).not.toBeInTheDocument();

    resolveRetry({ ok: true, json: async () => ({ articles: [] }) });
    expect(
      await screen.findByText('この期間のランキングはありません')
    ).toBeInTheDocument();
  });

  it('0件のときは空状態を出し、失敗とは見せない', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ articles: [] }) });

    renderPopular();

    expect(
      await screen.findByText('この期間のランキングはありません')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('取得済みのランキングがある状態で取り直しに失敗したら、内容を残して古いことを示す', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ articles: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const { queryClient } = renderPopular();
    expect(
      await screen.findByText('この期間のランキングはありません')
    ).toBeInTheDocument();

    await act(async () => {
      await queryClient.refetchQueries();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '最新のランキングを読み込めませんでした'
    );
  });
});
