import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminSidebar } from '../admin-sidebar';

const mockFetch = global.fetch as jest.Mock;

function json(status: number, value: unknown = {}) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: async () => value,
  });
}

function request(id: string) {
  return { id, email: `${id}@gmail.com`, note: null, createdAt: '2026-11-25T03:00:00.000Z' };
}

function renderSidebar() {
  // 再試行の設定は部品の側（共通の取得の設定）のものを確かめたいので、QueryClient の既定は変えない
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <AdminSidebar />
      </SidebarProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('管理画面のメニュー', () => {
  it('対応待ちの利用の申請の件数を「サイトに入れるアカウント」の横に出す', async () => {
    mockFetch.mockImplementation(() => json(200, { requests: [request('a'), request('b')] }));
    renderSidebar();

    const badge = await screen.findByTestId('gate-request-nav-count');
    expect(badge).toHaveTextContent(/^2$/);
    // 見える件数は飾りにし、読み上げ用の件数はリンクの名前に入れる（Tab でリンクに来たときに読まれる）
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    const link = screen.getByRole('link', {
      name: /^サイトに入れるアカウント\s*（対応待ちの申請 2 件）$/,
    });
    // 件数は「サイトに入れるアカウント」の項目に付く
    expect(badge.closest('li')).toContainElement(link);
    expect(mockFetch).toHaveBeenCalledWith('/api/admin/gate-requests', expect.anything());
    expect(screen.getAllByTestId('gate-request-nav-count')).toHaveLength(1);
  });

  it('0 件なら件数を出さない', async () => {
    mockFetch.mockImplementation(() => json(200, { requests: [] }));
    renderSidebar();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('link', { name: 'サイトに入れるアカウント' })).toBeInTheDocument();
    expect(screen.queryByTestId('gate-request-nav-count')).not.toBeInTheDocument();
  });

  it.each([401, 403])('ログイン切れ・権限なし（%d）は件数を出さず、再試行もしない', async (status) => {
    mockFetch.mockImplementation(() => json(status));
    renderSidebar();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('link', { name: '問い合わせ' })).toBeInTheDocument();
    expect(screen.queryByTestId('gate-request-nav-count')).not.toBeInTheDocument();
    // 再試行は 1 秒後。それを過ぎても取り直していない
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('読めたあとの取り直しで権限なし（403）になったら、前の件数を出し続けない', async () => {
    let status = 200;
    mockFetch.mockImplementation(() =>
      status === 200 ? json(200, { requests: [request('a'), request('b')] }) : json(status)
    );
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <SidebarProvider>
          <AdminSidebar />
        </SidebarProvider>
      </QueryClientProvider>
    );
    expect(await screen.findByTestId('gate-request-nav-count')).toHaveTextContent(/^2$/);

    status = 403;
    await client.invalidateQueries({ queryKey: ['admin', 'gate-requests'] });
    await waitFor(() =>
      expect(screen.queryByTestId('gate-request-nav-count')).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole('link', { name: 'サイトに入れるアカウント' })
    ).toBeInTheDocument();
  });

  it('一時的な失敗（500）は 1 回だけ再試行し、読めたら件数を出す', async () => {
    mockFetch
      .mockImplementationOnce(() => json(500))
      .mockImplementation(() => json(200, { requests: [request('a')] }));
    renderSidebar();

    expect(
      await screen.findByTestId('gate-request-nav-count', undefined, { timeout: 3000 })
    ).toHaveTextContent(/^1$/);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
