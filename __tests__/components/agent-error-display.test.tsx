import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { AgentErrorDisplay } from '@/app/search/agent/_components/agent-error-display';
import type { AgentSearchError } from '@/lib/hooks/useAgentSearch';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

describe('AgentErrorDisplay', () => {
  const mockRouter = {
    push: jest.fn(),
  };

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    mockRouter.push.mockClear();
  });

  test('renders 401 error with login button', () => {
    const error: AgentSearchError = { status: 401, message: 'Unauthorized' };
    render(<AgentErrorDisplay error={error} />);

    expect(screen.getByText('認証が必要です')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ログイン/ })).toBeInTheDocument();

    const loginButton = screen.getByRole('button', { name: /ログイン/ });
    fireEvent.click(loginButton);

    expect(mockRouter.push).toHaveBeenCalledWith('/auth/login?callbackUrl=/search/agent');
  });

  test('renders 429 error with retry button and countdown', () => {
    const error: AgentSearchError = { status: 429, message: 'Rate limit', retryAfter: 120 };
    const mockOnRetry = jest.fn();
    render(<AgentErrorDisplay error={error} onRetry={mockOnRetry} />);

    expect(screen.getByText('レート制限に達しました')).toBeInTheDocument();
    expect(screen.getByText('120秒後に再試行できます。')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /再試行/ });
    expect(retryButton).toBeDisabled();
  });

  test('retry button calls onRetry when enabled', () => {
    const error: AgentSearchError = { status: 500, message: 'Server error' };
    const mockOnRetry = jest.fn();
    render(<AgentErrorDisplay error={error} onRetry={mockOnRetry} />);

    const retryButton = screen.getByRole('button', { name: /再試行/ });
    expect(retryButton).not.toBeDisabled();

    fireEvent.click(retryButton);
    expect(mockOnRetry).toHaveBeenCalled();
  });

  test('renders timeout error (408)', () => {
    const error: AgentSearchError = { status: 408, message: 'Request timeout (30s)' };
    render(<AgentErrorDisplay error={error} />);

    expect(screen.getByText('タイムアウト')).toBeInTheDocument();
    expect(screen.getByText(/ネットワーク接続を確認/)).toBeInTheDocument();
  });

  test('renders network error (0)', () => {
    const error: AgentSearchError = { status: 0, message: 'Network failure' };
    render(<AgentErrorDisplay error={error} />);

    expect(screen.getByText('ネットワークエラー')).toBeInTheDocument();
  });

  test('shows error details when provided', () => {
    const error: AgentSearchError = {
      status: 500,
      message: 'Server error',
      details: { code: 'INTERNAL_ERROR', trace: 'stack trace' },
    };
    render(<AgentErrorDisplay error={error} />);

    const detailsToggle = screen.getByText('詳細を表示');
    expect(detailsToggle).toBeInTheDocument();

    fireEvent.click(detailsToggle);

    expect(screen.getByText(/"code": "INTERNAL_ERROR"/)).toBeInTheDocument();
  });
});
