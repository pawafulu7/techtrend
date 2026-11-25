import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/app/admin/_components/admin-sidebar';
import { GateRequestSection } from '../gate-request-section';
import type { GateAccessRequestEntry } from '@/lib/auth/site-gate/admin-types';

const mockToast = jest.fn();
jest.mock('@/app/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockFetch = global.fetch as jest.Mock;

const TARO: GateAccessRequestEntry = {
  id: 'ckgaterequest0000000000001',
  email: 'tarosuzuki@gmail.com',
  note: '鈴木太郎です。\n紹介で来ました。',
  createdAt: '2026-11-25T03:00:00.000Z',
};
const HANAKO: GateAccessRequestEntry = {
  id: 'ckgaterequest0000000000002',
  email: 'hanako@gmail.com',
  note: null,
  createdAt: '2026-11-24T03:00:00.000Z',
};

function json(status: number, value: unknown = {}) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: async () => value,
  });
}

/** 申請の一覧（GET）と、許可（POST）・却下（DELETE）の応答を返す。許可リストの取り直しには空を返す */
function routeFetch(handlers: {
  requests: () => Promise<unknown>;
  approve?: () => Promise<unknown>;
  reject?: () => Promise<unknown>;
}) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && handlers.approve) return handlers.approve();
    if (init?.method === 'DELETE' && handlers.reject) return handlers.reject();
    if (String(url) === '/api/admin/gate-requests') return handlers.requests();
    return json(200, { gateEnabled: true, maxEntries: 100, entries: [] });
  });
}

function callsTo(url: string, method?: string): unknown[][] {
  return mockFetch.mock.calls.filter(
    ([calledUrl, init]) => String(calledUrl) === url && init?.method === method
  );
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // 許可のあとに許可リストも取り直すことを確かめるため、許可リストのクエリを先に置いておく
  client.setQueryData(['admin', 'gate-allowlist'], { gateEnabled: true, maxEntries: 100, entries: [] });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <GateRequestSection />
    </QueryClientProvider>
  );
  return { invalidate };
}

function rowOf(email: string): HTMLElement {
  return screen.getByText(email).closest('tr') as HTMLElement;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockToast.mockReset();
});

describe('利用の申請の一覧', () => {
  it('申請のアカウント・備考・件数を出し、備考は文字としてだけ出す', async () => {
    routeFetch({
      requests: () =>
        json(200, { requests: [{ ...TARO, note: '<img src=x onerror=alert(1)>' }, HANAKO] }),
    });
    renderSection();

    expect(await screen.findByText('tarosuzuki@gmail.com')).toBeInTheDocument();
    expect(screen.getByTestId('gate-request-count')).toHaveTextContent('2 件');
    expect(screen.getAllByTestId('gate-request-row')).toHaveLength(2);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    // 備考が無い申請は、アカウントだけを出す
    expect(within(rowOf('hanako@gmail.com')).queryByText(/./, { selector: 'p' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'tarosuzuki@gmail.com を許可' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'tarosuzuki@gmail.com の申請を却下' })
    ).toBeInTheDocument();
  });

  it('0 件なら、届いていないことを出し、件数は出さない', async () => {
    routeFetch({ requests: () => json(200, { requests: [] }) });
    renderSection();

    expect(await screen.findByText('届いている申請はありません')).toBeInTheDocument();
    expect(screen.queryByTestId('gate-request-count')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('読み込みに失敗したら、やり直せる失敗の表示を出す', async () => {
    routeFetch({ requests: () => json(500) });
    renderSection();

    expect(
      await screen.findByText('申請を読み込めませんでした', undefined, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '利用の申請' })).toBeInTheDocument();
  });

  it.each([401, 403])(
    '%d のときは、区画を黙って消さずに案内を出し、許可リストも取り直させる',
    async (status) => {
      // 申請の一覧は 1 分ごとに取り直すので、許可リストの側（定期的には取り直さない）より先に失効に気づく。
      // 画面全体の案内は許可リストの側が理由に合わせて出すので、そちらを取り直させる
      routeFetch({ requests: () => json(status) });
      const { invalidate } = renderSection();

      expect(await screen.findByText('申請を表示できません')).toBeInTheDocument();
      expect(
        screen.getByText('ログインの状態が変わりました。このページを開き直してください。')
      ).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'gate-allowlist'] })
      );
      // 申請の一覧は、取り直しても同じなので再試行しない（再試行は 1 秒後。それを過ぎても取り直していない）
      await new Promise((resolve) => setTimeout(resolve, 1300));
      expect(callsTo('/api/admin/gate-requests')).toHaveLength(1);
      // 許可リストの取り直しは 1 回だけ（失敗が続いても繰り返さない）
      expect(
        invalidate.mock.calls.filter(
          ([filters]) => JSON.stringify(filters) === JSON.stringify({ queryKey: ['admin', 'gate-allowlist'] })
        )
      ).toHaveLength(1);
    }
  );

  it('メニューの件数が先に取得を始めても、一時的な失敗は 1 回再試行して一覧を出す', async () => {
    // 同じキーでは、先に取得を始めた側の再試行の設定が使われる。メニューと一覧で設定が食い違うと、
    // 画面を直接開いたとき（メニューが先に取得を始める）に、一覧の側の再試行が効かない
    let calls = 0;
    mockFetch.mockImplementation((url: string) => {
      if (String(url) !== '/api/admin/gate-requests') return json(200, {});
      calls += 1;
      return calls === 1 ? json(500) : json(200, { requests: [TARO] });
    });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <SidebarProvider>
          <AdminSidebar />
          <GateRequestSection />
        </SidebarProvider>
      </QueryClientProvider>
    );

    expect(
      await screen.findByText('tarosuzuki@gmail.com', undefined, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(calls).toBe(2);
    expect(screen.queryByText('申請を読み込めませんでした')).not.toBeInTheDocument();
    // メニューの件数も同じ取得の結果から出る
    expect(screen.getByTestId('gate-request-nav-count')).toHaveTextContent(/^1$/);
  });

  describe('許可', () => {
    it('押すと許可の API を呼び、知らせを出して、申請と許可リストの両方を取り直す', async () => {
      const user = userEvent.setup();
      let requests = [TARO, HANAKO];
      routeFetch({
        requests: () => json(200, { requests }),
        approve: () => {
          requests = [HANAKO];
          return json(200, { status: 'approved', email: 'tarosuzuki@gmail.com' });
        },
      });
      const { invalidate } = renderSection();
      await screen.findByText('tarosuzuki@gmail.com');

      await user.click(screen.getByRole('button', { name: 'tarosuzuki@gmail.com を許可' }));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith({ title: 'tarosuzuki@gmail.com を許可しました' })
      );
      expect(
        callsTo('/api/admin/gate-requests/ckgaterequest0000000000001/approve', 'POST')
      ).toHaveLength(1);
      await waitFor(() =>
        expect(screen.queryByText('tarosuzuki@gmail.com')).not.toBeInTheDocument()
      );
      expect(screen.getByText('hanako@gmail.com')).toBeInTheDocument();
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'gate-requests'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'gate-allowlist'] });
      // 行が消えるので、フォーカスは区画へ戻す
      expect(screen.getByTestId('gate-request-section')).toHaveFocus();
    });

    it('すでに許可されていたら、そのことを知らせる', async () => {
      const user = userEvent.setup();
      routeFetch({
        requests: () => json(200, { requests: [TARO] }),
        approve: () => json(200, { status: 'already_allowed', email: 'tarosuzuki@gmail.com' }),
      });
      renderSection();
      await screen.findByText('tarosuzuki@gmail.com');
      await user.click(screen.getByRole('button', { name: 'tarosuzuki@gmail.com を許可' }));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith({
          title: 'tarosuzuki@gmail.com はすでに許可されています',
        })
      );
    });

    it.each([
      [400, 'LIST_FULL', 'これ以上追加できません（100 件まで）'],
      [404, 'REQUEST_NOT_FOUND', 'この申請はすでに対応済みです'],
      [500, undefined, '許可できませんでした。時間をおいて再試行してください'],
      // 応答の形が違う（status が知らない値）ときも、成功として扱わない
      [200, undefined, '許可できませんでした。時間をおいて再試行してください'],
    ])('失敗（%d %s）は文言を出し、知らせは出さない', async (status, code, message) => {
      const user = userEvent.setup();
      routeFetch({
        requests: () => json(200, { requests: [TARO] }),
        approve: () => json(status, code ? { success: false, error: 'x', code } : {}),
      });
      renderSection();
      await screen.findByText('tarosuzuki@gmail.com');
      await user.click(screen.getByRole('button', { name: 'tarosuzuki@gmail.com を許可' }));

      expect(await screen.findByTestId('gate-request-error')).toHaveTextContent(message);
      expect(mockToast).not.toHaveBeenCalled();
    });

    it('すでに対応済みで行が消えていたら、文言を出してフォーカスを区画へ戻す', async () => {
      const user = userEvent.setup();
      let requests = [TARO, HANAKO];
      routeFetch({
        requests: () => json(200, { requests }),
        approve: () => {
          // 別の管理者が先に対応していた。取り直すと行が無い
          requests = [HANAKO];
          return json(404, { success: false, error: 'x', code: 'REQUEST_NOT_FOUND' });
        },
      });
      renderSection();
      await screen.findByText('tarosuzuki@gmail.com');
      await user.click(screen.getByRole('button', { name: 'tarosuzuki@gmail.com を許可' }));

      expect(await screen.findByTestId('gate-request-error')).toHaveTextContent(
        'この申請はすでに対応済みです'
      );
      expect(screen.queryByText('tarosuzuki@gmail.com')).not.toBeInTheDocument();
      expect(screen.getByTestId('gate-request-section')).toHaveFocus();
    });

    it('通信の失敗は既定の文言にする', async () => {
      const user = userEvent.setup();
      routeFetch({
        requests: () => json(200, { requests: [TARO] }),
        approve: () => Promise.reject(new TypeError('Failed to fetch')),
      });
      renderSection();
      await screen.findByText('tarosuzuki@gmail.com');
      await user.click(screen.getByRole('button', { name: 'tarosuzuki@gmail.com を許可' }));

      const error = await screen.findByTestId('gate-request-error');
      expect(error).toHaveTextContent('許可できませんでした。時間をおいて再試行してください');
      expect(error).not.toHaveTextContent('Failed to fetch');
    });

    it('送信中は、ほかの行の許可と却下を押せなくする', async () => {
      const user = userEvent.setup();
      let finish: (value: unknown) => void = () => undefined;
      routeFetch({
        requests: () => json(200, { requests: [TARO, HANAKO] }),
        approve: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      });
      renderSection();
      await screen.findByText('tarosuzuki@gmail.com');
      await user.click(screen.getByRole('button', { name: 'tarosuzuki@gmail.com を許可' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'hanako@gmail.com を許可' })).toBeDisabled()
      );
      expect(
        screen.getByRole('button', { name: 'hanako@gmail.com の申請を却下' })
      ).toBeDisabled();
      finish(await json(200, { status: 'approved', email: 'tarosuzuki@gmail.com' }));
      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      expect(callsTo('/api/admin/gate-requests/ckgaterequest0000000000001/approve', 'POST')).toHaveLength(1);
    });
  });

  describe('却下', () => {
    it('確認してから却下し、知らせを出して一覧を取り直す', async () => {
      const user = userEvent.setup();
      let requests = [TARO];
      routeFetch({
        requests: () => json(200, { requests }),
        reject: () => {
          requests = [];
          return json(200, { success: true });
        },
      });
      renderSection();
      await screen.findByText('tarosuzuki@gmail.com');

      await user.click(
        screen.getByRole('button', { name: 'tarosuzuki@gmail.com の申請を却下' })
      );
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('tarosuzuki@gmail.com の申請を一覧から消します。');
      // 確認するまでは送らない
      expect(callsTo('/api/admin/gate-requests/ckgaterequest0000000000001', 'DELETE')).toHaveLength(0);

      await user.click(within(dialog).getByRole('button', { name: '却下する' }));

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith({
          title: 'tarosuzuki@gmail.com の申請を却下しました',
        })
      );
      expect(callsTo('/api/admin/gate-requests/ckgaterequest0000000000001', 'DELETE')).toHaveLength(1);
      expect(await screen.findByText('届いている申請はありません')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('キャンセルしたら送らず、開いたボタンへフォーカスを戻す', async () => {
      const user = userEvent.setup();
      routeFetch({ requests: () => json(200, { requests: [TARO] }) });
      renderSection();
      await screen.findByText('tarosuzuki@gmail.com');
      const opener = screen.getByRole('button', { name: 'tarosuzuki@gmail.com の申請を却下' });

      await user.click(opener);
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'キャンセル' })
      );

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockFetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
      await waitFor(() => expect(opener).toHaveFocus());
    });

    it('却下でログイン切れ（401）が分かったら、確認を閉じて許可リストも取り直し、あとで勝手に開き直さない', async () => {
      const user = userEvent.setup();
      let listStatus = 200;
      routeFetch({
        requests: () => (listStatus === 200 ? json(200, { requests: [TARO] }) : json(listStatus)),
        reject: () => {
          listStatus = 401;
          return json(401);
        },
      });
      const { invalidate } = renderSection();
      await screen.findByText('tarosuzuki@gmail.com');
      await user.click(
        screen.getByRole('button', { name: 'tarosuzuki@gmail.com の申請を却下' })
      );
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: '却下する' })
      );

      // 一覧の代わりに案内を出す（画面全体の案内は、同じ失敗になる許可リストの側が出す）
      expect(await screen.findByText('申請を表示できません')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '利用の申請' })).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'gate-allowlist'] });

      // 入り直して一覧が読めるようになっても、確認のダイアログは開き直さない
      listStatus = 200;
      await invalidate.mock.contexts[0].invalidateQueries({ queryKey: ['admin', 'gate-requests'] });
      expect(await screen.findByText('tarosuzuki@gmail.com')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('失敗したら、ダイアログの中に文言を出して閉じない', async () => {
      const user = userEvent.setup();
      routeFetch({
        requests: () => json(200, { requests: [TARO] }),
        reject: () => json(404, { success: false, error: 'x', code: 'REQUEST_NOT_FOUND' }),
      });
      renderSection();
      await screen.findByText('tarosuzuki@gmail.com');
      await user.click(
        screen.getByRole('button', { name: 'tarosuzuki@gmail.com の申請を却下' })
      );
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: '却下する' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'この申請はすでに対応済みです'
      );
      expect(mockToast).not.toHaveBeenCalled();
    });
  });
});
