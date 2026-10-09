import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRelatedArticles } from '@/hooks/use-related-articles';

/**
 * 関連記事の取得（issue #703）
 *
 * 一覧の表示は方式（tag / embedding）ごとに関連の理由を変えるので、
 * API の metadata.algorithm がフックの戻り値まで届くことを確かめる。
 */

const fetchMock = jest.fn();

const article = {
  id: 'related-1',
  title: 'Related 1',
  translatedTitle: null,
  summary: 'summary',
  url: 'https://example.com/related-1',
  publishedAt: '2026-10-01T00:00:00.000Z',
  source: 'Example',
  tags: [],
  similarity: 1,
  commonTags: 2,
};

function respondWith(body: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function renderUseRelatedArticles() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useRelatedArticles('article-1'), { wrapper });
}

describe('useRelatedArticles', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('API の metadata.algorithm が embedding なら algorithm を embedding で返す', async () => {
    respondWith({
      articles: [article],
      metadata: { algorithm: 'embedding' },
    });

    const { result } = renderUseRelatedArticles();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      articles: [article],
      algorithm: 'embedding',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/articles/article-1/related?limit=10'
    );
  });

  it('API の metadata.algorithm が tag なら algorithm を tag で返す', async () => {
    respondWith({
      articles: [article],
      metadata: { algorithm: 'tag', source: 'tag_fallback' },
    });

    const { result } = renderUseRelatedArticles();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.algorithm).toBe('tag');
    expect(result.current.data?.articles).toEqual([article]);
  });

  it('metadata が無ければ algorithm を tag として扱う', async () => {
    respondWith({ articles: [article] });

    const { result } = renderUseRelatedArticles();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.algorithm).toBe('tag');
  });
});
