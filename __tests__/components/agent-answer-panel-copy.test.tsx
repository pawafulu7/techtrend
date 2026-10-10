import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentAnswerPanel } from '@/app/search/agent/_components/agent-answer-panel';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

// Markdown の表示は遅延読み込み（Issue #718）。chunk がまだ届いていない状態を再現する
jest.mock('@/app/components/common/lazy-markdown', () => ({
  LazyMarkdown: () => null,
  preloadMarkdown: jest.fn(),
}));

describe('AgentAnswerPanel - copy before the Markdown is rendered', () => {
  test('copies the answer text while the Markdown is still loading', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    const result: AgentSearchResult = {
      query: 'test query',
      response: '# Test Response\n\nSome **bold** text.',
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: false,
      fallback: false,
    };

    render(<AgentAnswerPanel result={result} />);
    expect(screen.getByTestId('agent-answer-markdown')).toBeEmptyDOMElement();

    fireEvent.click(screen.getByLabelText('回答をコピー'));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        '# Test Response\n\nSome **bold** text.'
      )
    );
  });
});
