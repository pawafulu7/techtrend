/**
 * 管理画面のユーザー操作（ロール変更・無効化）: サーバーの英語・内部向けの文言をそのまま出さず、
 * ステータスとコードから利用者向けの文言を選ぶ（issue #797）
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserRoleDialog } from '@/app/admin/users/_components/user-role-dialog';
import { UserDisableDialog } from '@/app/admin/users/_components/user-disable-dialog';
import {
  RATE_LIMITED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from '@/lib/utils/action-error-messages';

const ROLE_FAILED =
  'ロールを変更できませんでした。時間をおいて再試行してください';
const DISABLE_FAILED =
  'ユーザーを無効化できませんでした。時間をおいて再試行してください';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function nonJsonResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token U in JSON');
    },
  };
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

const targetUser = {
  id: 'user-2',
  name: 'テストユーザー',
  email: 'user2@example.com',
  role: 'admin' as const,
};

async function submitRoleChange() {
  const user = userEvent.setup();
  renderWithClient(<UserRoleDialog user={targetUser} onClose={jest.fn()} />);
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: /に変更$/ }));
  return dialog;
}

async function submitDisable() {
  const user = userEvent.setup();
  renderWithClient(<UserDisableDialog user={targetUser} onClose={jest.fn()} />);
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: '無効化' }));
  return dialog;
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('UserRoleDialog: 失敗の文言', () => {
  it.each([
    [
      '最後の管理者',
      () =>
        jsonResponse(400, {
          error: 'Cannot demote the last admin',
          code: 'LAST_ADMIN',
        }),
      '管理者がいなくなるため実行できません。先に別のユーザーを管理者にしてください',
    ],
    [
      '自分のロール',
      () =>
        jsonResponse(400, {
          error: 'Cannot change your own role',
          code: 'CANNOT_CHANGE_OWN_ROLE',
        }),
      '自分のロールは変更できません',
    ],
    [
      '対象のユーザーが無い（404）',
      () =>
        jsonResponse(404, { error: 'User not found', code: 'USER_NOT_FOUND' }),
      'ユーザーが見つかりません。ページを再読み込みして一覧を更新してください',
    ],
    [
      '管理者の権限が外れた（403）',
      () =>
        jsonResponse(403, {
          error: 'Forbidden',
          code: 'ADMIN_REQUIRED',
          message: 'Admin access required.',
        }),
      'この操作には管理者の権限が必要です',
    ],
    [
      'セッション切れ（ミドルウェアの 401）',
      () =>
        jsonResponse(401, {
          error: 'Unauthorized',
          message: 'Authentication required.',
        }),
      SESSION_EXPIRED_MESSAGE,
    ],
    [
      '本文が JSON でない 401（Basic 認証など）',
      () => nonJsonResponse(401),
      SESSION_EXPIRED_MESSAGE,
    ],
    [
      'レート制限（429）',
      () =>
        jsonResponse(429, {
          error: 'rate_limited',
          message: 'Rate limit exceeded. Please try again later.',
        }),
      RATE_LIMITED_MESSAGE,
    ],
    [
      'CSRF（403）',
      () =>
        jsonResponse(403, {
          error: 'CSRF validation failed',
          message: 'Invalid origin or referer header',
        }),
      ROLE_FAILED,
    ],
    [
      'コードの無い 500',
      () => jsonResponse(500, { error: 'Internal server error' }),
      ROLE_FAILED,
    ],
  ])('%s', async (_label, response, expected) => {
    global.fetch = jest.fn().mockImplementation(async () => response());

    const dialog = await submitRoleChange();

    expect(await within(dialog).findByText(expected)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/users/user-2',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'changeRole', role: 'user' }),
      })
    );
  });

  it('通信の失敗でも例外の文言を出さない', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const dialog = await submitRoleChange();

    expect(await within(dialog).findByText(ROLE_FAILED)).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/Failed to fetch/)
    ).not.toBeInTheDocument();
  });
});

describe('UserDisableDialog: 失敗の文言', () => {
  it.each([
    [
      '最後の管理者',
      () =>
        jsonResponse(400, {
          error: 'Cannot deactivate the last admin',
          code: 'LAST_ADMIN',
        }),
      '管理者がいなくなるため実行できません。先に別のユーザーを管理者にしてください',
    ],
    [
      '自分のアカウント',
      () =>
        jsonResponse(400, {
          error: 'Cannot deactivate your own account',
          code: 'CANNOT_DEACTIVATE_SELF',
        }),
      '自分のアカウントは無効化できません',
    ],
    [
      '無効化済み',
      () =>
        jsonResponse(400, {
          error: 'User is already deactivated',
          code: 'ALREADY_DEACTIVATED',
        }),
      'このユーザーは既に無効化されています',
    ],
    [
      '本文が JSON でない 401（Basic 認証など）',
      () => nonJsonResponse(401),
      SESSION_EXPIRED_MESSAGE,
    ],
    [
      'CSRF（403）',
      () =>
        jsonResponse(403, {
          error: 'CSRF validation failed',
          message: 'Invalid origin or referer header',
        }),
      DISABLE_FAILED,
    ],
    [
      'Object.prototype の名前のコードは文言の表に当てない',
      () => jsonResponse(400, { error: 'x', code: 'toString' }),
      DISABLE_FAILED,
    ],
  ])('%s', async (_label, response, expected) => {
    global.fetch = jest.fn().mockImplementation(async () => response());

    const dialog = await submitDisable();

    expect(await within(dialog).findByText(expected)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/users/user-2',
      expect.objectContaining({
        body: JSON.stringify({ action: 'deactivate' }),
      })
    );
  });

  it('成功したら閉じる', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { user: { id: 'user-2' } }));
    const onClose = jest.fn();
    const user = userEvent.setup();
    renderWithClient(<UserDisableDialog user={targetUser} onClose={onClose} />);
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: '無効化' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
