import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import VerifyPage from '@/app/auth/verify/page';
import { useSearchParams } from 'next/navigation';

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

const mockedUseSearchParams = jest.mocked(useSearchParams);

// Better Auth の /api/auth/verify-email は、戻り先（/auth/verify?success=true）に
// 失敗時だけ `&error=<コード>` を付けて返す
function renderWith(query: string) {
  mockedUseSearchParams.mockReturnValue(new URLSearchParams(query) as any);
  return render(<VerifyPage />);
}

describe('VerifyPage (#832)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('asks the user to sign in with the password after verification', () => {
    renderWith('success=true');

    expect(
      screen.getByRole('heading', { level: 1, name: '確認完了！' })
    ).toBeInTheDocument();
    // 確認リンクではログインしない（lib/auth/auth.ts の autoSignInAfterVerification）
    expect(
      screen.getByRole('link', { name: 'ログインページへ' })
    ).toHaveAttribute('href', '/auth/login');
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
      renderWith(`success=true&error=${code}`);

      expect(
        screen.getByRole('heading', { level: 1, name: 'エラー' })
      ).toBeInTheDocument();
      expect(screen.queryByText('確認完了！')).not.toBeInTheDocument();
    }
  );

  it('asks the user to check their email when opened without parameters', () => {
    renderWith('');

    expect(
      screen.getByRole('heading', { level: 1, name: 'メールをご確認ください' })
    ).toBeInTheDocument();
  });
});
