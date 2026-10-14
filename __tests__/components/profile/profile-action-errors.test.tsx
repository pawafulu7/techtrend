/**
 * プロフィールの更新操作（パスワード変更・退会）: サーバーの英語・内部向けの文言をそのまま出さず、
 * ステータスとコードから利用者向けの文言を選ぶ（issue #729）
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PasswordChangeForm } from '@/components/profile/PasswordChangeForm';
import { DeleteAccountDialog } from '@/components/profile/DeleteAccountDialog';
import {
  RATE_LIMITED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from '@/components/profile/profile-action-errors';

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: { signOut: jest.fn() },
}));

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function lastToastDescription() {
  const calls = mockToast.mock.calls;
  return calls[calls.length - 1]?.[0]?.description;
}

describe('PasswordChangeForm: 失敗の文言', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  async function submit() {
    const user = userEvent.setup();
    render(<PasswordChangeForm />);
    await user.type(screen.getByLabelText('現在のパスワード'), 'OldPass123');
    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPass123');
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPass123'
    );
    await user.click(screen.getByRole('button', { name: /パスワードを変更/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    return lastToastDescription();
  }

  it.each([
    [
      '現在のパスワードの誤り',
      () =>
        jsonResponse(400, {
          error: 'Current password is incorrect',
          code: 'INVALID_CURRENT_PASSWORD',
        }),
      '現在のパスワードが正しくありません',
    ],
    [
      'セッション切れ（ミドルウェアの 401）',
      () =>
        jsonResponse(401, {
          error: 'Session invalid',
          message: 'Your session is no longer valid. Please sign in again.',
        }),
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
      '本文が JSON でない 502',
      () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      }),
      'パスワードを変更できませんでした。時間をおいて再試行してください',
    ],
  ])('%s', async (_label, response, expected) => {
    global.fetch = jest.fn().mockImplementation(async () => response());

    const description = await submit();

    expect(description).toBe(expected);
  });

  it('通信の失敗でも例外の文言を出さない', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const description = await submit();

    expect(description).toBe(
      'パスワードを変更できませんでした。時間をおいて再試行してください'
    );
  });
});

describe('DeleteAccountDialog: 失敗の文言', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  async function submit() {
    const user = userEvent.setup();
    render(<DeleteAccountDialog hasPassword />);
    await user.click(screen.getByRole('button', { name: 'アカウントを削除' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('現在のパスワード'), 'pw');
    await user.type(within(dialog).getByLabelText(/確認のため/), 'DELETE');
    await user.click(
      within(dialog).getByRole('button', { name: 'アカウントを削除' })
    );
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    return lastToastDescription();
  }

  it('API のコードの文言（利用者向けの日本語）はそのまま出す', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(500, {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'アカウント削除中にエラーが発生しました',
      })
    );

    expect(await submit()).toBe('アカウント削除中にエラーが発生しました');
  });

  it('本文が JSON でない 401（Basic 認証など）でも、ステータスから文言を選ぶ', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => {
        throw new SyntaxError('Unexpected token U in JSON');
      },
    });

    expect(await submit()).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it.each([
    [
      'セッション切れ（ミドルウェアの 401）',
      401,
      { error: 'Unauthorized', message: 'Authentication required' },
      SESSION_EXPIRED_MESSAGE,
    ],
    [
      'レート制限（429）',
      429,
      {
        error: 'rate_limited',
        message: 'Rate limit exceeded. Please try again later.',
      },
      RATE_LIMITED_MESSAGE,
    ],
    [
      'CSRF（403）',
      403,
      {
        error: 'CSRF validation failed',
        message: 'Invalid origin or referer header',
      },
      'アカウントを削除できませんでした。時間をおいて再試行してください',
    ],
  ])(
    'ミドルウェアの英語の文言は出さない: %s',
    async (_label, status, body, expected) => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(status, body));

      expect(await submit()).toBe(expected);
    }
  );
});
