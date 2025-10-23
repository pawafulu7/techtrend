import { render, screen, fireEvent } from '@testing-library/react';
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
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve()),
      },
    });
  });

  test('renders Markdown content correctly', () => {
    render(<AgentAnswerPanel result={mockResult} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Test Response' })).toBeInTheDocument();
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
    expect(screen.getByText(/AI検索が一時的に利用できない/)).toBeInTheDocument();
  });

  test('copy button copies to clipboard', async () => {
    render(<AgentAnswerPanel result={mockResult} />);

    const copyButton = screen.getByLabelText('回答をコピー');
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockResult.response);
  });

  test('copy button calls clipboard.writeText', async () => {
    render(<AgentAnswerPanel result={mockResult} />);

    const copyButton = screen.getByLabelText('回答をコピー');
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockResult.response);
  });

  test('feedback buttons call onFeedback', () => {
    const mockOnFeedback = jest.fn();
    render(<AgentAnswerPanel result={mockResult} onFeedback={mockOnFeedback} />);

    fireEvent.click(screen.getByLabelText('良い'));
    expect(mockOnFeedback).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText('悪い'));
    expect(mockOnFeedback).toHaveBeenCalledWith(false);
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

  test('hides feedback buttons when onFeedback not provided', () => {
    render(<AgentAnswerPanel result={mockResult} />);

    expect(screen.queryByLabelText('良い')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('悪い')).not.toBeInTheDocument();
  });
});
