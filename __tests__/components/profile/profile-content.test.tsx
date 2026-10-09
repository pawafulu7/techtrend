/**
 * プロフィール: 取得の失敗は生の error.message ではなく利用者向けの文言と再試行で示す（issue #701）
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ProfileContent } from '@/app/profile/_components/profile-content';

jest.mock('@/components/profile/ProfileForm', () => ({
  ProfileForm: () => <div data-testid="profile-form" />,
}));
jest.mock('@/components/profile/PasswordChangeForm', () => ({
  PasswordChangeForm: () => null,
}));
jest.mock('@/components/profile/DeleteAccountDialog', () => ({
  DeleteAccountDialog: () => null,
}));

const profile = {
  id: 'u1',
  email: 'user@example.test',
  name: 'User',
  image: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true,
  providers: [],
};

describe('ProfileContent: 取得の失敗（issue #701）', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('失敗したら利用者向けの文言と再試行を出し、再試行で取り直す', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => profile });

    render(<ProfileContent />);

    expect(
      await screen.findByText('プロフィール情報を読み込めませんでした')
    ).toBeInTheDocument();
    // 生の error.message（フック内の文言）を連結して出さない
    expect(screen.queryByText(/取得に失敗しました:/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '再試行' }));

    expect(await screen.findByTestId('profile-form')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('401 のときは再試行ではなくログインへの導線を出す', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

    render(<ProfileContent />);

    expect(
      await screen.findByText('ログインの有効期限が切れました')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ログインする' })).toHaveAttribute(
      'href',
      '/auth/login?callbackUrl=%2Fprofile'
    );
    expect(
      screen.queryByRole('button', { name: '再試行' })
    ).not.toBeInTheDocument();
  });

  it('失敗後の再試行中も、スケルトンに戻さず失敗表示を残す', async () => {
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

    render(<ProfileContent />);
    await userEvent.click(
      await screen.findByRole('button', { name: '再試行' })
    );

    // 再試行中は aria-disabled で押せない状態にする（disabled だとフォーカスが外れるため。Issue #700）
    expect(
      await screen.findByRole('button', { name: '再試行中…' })
    ).toHaveAttribute('aria-disabled', 'true');

    resolveRetry({ ok: true, json: async () => profile });
    expect(await screen.findByTestId('profile-form')).toBeInTheDocument();
  });

  it('アンマウントしたら、進行中の取得を中断する', () => {
    let receivedSignal: AbortSignal | undefined;
    global.fetch = jest
      .fn()
      .mockImplementation((_url: string, init?: RequestInit) => {
        receivedSignal = init?.signal ?? undefined;
        return new Promise(() => {});
      });

    const { unmount } = render(<ProfileContent />);
    expect(receivedSignal?.aborted).toBe(false);
    unmount();

    expect(receivedSignal?.aborted).toBe(true);
  });
});
