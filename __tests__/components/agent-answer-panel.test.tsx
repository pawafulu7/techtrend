import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

    fireEvent.click(screen.getByLabelText('良い'));
    expect(mockOnFeedback).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText('悪い'));
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

    expect(screen.queryByLabelText('良い')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('悪い')).not.toBeInTheDocument();
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
