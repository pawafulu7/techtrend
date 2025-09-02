import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { LoginForm } from '@/components/auth/LoginForm';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// モック
jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockedSignIn = jest.mocked(signIn);
const mockedUseRouter = jest.mocked(useRouter);

describe('LoginForm', () => {
  const mockRouter = {
    push: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseRouter.mockReturnValue(mockRouter as any);
  });

  describe('Rendering', () => {
    it('renders email and password input fields', () => {
      render(<LoginForm />);
      
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
      expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument();
    });

    it('renders with custom callbackUrl', () => {
      const callbackUrl = '/dashboard';
      render(<LoginForm callbackUrl={callbackUrl} />);
      
      expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument();
    });

    it('displays placeholders correctly', () => {
      render(<LoginForm />);
      
      expect(screen.getByPlaceholderText('name@example.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('********')).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('shows error when email is empty', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);
      
      const submitButton = screen.getByRole('button', { name: 'ログイン' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('メールアドレスを入力してください')).toBeInTheDocument();
      });
    });

    it('shows error for invalid email format', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);
      
      const emailInput = screen.getByLabelText('メールアドレス');
      await user.type(emailInput, 'invalid-email');
      
      const submitButton = screen.getByRole('button', { name: 'ログイン' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('有効なメールアドレスを入力してください')).toBeInTheDocument();
      });
    });

    it('shows error when password is empty', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);
      
      const emailInput = screen.getByLabelText('メールアドレス');
      await user.type(emailInput, 'test@example.com');
      
      const submitButton = screen.getByRole('button', { name: 'ログイン' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('パスワードを入力してください')).toBeInTheDocument();
      });
    });

    it('shows error when password is less than 6 characters', async () => {
      const user = userEvent.setup();
      render(<LoginForm />);
      
      const emailInput = screen.getByLabelText('メールアドレス');
      const passwordInput = screen.getByLabelText('パスワード');
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, '12345');
      
      const submitButton = screen.getByRole('button', { name: 'ログイン' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('パスワードは6文字以上である必要があります')).toBeInTheDocument();
      });
    });
  });

  describe('Authentication', () => {
    it('successfully logs in with valid credentials', async () => {
      const user = userEvent.setup();
      mockedSignIn.mockResolvedValue({ ok: true, error: null } as any);
      
      render(<LoginForm />);
      
      const emailInput = screen.getByLabelText('メールアドレス');
      const passwordInput = screen.getByLabelText('パスワード');
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      
      const submitButton = screen.getByRole('button', { name: 'ログイン' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockedSignIn).toHaveBeenCalledWith('credentials', {
          email: 'test@example.com',
          password: 'password123',
          redirect: false,
          callbackUrl: '/',
        });
        expect(mockRouter.push).toHaveBeenCalledWith('/');
        expect(mockRouter.refresh).toHaveBeenCalled();
      });
    });

    it('displays error message for invalid credentials', async () => {
      const user = userEvent.setup();
      mockedSignIn.mockResolvedValue({ 
        ok: false, 
        error: 'CredentialsSignin',
        status: 401,
        url: null 
      } as any);
      
      render(<LoginForm />);
      
      const emailInput = screen.getByLabelText('メールアドレス');
      const passwordInput = screen.getByLabelText('パスワード');
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      
      const submitButton = screen.getByRole('button', { name: 'ログイン' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('メールアドレスまたはパスワードが正しくありません')).toBeInTheDocument();
      });
    });

    it('handles network error gracefully', async () => {
      const user = userEvent.setup();
      mockedSignIn.mockRejectedValue(new Error('Network error'));
      
      render(<LoginForm />);
      
      const emailInput = screen.getByLabelText('メールアドレス');
      const passwordInput = screen.getByLabelText('パスワード');
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      
      const submitButton = screen.getByRole('button', { name: 'ログイン' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('ログイン中にエラーが発生しました')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      
      // 非同期Promise設定
      let resolveSignIn: (value: any) => void;
      const signInPromise = new Promise((resolve) => {
        resolveSignIn = resolve;
      });
      mockedSignIn.mockReturnValue(signInPromise as any);
      
      render(<LoginForm />);
      
      const emailInput = screen.getByLabelText('メールアドレス');
      const passwordInput = screen.getByLabelText('パスワード');
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      
      const submitButton = screen.getByRole('button', { name: 'ログイン' });
      await user.click(submitButton);
      
      // ローディング中の確認
      await waitFor(() => {
        expect(screen.getByText('ログイン中...')).toBeInTheDocument();
        expect(submitButton).toBeDisabled();
      });
      
      // 完了後の確認
      resolveSignIn!({ ok: true, error: null });
      
      await waitFor(() => {
        expect(screen.queryByText('ログイン中...')).not.toBeInTheDocument();
      });
    });

    it('disables inputs during submission', async () => {
      const user = userEvent.setup();
      
      // 非同期Promise設定
      let resolveSignIn: (value: any) => void;
      const signInPromise = new Promise((resolve) => {
        resolveSignIn = resolve;
      });
      mockedSignIn.mockReturnValue(signInPromise as any);
      
      render(<LoginForm />);
      
      const emailInput = screen.getByLabelText('メールアドレス') as HTMLInputElement;
      const passwordInput = screen.getByLabelText('パスワード') as HTMLInputElement;
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      
      const submitButton = screen.getByRole('button', { name: 'ログイン' });
      await user.click(submitButton);
      
      // 入力無効化の確認
      await waitFor(() => {
        expect(emailInput).toBeDisabled();
        expect(passwordInput).toBeDisabled();
      });
      
      // 完了後の確認
      resolveSignIn!({ ok: true, error: null });
      
      await waitFor(() => {
        expect(emailInput).not.toBeDisabled();
        expect(passwordInput).not.toBeDisabled();
      });
    });
  });

  describe('Custom Callback URL', () => {
    it('redirects to custom callbackUrl after successful login', async () => {
      const user = userEvent.setup();
      const customCallbackUrl = '/dashboard';
      mockedSignIn.mockResolvedValue({ ok: true, error: null } as any);
      
      render(<LoginForm callbackUrl={customCallbackUrl} />);
      
      const emailInput = screen.getByLabelText('メールアドレス');
      const passwordInput = screen.getByLabelText('パスワード');
      
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      
      const submitButton = screen.getByRole('button', { name: 'ログイン' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockedSignIn).toHaveBeenCalledWith('credentials', {
          email: 'test@example.com',
          password: 'password123',
          redirect: false,
          callbackUrl: customCallbackUrl,
        });
        expect(mockRouter.push).toHaveBeenCalledWith(customCallbackUrl);
      });
    });
  });
});