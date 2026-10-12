import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InquiriesPageContent } from '../inquiries-page-content';
import type { InquiryListItem } from '@/lib/inquiries/types';

// better-auth の client は ESM のため、実体を読み込ませずにモックする
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn(),
  },
}));

import { authClient } from '@/lib/auth/auth-client';

const mockUseSession = authClient.useSession as jest.Mock;
const mockFetch = global.fetch as jest.Mock;

function item(overrides: Partial<InquiryListItem> = {}): InquiryListItem {
  return {
    id: 'inq-a',
    category: 'BUG_REPORT',
    status: 'OPEN',
    message: '問い合わせ A の本文',
    contactEmail: null,
    createdAt: '2026-10-12T01:00:00.000Z',
    updatedAt: '2026-10-12T01:00:00.000Z',
    user: null,
    ...overrides,
  };
}

function json(status: number, body: unknown = {}) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
}

function listBody(items: InquiryListItem[]) {
  const open = items.filter((i) => i.status === 'OPEN').length;
  return {
    data: items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
    counts: { OPEN: open, IN_PROGRESS: 0, RESOLVED: 0, all: items.length },
  };
}

/** GET の一覧と PATCH の応答を、呼ばれた順に返す */
function routeFetch(handlers: {
  list: () => Promise<unknown>;
  patch?: () => Promise<unknown>;
}) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === 'PATCH' && handlers.patch
      ? handlers.patch()
      : handlers.list()
  );
}

function renderPage(viewerId = 'admin-1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <InquiriesPageContent viewerId={viewerId} />
    </QueryClientProvider>
  );
}

async function openDetail(
  user: ReturnType<typeof userEvent.setup>,
  message: string
) {
  await user.click(await screen.findByRole('button', { name: message }));
  return screen.findByTestId('inquiry-detail-dialog');
}

beforeEach(() => {
  mockFetch.mockReset();
  mockUseSession.mockReturnValue({
    data: { user: { id: 'admin-1', email: 'admin@example.com' } },
    isPending: false,
  });
});

describe('管理画面の問い合わせ一覧', () => {
  it('開いた管理者と別のアカウントに替わっていたら、一覧を出さず取りにも行かない', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'someone-else', email: 'x@example.com' } },
      isPending: false,
    });
    routeFetch({ list: () => json(200, listBody([item()])) });

    renderPage('admin-1');

    expect(
      screen.getByText('ログインの状態が変わりました')
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('更新の失敗は、その問い合わせの詳細にだけ出す（別の問い合わせへ持ち越さない）', async () => {
    const user = userEvent.setup();
    const a = item();
    const b = item({ id: 'inq-b', message: '問い合わせ B の本文' });
    routeFetch({
      list: () => json(200, listBody([a, b])),
      patch: () => json(500, {}),
    });
    renderPage();

    const dialogA = await openDetail(user, a.message);
    await user.click(within(dialogA).getByRole('button', { name: '完了' }));
    expect(
      await within(dialogA).findByText(
        '対応状況を変えられませんでした。もう一度押してください'
      )
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByTestId('inquiry-detail-dialog')
      ).not.toBeInTheDocument()
    );

    const dialogB = await openDetail(user, b.message);
    expect(within(dialogB).getByText(b.message)).toBeInTheDocument();
    expect(
      within(dialogB).queryByText(
        '対応状況を変えられませんでした。もう一度押してください'
      )
    ).not.toBeInTheDocument();
  });

  it('最後の1件を「完了」にして閉じると、一覧の外枠にフォーカスを戻す', async () => {
    const user = userEvent.setup();
    const a = item();
    let listed: InquiryListItem[] = [a];
    routeFetch({
      list: () => json(200, listBody(listed)),
      patch: () => {
        listed = [];
        return json(200, { data: { ...a, status: 'RESOLVED' } });
      },
    });
    renderPage();

    const dialog = await openDetail(user, a.message);
    await user.click(within(dialog).getByRole('button', { name: '完了' }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: '完了' })
      ).toHaveAttribute('aria-pressed', 'true')
    );
    expect(
      await screen.findByText('未対応の問い合わせはありません')
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.getByTestId('inquiries-region')).toHaveFocus()
    );
  });

  it('取り直しで 401 になったら、開いている詳細を閉じる', async () => {
    const user = userEvent.setup();
    const a = item();
    let unauthorized = false;
    routeFetch({
      list: () => (unauthorized ? json(401) : json(200, listBody([a]))),
      patch: () => {
        unauthorized = true;
        return json(200, { data: { ...a, status: 'IN_PROGRESS' } });
      },
    });
    renderPage();

    const dialog = await openDetail(user, a.message);
    await user.click(within(dialog).getByRole('button', { name: '対応中' }));

    await waitFor(() =>
      expect(
        screen.queryByTestId('inquiry-detail-dialog')
      ).not.toBeInTheDocument()
    );
    expect(
      await screen.findByText('問い合わせを読み込めませんでした')
    ).toBeInTheDocument();
  });

  it('返信先のメールが確認されていなければ「本人確認はしていません」と添える', async () => {
    const user = userEvent.setup();
    const unverified = item({
      contactEmail: 'u1@example.com',
      user: {
        id: 'u1',
        name: 'User One',
        email: 'u1@example.com',
        emailVerified: false,
        deletedAt: null,
      },
    });
    const verified = item({
      id: 'inq-b',
      message: '問い合わせ B の本文',
      contactEmail: 'u2@example.com',
      user: {
        id: 'u2',
        name: 'User Two',
        email: 'u2@example.com',
        emailVerified: true,
        deletedAt: null,
      },
    });
    routeFetch({ list: () => json(200, listBody([unverified, verified])) });
    renderPage();

    const first = await openDetail(user, unverified.message);
    expect(
      within(first).getByText('（本人確認はしていません）')
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByTestId('inquiry-detail-dialog')
      ).not.toBeInTheDocument()
    );

    const second = await openDetail(user, verified.message);
    expect(
      within(second).queryByText('（本人確認はしていません）')
    ).not.toBeInTheDocument();
  });
});
