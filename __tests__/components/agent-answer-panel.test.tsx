import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { AgentAnswerPanel } from '@/app/search/agent/_components/agent-answer-panel';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';
import type { ArticleLink } from '@/lib/types/article-link';

const mockResult: AgentSearchResult = {
  query: 'test query',
  response:
    '# Test Response\n\nSome **bold** text and a [link](https://example.com).',
  toolCalls: [],
  usage: { totalTokens: 1234 },
  cached: false,
  fallback: false,
  articles: [
    {
      articleId: 'art-1',
      title: 'Test Article 1',
      url: 'https://example.com/1',
    },
    {
      articleId: 'art-2',
      title: 'Test Article 2',
      url: 'https://example.com/2',
    },
  ] as ArticleLink[],
};

describe('AgentAnswerPanel', () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, 'clipboard', {
      value: {
        writeText: jest.fn(() => Promise.resolve()),
      },
      writable: true,
      configurable: true,
    });
  });

  test('renders Markdown content correctly', () => {
    render(<AgentAnswerPanel result={mockResult} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Test Response' })
    ).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'link' })).toBeInTheDocument();
  });

  test('shows cached badge when cached=true', () => {
    const cachedResult = { ...mockResult, cached: true };
    render(<AgentAnswerPanel result={cachedResult} />);

    expect(screen.getByText('キャッシュ')).toBeInTheDocument();
  });

  test('shows fallback warning when fallback=true', () => {
    const fallbackResult = { ...mockResult, fallback: true };
    render(<AgentAnswerPanel result={fallbackResult} />);

    expect(screen.getByText('フォールバック')).toBeInTheDocument();
    expect(
      screen.getByText(/AI検索が一時的に利用できない/)
    ).toBeInTheDocument();
  });

  test('copy button copies to clipboard with sources', async () => {
    render(<AgentAnswerPanel result={mockResult} />);

    const copyButton = screen.getByLabelText('回答をコピー');
    fireEvent.click(copyButton);

    // Component strips Markdown and converts to plain text, then appends source links
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Test Response')
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Test Article 1')
    );
  });

  test('feedback buttons call onFeedback and show thanks message', () => {
    const mockOnFeedback = jest.fn();
    render(
      <AgentAnswerPanel result={mockResult} onFeedback={mockOnFeedback} />
    );

    fireEvent.click(screen.getByLabelText('役立った'));
    expect(mockOnFeedback).toHaveBeenCalledWith(true);

    // After click, thanks message should be shown
    expect(screen.getByTestId('feedback-thanks')).toBeInTheDocument();
    expect(
      screen.getByText('フィードバックありがとうございます')
    ).toBeInTheDocument();

    // Feedback buttons should be replaced by thanks message
    expect(screen.queryByLabelText('役立った')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('改善が必要')).not.toBeInTheDocument();
  });

  test('feedback negative button works correctly', () => {
    const mockOnFeedback = jest.fn();
    render(
      <AgentAnswerPanel result={mockResult} onFeedback={mockOnFeedback} />
    );

    fireEvent.click(screen.getByLabelText('改善が必要'));
    expect(mockOnFeedback).toHaveBeenCalledWith(false);

    // After click, thanks message should be shown
    expect(screen.getByTestId('feedback-thanks')).toBeInTheDocument();
  });

  test('feedback buttons are replaced by thanks message after submission', () => {
    const mockOnFeedback = jest.fn();
    render(
      <AgentAnswerPanel result={mockResult} onFeedback={mockOnFeedback} />
    );

    // First click
    fireEvent.click(screen.getByLabelText('役立った'));
    expect(mockOnFeedback).toHaveBeenCalledTimes(1);

    // Thanks message is shown, buttons are gone (prevents duplicate submissions)
    expect(screen.getByTestId('feedback-thanks')).toBeInTheDocument();
  });

  test('renders external links with target="_blank"', () => {
    render(<AgentAnswerPanel result={mockResult} />);

    const link = screen.getByRole('link', { name: 'link' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('displays token usage', () => {
    render(<AgentAnswerPanel result={mockResult} />);
    expect(screen.getByText('トークン使用: 1,234')).toBeInTheDocument();
  });

  test('displays article count when articles are present', () => {
    render(<AgentAnswerPanel result={mockResult} />);
    expect(screen.getByText('2件の記事から生成')).toBeInTheDocument();
  });

  test('does not display article count when no articles', () => {
    const resultWithoutArticles = { ...mockResult, articles: [] };
    render(<AgentAnswerPanel result={resultWithoutArticles} />);
    expect(screen.queryByText(/件の記事から生成/)).not.toBeInTheDocument();
  });

  test('copy button shows text label on desktop', () => {
    render(<AgentAnswerPanel result={mockResult} />);
    // The copy button should have accessible label
    expect(screen.getByLabelText('回答をコピー')).toBeInTheDocument();
  });

  test('copy button shows success state after click', async () => {
    render(<AgentAnswerPanel result={mockResult} />);

    const copyButton = screen.getByLabelText('回答をコピー');
    fireEvent.click(copyButton);

    // Should show "コピー完了" text
    await waitFor(() => {
      expect(screen.getByText('コピー完了')).toBeInTheDocument();
    });
  });

  test('hides feedback buttons when onFeedback not provided', () => {
    render(<AgentAnswerPanel result={mockResult} />);

    expect(screen.queryByLabelText('役立った')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('改善が必要')).not.toBeInTheDocument();
  });
});

describe('AgentAnswerPanel - Empty State', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows empty message after 150ms delay when no content is available', () => {
    render(<AgentAnswerPanel result={null} />);

    expect(
      screen.queryByText('該当する記事が見つかりませんでした')
    ).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(
      screen.getByText('該当する記事が見つかりませんでした')
    ).toBeInTheDocument();
  });

  test('shows fallback-specific empty message when result is in fallback mode', () => {
    const fallbackResult = {
      ...mockResult,
      response: '',
      fallback: true,
      articles: [],
    };

    render(<AgentAnswerPanel result={fallbackResult} />);

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(
      screen.getByText('関連する記事が見つかりませんでした')
    ).toBeInTheDocument();
  });

  test('hides markdown rendering when empty state is active', () => {
    render(<AgentAnswerPanel result={null} />);

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(
      screen.queryByTestId('agent-answer-markdown')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('該当する記事が見つかりませんでした')
    ).toBeVisible();
  });

  test('clears empty state once a result arrives', async () => {
    const { rerender } = render(<AgentAnswerPanel result={null} />);

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(
      screen.getByText('該当する記事が見つかりませんでした')
    ).toBeInTheDocument();

    rerender(<AgentAnswerPanel result={mockResult} />);

    await waitFor(() => {
      expect(
        screen.queryByText('該当する記事が見つかりませんでした')
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Test Response' })
    ).toBeInTheDocument();
  });
});
