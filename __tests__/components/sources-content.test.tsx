/**
 * ソース一覧: 取得の失敗は ErrorState と再試行で示し、再試行中も失敗表示を残す（issue #701）
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SourcesContent from '@/app/sources/sources-content';

jest.mock('@/lib/logger.client', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

function renderSources() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SourcesContent />
    </QueryClientProvider>
  );
}

describe('SourcesContent: 取得の失敗（issue #701）', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('失敗したら再試行を出し、再試行中も失敗表示を残す', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => '' })
      .mockImplementationOnce(() => new Promise(() => {}));

    renderSources();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ソースを読み込めませんでした'
    );
    await userEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(
      await screen.findByRole('button', { name: '再試行中…' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'ソースを読み込めませんでした'
    );
  });
});
