import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import VerifyPage from '@/app/auth/verify/page';
import { authClient } from '@/lib/auth/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';

jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn(),
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const mockedUseSession = jest.mocked(authClient.useSession);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseSearchParams = jest.mocked(useSearchParams);

// Better Auth の /api/auth/verify-email は、戻り先（/auth/verify?success=true）に
// 失敗時だけ `&error=<コード>` を付けて返す
function renderWith(query: string, session: unknown = null) {
  mockedUseSearchParams.mockReturnValue(new URLSearchParams(query) as any);
  mockedUseSession.mockReturnValue({ data: session, isPending: false } as any);
  return render(<VerifyPage />);
}

describe('VerifyPage (#832)', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockedUseRouter.mockReturnValue({ push } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows that the user is signed in and moves to home after verification', () => {
    renderWith('success=true', { user: { id: 'u1' } });

    expect(
      screen.getByRole('heading', { level: 1, name: '確認完了！' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('ログインしました。まもなくホームページへ移動します...')
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(push).toHaveBeenCalledWith('/');
  });

  it('links to the login page when verification left the user signed out', () => {
    renderWith('success=true');

    expect(
      screen.getByRole('link', { name: 'ログインページへ' })
    ).toHaveAttribute('href', '/auth/login');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('treats TOKEN_EXPIRED as expired even though success=true is in the URL', () => {
    renderWith('success=true&error=TOKEN_EXPIRED');

    expect(
      screen.getByRole('heading', { level: 1, name: '期限切れ' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'ログインして確認メールを再送信' })
    ).toHaveAttribute('href', '/auth/login');
    expect(screen.queryByText('確認完了！')).not.toBeInTheDocument();
  });

  it.each(['INVALID_TOKEN', 'USER_NOT_FOUND'])(
    'shows the error state for %s',
    (code) => {
      renderWith(`success=true&error=${code}`, { user: { id: 'u1' } });

      expect(
        screen.getByRole('heading', { level: 1, name: 'エラー' })
      ).toBeInTheDocument();
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(push).not.toHaveBeenCalled();
    }
  );

  it('asks the user to check their email when opened without parameters', () => {
    renderWith('');

    expect(
      screen.getByRole('heading', { level: 1, name: 'メールをご確認ください' })
    ).toBeInTheDocument();
  });
});
