import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EmailSignupForm } from '@/components/auth/EmailSignupForm';
import { authClient } from '@/lib/auth/auth-client';

jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
  useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
}));

const mockedSignUpEmail = jest.mocked(authClient.signUp.email);

async function fillAndSubmit() {
  const user = userEvent.setup();
  render(<EmailSignupForm />);

  await user.type(screen.getByLabelText('メールアドレス'), 'new@example.com');
  await user.type(screen.getByLabelText('パスワード'), 'Password123!');
  await user.type(screen.getByLabelText('パスワード（確認）'), 'Password123!');
  await user.click(screen.getByRole('button', { name: 'アカウント作成' }));
}

describe('EmailSignupForm (#832)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    // 削除済みの独自 API（/api/auth/register-with-email）を呼ばないことを確かめる
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('signs up through Better Auth and shows the verification email notice', async () => {
    mockedSignUpEmail.mockResolvedValue({
      data: { token: null, user: {} },
      error: null,
    } as any);

    await fillAndSubmit();

    await waitFor(() => {
      expect(
        screen.getByText('確認メールを送信しました！')
      ).toBeInTheDocument();
    });
    expect(mockedSignUpEmail).toHaveBeenCalledWith({
      name: '',
      email: 'new@example.com',
      password: 'Password123!',
      callbackURL: '/auth/verify?success=true',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows a Japanese message when Better Auth rejects the request', async () => {
    mockedSignUpEmail.mockResolvedValue({
      data: null,
      error: { message: 'Too many requests', status: 429 },
    } as any);

    await fillAndSubmit();

    expect(
      await screen.findByText(
        'リクエストが多すぎます。しばらくしてからもう一度お試しください。'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('確認メールを送信しました！')
    ).not.toBeInTheDocument();
  });

  it('shows a generic message when the request throws', async () => {
    mockedSignUpEmail.mockRejectedValue(new Error('Network error'));

    await fillAndSubmit();

    expect(
      await screen.findByText(
        'エラーが発生しました。しばらくしてからお試しください。'
      )
    ).toBeInTheDocument();
  });
});
