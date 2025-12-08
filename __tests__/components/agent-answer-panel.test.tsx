import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { AgentAnswerPanel } from '@/app/search/agent/_components/agent-answer-panel';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

const mockResult: AgentSearchResult = {
  query: 'test query',
  response: '# Test Response\n\nSome **bold** text and a [link](https://example.com).',
  toolCalls: [],
  usage: { totalTokens: 1234 },
  cached: false,
  fallback: false,
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
    render(<AgentAnswerPanel result={mockResult} partialText={null} isStreaming={false} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Test Response' })).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'link' })).toBeInTheDocument();
  });

  test('shows cached badge when cached=true', () => {
    const cachedResult = { ...mockResult, cached: true };
    render(<AgentAnswerPanel result={cachedResult} partialText={null} isStreaming={false} />);

    expect(screen.getByText('キャッシュ')).toBeInTheDocument();
  });

  test('shows fallback warning when fallback=true', () => {
    const fallbackResult = { ...mockResult, fallback: true };
    render(<AgentAnswerPanel result={fallbackResult} partialText={null} isStreaming={false} />);

    expect(screen.getByText('フォールバック')).toBeInTheDocument();
    expect(screen.getByText(/AI検索が一時的に利用できない/)).toBeInTheDocument();
  });

  test('copy button copies to clipboard', async () => {
    render(<AgentAnswerPanel result={mockResult} partialText={null} isStreaming={false} />);

    const copyButton = screen.getByLabelText('回答をコピー');
    fireEvent.click(copyButton);

    // Component strips Markdown and converts to plain text
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'Test Response\nSome bold text and a link.'
    );
  });

  test('feedback buttons call onFeedback', () => {
    const mockOnFeedback = jest.fn();
    render(
      <AgentAnswerPanel
        result={mockResult}
        onFeedback={mockOnFeedback}
        partialText={null}
        isStreaming={false}
      />
    );

    fireEvent.click(screen.getByLabelText('役立った'));
    expect(mockOnFeedback).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText('改善が必要'));
    expect(mockOnFeedback).toHaveBeenCalledWith(false);
  });

  test('renders external links with target="_blank"', () => {
    render(<AgentAnswerPanel result={mockResult} partialText={null} isStreaming={false} />);

    const link = screen.getByRole('link', { name: 'link' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('displays token usage', () => {
    render(<AgentAnswerPanel result={mockResult} partialText={null} isStreaming={false} />);
    expect(screen.getByText('トークン使用: 1,234')).toBeInTheDocument();
  });

  test('hides feedback buttons when onFeedback not provided', () => {
    render(<AgentAnswerPanel result={mockResult} partialText={null} isStreaming={false} />);

    expect(screen.queryByLabelText('役立った')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('改善が必要')).not.toBeInTheDocument();
  });

  test('shows streaming indicator while isStreaming=true', () => {
    render(
      <AgentAnswerPanel
        partialText="Analyzing..."
        isStreaming={true}
        result={null}
      />
    );

    const indicator = screen.getByTestId('streaming-indicator');
    expect(indicator).toBeVisible();
    expect(indicator).toHaveTextContent('AI回答を生成中...');
  });

  test('hides streaming indicator when isStreaming=false', () => {
    render(
      <AgentAnswerPanel
        partialText="chunk"
        isStreaming={false}
        result={null}
      />
    );

    expect(screen.queryByTestId('streaming-indicator')).not.toBeInTheDocument();
  });

  test('renders partial text immediately and updates on rerender', async () => {
    const { rerender } = render(
      <AgentAnswerPanel
        partialText="Hello"
        isStreaming={true}
        result={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeVisible();
    });

    rerender(
      <AgentAnswerPanel
        partialText="Hello World"
        isStreaming={true}
        result={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeVisible();
    });
  });
});

describe('AgentAnswerPanel - Empty State', () => {
  const renderEmptyState = (props?: Partial<ComponentProps<typeof AgentAnswerPanel>>) => {
    return render(
      <AgentAnswerPanel
        result={null}
        partialText={null}
        isStreaming={false}
        {...props}
      />
    );
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows empty message after 150ms delay when no content is available', () => {
    renderEmptyState();

    expect(
      screen.queryByText('該当する記事が見つかりませんでした')
    ).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(screen.getByText('該当する記事が見つかりませんでした')).toBeInTheDocument();
  });

  test('does not show empty message while streaming', () => {
    renderEmptyState({ isStreaming: true });

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(
      screen.queryByText('該当する記事が見つかりませんでした')
    ).not.toBeInTheDocument();
  });

  test('shows fallback-specific empty message when result is in fallback mode', () => {
    const fallbackResult = { ...mockResult, response: '', fallback: true, articles: [] };

    renderEmptyState({ result: fallbackResult });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(screen.getByText('関連する記事が見つかりませんでした')).toBeInTheDocument();
  });

  test('hides markdown rendering when empty state is active', () => {
    renderEmptyState();

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(screen.queryByTestId('agent-answer-markdown')).not.toBeInTheDocument();
    expect(screen.getByText('該当する記事が見つかりませんでした')).toBeVisible();
  });

  test('clears empty state once a result arrives', async () => {
    const { rerender } = renderEmptyState();

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(screen.getByText('該当する記事が見つかりませんでした')).toBeInTheDocument();

    rerender(
      <AgentAnswerPanel
        result={mockResult}
        partialText={null}
        isStreaming={false}
      />
    );

    await waitFor(() => {
      expect(
        screen.queryByText('該当する記事が見つかりませんでした')
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Test Response' })).toBeInTheDocument();
  });
});
