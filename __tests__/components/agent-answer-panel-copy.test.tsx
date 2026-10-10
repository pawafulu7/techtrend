import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentAnswerPanel } from '@/app/search/agent/_components/agent-answer-panel';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

// Markdown が何も描かない回答でも、元のテキストをコピーする（Issue #718）
jest.mock('@/app/components/common/lazy-markdown', () => ({
  LazyMarkdown: () => null,
  preloadMarkdown: jest.fn(),
}));

describe('AgentAnswerPanel - copy when the Markdown renders nothing', () => {
  test('copies the original answer text', async () => {
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
