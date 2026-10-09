/**
 * ダイジェスト: 取得の失敗は生の error.message ではなく利用者向けの文言と再試行で示す（issue #701）
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DigestClient } from '@/app/components/digest/digest-client';

jest.mock('@/lib/hooks/use-personalization-preferences', () => ({
  useUpdatePreferences: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock(
  '@/app/components/personalization/category-preference-dialog',
  () => ({ CategoryPreferenceDialog: () => null })
);

jest.mock('@/app/components/digest/digest-section', () => ({
  DigestSection: ({ section }: { section: { type: string } }) => (
    <div data-testid="digest-section">{section.type}</div>
  ),
}));

function renderDigest() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DigestClient />
    </QueryClientProvider>
  );
  return { queryClient };
}

const digestBody = {
  hasPreferences: true,
  categories: [],
  selectedCategories: [],
  sections: [{ type: 'top', articles: [{ id: 'a1' }] }],
};

describe('DigestClient: 取得の失敗（issue #701）', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('500 のときは利用者向けの文言と再試行を出し、再試行で取り直す', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => digestBody });

    renderDigest();

    expect(
      await screen.findByText('ダイジェストを読み込めませんでした')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Failed to fetch digest/)
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '再試行' }));

    expect(await screen.findByTestId('digest-section')).toBeInTheDocument();
    expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
  });

  it('401 のときは再試行ではなくログインへの導線を出す', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

    renderDigest();

    expect(
      await screen.findByText('ログインの有効期限が切れました')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ログインする' })).toHaveAttribute(
      'href',
      '/auth/login?callbackUrl=%2Fdigest'
    );
    expect(
      screen.queryByRole('button', { name: '再試行' })
    ).not.toBeInTheDocument();
  });

  it('前回の内容がある状態で再取得に失敗したら、内容を残して古いデータであることを示す', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => digestBody })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const { queryClient } = renderDigest();
    expect(await screen.findByTestId('digest-section')).toBeInTheDocument();

    await act(() => queryClient.refetchQueries({ queryKey: ['digest'] }));

    expect(
      await screen.findByText('最新のダイジェストを読み込めませんでした')
    ).toBeInTheDocument();
    expect(screen.getByTestId('digest-section')).toBeInTheDocument();
    expect(
      screen.queryByText('ダイジェストを読み込めませんでした')
    ).not.toBeInTheDocument();
  });

  it('前回の内容がある状態で 401 になったら、内容を隠してログインの案内だけを出す', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => digestBody })
      .mockResolvedValueOnce({ ok: false, status: 401 });

    const { queryClient } = renderDigest();
    expect(await screen.findByTestId('digest-section')).toBeInTheDocument();

    await act(() => queryClient.refetchQueries({ queryKey: ['digest'] }));

    expect(
      await screen.findByText('ログインの有効期限が切れました')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('digest-section')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'カテゴリ設定' })
    ).not.toBeInTheDocument();
  });

  it('失敗後の再試行中も、読み込み中の表示に戻さず失敗表示を残す', async () => {
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

    renderDigest();
    await userEvent.click(
      await screen.findByRole('button', { name: '再試行' })
    );

    // 再試行中は aria-disabled で押せない状態にする（disabled だとフォーカスが外れるため。Issue #700）
    expect(
      await screen.findByRole('button', { name: '再試行中…' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText('読み込み中')).not.toBeInTheDocument();

    resolveRetry({ ok: true, json: async () => digestBody });
    expect(await screen.findByTestId('digest-section')).toBeInTheDocument();
  });

  it('401 の後にタブを切り替えて戻っても取り直さず、ログインの案内のまま', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

    renderDigest();
    expect(
      await screen.findByText('ログインの有効期限が切れました')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '今週' }));
    expect(
      await screen.findByText('ログインの有効期限が切れました')
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: '今日' }));

    expect(
      await screen.findByText('ログインの有効期限が切れました')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('ダイジェストを読み込めませんでした')
    ).not.toBeInTheDocument();
    // 今日・今週それぞれ1回だけ（今日に戻ったときに取り直さない）
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('401 の後でも、画面を開き直したら取り直す（ログインし直した後に案内を残さない）', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, json: async () => digestBody });
    // メール・パスワードでのログインはクライアント遷移なので、401 のキャッシュが残る
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <DigestClient />
      </QueryClientProvider>
    );
    expect(
      await screen.findByText('ログインの有効期限が切れました')
    ).toBeInTheDocument();
    view.unmount();

    render(
      <QueryClientProvider client={queryClient}>
        <DigestClient />
      </QueryClientProvider>
    );
    // 取り直しの間は読み込み中。前の 401 を「失敗後の再試行」と取り違えない
    expect(
      screen.queryByText('ダイジェストを読み込めませんでした')
    ).not.toBeInTheDocument();
    expect(screen.getByText('読み込み中')).toBeInTheDocument();

    expect(await screen.findByTestId('digest-section')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
