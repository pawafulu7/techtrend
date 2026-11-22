import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import { GateAccessContent } from '../gate-access-content';
import type {
  GateAllowlistEntry,
  GateAllowlistResponse,
} from '@/lib/auth/site-gate/admin-types';

// better-auth の client は ESM のため、実体を読み込ませずにモックする
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn(),
  },
}));

const mockToast = jest.fn();
jest.mock('@/app/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { authClient } from '@/lib/auth/auth-client';

const mockUseSession = authClient.useSession as jest.Mock;
const mockFetch = global.fetch as jest.Mock;

function entry(
  overrides: Partial<GateAllowlistEntry> = {}
): GateAllowlistEntry {
  return {
    id: 'ckgateentry000000000000001',
    email: 'friend@gmail.com',
    createdAt: '2026-11-21T03:00:00.000Z',
    isFixed: false,
    isCurrentGateAccount: false,
    ...overrides,
  };
}

const FIXED = entry({
  id: null,
  email: 'owner@gmail.com',
  createdAt: null,
  isFixed: true,
});
const CURRENT = entry({
  id: 'ckgateentry000000000000002',
  email: 'me@gmail.com',
  isCurrentGateAccount: true,
});
const FRIEND = entry();

function body(
  entries: GateAllowlistEntry[],
  gateEnabled = true
): GateAllowlistResponse {
  return { gateEnabled, maxEntries: 100, entries };
}

function json(status: number, value: unknown = {}) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: async () => value,
  });
}

/** GET の一覧と POST・DELETE の応答を返す */
function routeFetch(handlers: {
  list: () => Promise<unknown>;
  post?: () => Promise<unknown>;
  remove?: () => Promise<unknown>;
}) {
  mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && handlers.post) return handlers.post();
    if (init?.method === 'DELETE' && handlers.remove) return handlers.remove();
    return handlers.list();
  });
}

function renderPage(viewerId = 'admin-1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GateAccessContent viewerId={viewerId} />
    </QueryClientProvider>
  );
}

function rowOf(email: string): HTMLElement {
  const cell = screen.getByText(email);
  return cell.closest('tr') as HTMLElement;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockToast.mockReset();
  mockUseSession.mockReturnValue({
    data: { user: { id: 'admin-1', email: 'admin@example.com' } },
    isPending: false,
  });
});

describe('サイトに入れるアカウントの管理画面', () => {
  it('開いた管理者と別のアカウントに替わっていたら、一覧を出さず取りにも行かない', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'someone-else' } },
      isPending: false,
    });
    routeFetch({ list: () => json(200, body([FRIEND])) });

    renderPage('admin-1');

    expect(
      screen.getByText('ログインの状態が変わりました')
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('固定の行と今使っているアカウントの行には削除ボタンを出さない', async () => {
    routeFetch({ list: () => json(200, body([FIXED, FRIEND, CURRENT])) });
    renderPage();

    await screen.findByText('friend@gmail.com');
    expect(
      within(rowOf('owner@gmail.com')).getByText('設定で固定')
    ).toBeInTheDocument();
    expect(
      within(rowOf('owner@gmail.com')).getByText('なし')
    ).toBeInTheDocument();
    expect(
      within(rowOf('owner@gmail.com')).queryByRole('button')
    ).not.toBeInTheDocument();
    expect(
      within(rowOf('owner@gmail.com')).getByText('削除できません')
    ).toBeInTheDocument();
    expect(
      within(rowOf('me@gmail.com')).getByText('（今使っているアカウント）')
    ).toBeInTheDocument();
    expect(
      within(rowOf('me@gmail.com')).queryByRole('button')
    ).not.toBeInTheDocument();
    expect(
      within(rowOf('friend@gmail.com')).getByRole('button', {
        name: 'friend@gmail.com を削除',
      })
    ).toBeInTheDocument();
    // 固定のアドレスがあるときだけ、消せない理由を表の下に書く
    expect(screen.getByText(/GATE_ALWAYS_ALLOWED_EMAILS/)).toBeInTheDocument();
  });

  it('0 件なら空の行を出し、入口が無効なら注記を出す', async () => {
    routeFetch({ list: () => json(200, body([], false)) });
    renderPage();

    expect(
      await screen.findByText('許可しているアドレスはありません')
    ).toBeInTheDocument();
    expect(screen.getByTestId('gate-disabled-note')).toBeInTheDocument();
    expect(
      screen.queryByText(/GATE_ALWAYS_ALLOWED_EMAILS/)
    ).not.toBeInTheDocument();
  });

  it('読み込みに失敗したら ErrorState を出し、追加欄を使えなくする', async () => {
    routeFetch({ list: () => json(500) });
    renderPage();

    // 401・403 以外の失敗は、1 秒後に 1 回だけ再試行してから失敗を出す（全体の既定と同じ）
    expect(
      await screen.findByText('一覧を読み込めませんでした', undefined, {
        timeout: 3000,
      })
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Gmail アドレス')).toBeDisabled();
  });

  it.each([
    ['入口が切れた（401）', 401, 'GATE_SESSION_REQUIRED', 'サイトに入り直す必要があります'],
    ['入口から外された（403）', 403, 'GATE_NOT_ALLOWED', 'サイトに入り直す必要があります'],
    ['管理者でなくなった（403）', 403, 'ADMIN_REQUIRED', 'この画面には管理者の権限が必要です。'],
    ['アプリのログインが切れた（401）', 401, undefined, 'ログインの有効期限が切れました。もう一度ログインしてから開き直してください。'],
  ] as const)('%s ときは、一覧と追加欄を出さずに案内だけを出す', async (_label, status, code, text) => {
    routeFetch({ list: () => json(status, code ? { success: false, error: 'x', code } : {}) });
    renderPage();

    expect(await screen.findByText(text)).toBeInTheDocument();
    // 取り直しても同じなので再試行しない
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Gmail アドレス')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  describe('追加', () => {
    it('送る前に空と Gmail 以外を止め、入力を直し始めたら赤い表示を外す', async () => {
      const user = userEvent.setup();
      routeFetch({ list: () => json(200, body([FRIEND])) });
      renderPage();
      await screen.findByText('friend@gmail.com');

      const input = screen.getByLabelText('Gmail アドレス');
      await user.click(screen.getByRole('button', { name: '追加' }));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Gmail アドレスを入力してください'
      );
      expect(input).toHaveAttribute('aria-invalid', 'true');

      await user.type(input, 'someone@example.com');
      expect(input).not.toHaveAttribute('aria-invalid');
      await user.click(screen.getByRole('button', { name: '追加' }));
      expect(screen.getByRole('alert')).toHaveTextContent(
        '@gmail.com のアドレスを入力してください'
      );
      expect(
        mockFetch.mock.calls.some(([, init]) => init?.method === 'POST')
      ).toBe(false);
    });

    it('追加したら入力を空にしてフォーカスを残し、正規化した形で知らせ、一覧を取り直す', async () => {
      const user = userEvent.setup();
      routeFetch({
        list: () => json(200, body([FRIEND])),
        post: () =>
          json(201, { entry: entry({ email: 'newperson@gmail.com' }) }),
      });
      renderPage();
      await screen.findByText('friend@gmail.com');
      const listCallsBefore = mockFetch.mock.calls.filter(
        ([, init]) => !init?.method
      ).length;

      const input = screen.getByLabelText('Gmail アドレス');
      await user.type(input, '  New.Person@Gmail.com ');
      await user.click(screen.getByRole('button', { name: '追加' }));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith({
          title: 'newperson@gmail.com を追加しました',
        })
      );
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
      const post = mockFetch.mock.calls.find(
        ([, init]) => init?.method === 'POST'
      );
      expect(JSON.parse(post![1].body)).toEqual({
        email: 'new.person@gmail.com',
      });
      await waitFor(() =>
        expect(
          mockFetch.mock.calls.filter(([, init]) => !init?.method).length
        ).toBeGreaterThan(listCallsBefore)
      );
    });

    it.each([
      [409, 'ALREADY_LISTED', 'このアドレスはすでに一覧にあります', true],
      [409, 'ALREADY_FIXED', 'このアドレスは設定で固定されています', true],
      [400, 'LIST_FULL', 'これ以上追加できません（100 件まで）', true],
      [
        429,
        undefined,
        '操作の回数が多すぎます。しばらく待ってから再試行してください',
        false,
      ],
      [
        500,
        undefined,
        '追加できませんでした。時間をおいて再試行してください',
        false,
      ],
      [
        401,
        'GATE_SESSION_REQUIRED',
        'サイトに入り直す必要があります。ページを開き直してください',
        false,
      ],
    ] as const)(
      '失敗 %s %s は「%s」を出す（入力の誤り: %s）',
      async (status, code, message, isInputError) => {
        const user = userEvent.setup();
        routeFetch({
          list: () => json(200, body([FRIEND])),
          post: () =>
            json(status, code ? { success: false, error: 'x', code } : {}),
        });
        renderPage();
        await screen.findByText('friend@gmail.com');

        const input = screen.getByLabelText('Gmail アドレス');
        await user.type(input, 'someone@gmail.com');
        await user.click(screen.getByRole('button', { name: '追加' }));

        await waitFor(() =>
          expect(screen.getByRole('alert')).toHaveTextContent(message)
        );
        if (isInputError) expect(input).toHaveAttribute('aria-invalid', 'true');
        else expect(input).not.toHaveAttribute('aria-invalid');
        expect(input).toHaveValue('someone@gmail.com');
      }
    );

    it('通信の失敗は既定の文言にする', async () => {
      const user = userEvent.setup();
      mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? Promise.reject(new TypeError('Failed to fetch'))
          : json(200, body([FRIEND]))
      );
      renderPage();
      await screen.findByText('friend@gmail.com');

      await user.type(
        screen.getByLabelText('Gmail アドレス'),
        'someone@gmail.com'
      );
      await user.click(screen.getByRole('button', { name: '追加' }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          '追加できませんでした。時間をおいて再試行してください'
        )
      );
      expect(screen.getByRole('alert')).not.toHaveTextContent(
        'Failed to fetch'
      );
    });

    it('送信中に次のアドレスを打ち始めていたら、追加のあとも消さない', async () => {
      const user = userEvent.setup();
      let resolvePost!: (value: unknown) => void;
      routeFetch({
        list: () => json(200, body([FRIEND])),
        post: () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          }),
      });
      renderPage();
      await screen.findByText('friend@gmail.com');

      const input = screen.getByLabelText('Gmail アドレス');
      await user.type(input, 'first@gmail.com');
      await user.click(screen.getByRole('button', { name: '追加' }));
      await user.clear(input);
      await user.type(input, 'second@gmail.com');
      resolvePost({ status: 201, ok: true, json: async () => ({ entry: entry({ email: 'first@gmail.com' }) }) });

      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      expect(input).toHaveValue('second@gmail.com');
    });

    it('送信中の二重の送信は無視する', async () => {
      const user = userEvent.setup();
      let resolvePost!: (value: unknown) => void;
      routeFetch({
        list: () => json(200, body([FRIEND])),
        post: () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          }),
      });
      renderPage();
      await screen.findByText('friend@gmail.com');

      const input = screen.getByLabelText('Gmail アドレス');
      await user.type(input, 'someone@gmail.com');
      await user.click(screen.getByRole('button', { name: '追加' }));
      // Enter での送信も、処理中は送らない
      await user.type(input, '{Enter}');
      expect(
        mockFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
      ).toHaveLength(1);

      resolvePost({
        status: 201,
        ok: true,
        json: async () => ({ entry: entry({ email: 'someone@gmail.com' }) }),
      });
      await waitFor(() => expect(mockToast).toHaveBeenCalled());
    });
  });

  describe('削除', () => {
    it('確認してから削除し、行が消えたら外枠へフォーカスを戻す', async () => {
      const user = userEvent.setup();
      let listed = [FRIEND, CURRENT];
      routeFetch({
        list: () => json(200, body(listed)),
        remove: () => {
          listed = [CURRENT];
          return json(200, { success: true });
        },
      });
      renderPage();
      await screen.findByText('friend@gmail.com');

      await user.click(
        screen.getByRole('button', { name: 'friend@gmail.com を削除' })
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText(/friend@gmail.com を一覧から削除します/)
      ).toBeInTheDocument();
      expect(dialog).toHaveAccessibleDescription(
        /30 秒ほどでサイトに入れなくなります/
      );

      await user.click(
        within(dialog).getByRole('button', { name: '削除する' })
      );

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(screen.queryByText('friend@gmail.com')).not.toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith({
        title: 'friend@gmail.com を削除しました',
      });
      expect(screen.getByTestId('gate-allowlist-region')).toHaveFocus();
      const remove = mockFetch.mock.calls.find(
        ([, init]) => init?.method === 'DELETE'
      );
      expect(remove![0]).toBe(
        '/api/admin/gate-allowlist/ckgateentry000000000000001'
      );
    });

    it('オフラインでも送信中のまま止めず、失敗を出して閉じられるようにする', async () => {
      const user = userEvent.setup();
      routeFetch({
        list: () => json(200, body([FRIEND])),
        remove: () => Promise.reject(new TypeError('Failed to fetch')),
      });
      renderPage();
      await screen.findByText('friend@gmail.com');
      await user.click(
        screen.getByRole('button', { name: 'friend@gmail.com を削除' })
      );
      const dialog = await screen.findByRole('dialog');

      // 一時停止すると、削除と取り直しが送信中のまま止まり、キャンセルも押せない
      onlineManager.setOnline(false);
      try {
        await user.click(
          within(dialog).getByRole('button', { name: '削除する' })
        );
        expect(
          await within(dialog).findByText(
            '削除できませんでした。時間をおいて再試行してください'
          )
        ).toBeInTheDocument();
        await user.click(
          within(dialog).getByRole('button', { name: 'キャンセル' })
        );
        await waitFor(() =>
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        );
      } finally {
        onlineManager.setOnline(true);
      }
    });

    it('キャンセルしたら開いたボタンへフォーカスを戻す', async () => {
      const user = userEvent.setup();
      routeFetch({ list: () => json(200, body([FRIEND])) });
      renderPage();
      await screen.findByText('friend@gmail.com');

      const opener = screen.getByRole('button', {
        name: 'friend@gmail.com を削除',
      });
      await user.click(opener);
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'キャンセル',
        })
      );

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(opener).toHaveFocus();
      expect(
        mockFetch.mock.calls.some(([, init]) => init?.method === 'DELETE')
      ).toBe(false);
    });

    it.each([
      [404, 'ENTRY_NOT_FOUND', 'このアドレスはすでに一覧から削除されています'],
      [
        409,
        'CANNOT_REMOVE_CURRENT_ACCOUNT',
        '今使っているアカウントは削除できません',
      ],
      [500, undefined, '削除できませんでした。時間をおいて再試行してください'],
    ] as const)(
      '失敗 %s %s はダイアログに「%s」を出す',
      async (status, code, message) => {
        const user = userEvent.setup();
        routeFetch({
          list: () => json(200, body([FRIEND])),
          remove: () =>
            json(status, code ? { success: false, error: 'x', code } : {}),
        });
        renderPage();
        await screen.findByText('friend@gmail.com');

        await user.click(
          screen.getByRole('button', { name: 'friend@gmail.com を削除' })
        );
        const dialog = await screen.findByRole('dialog');
        await user.click(
          within(dialog).getByRole('button', { name: '削除する' })
        );

        await waitFor(() =>
          expect(within(dialog).getByRole('alert')).toHaveTextContent(message)
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      }
    );
  });
});
