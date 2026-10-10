import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentAnswerPanel } from '@/app/search/agent/_components/agent-answer-panel';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

// Markdown の chunk が届かない状態を再現する（Issue #718）。
// モジュールを「解決しない thenable」にすると、import() がそれを待ち続ける
jest.mock('@/app/components/common/markdown-renderer', () => ({
  __esModule: true,
  then: () => {},
}));

describe('AgentAnswerPanel while the Markdown chunk is pending', () => {
  test('shows the answer as plain text and keeps the copy button usable', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    const result: AgentSearchResult = {
      query: 'test query',
      response: '# Test Response [#art-1]\n\nSome **bold** text.',
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: false,
      fallback: false,
    };

    render(<AgentAnswerPanel result={result} />);

    const markdown = screen.getByTestId('agent-answer-markdown');
    expect(markdown).toHaveTextContent('# Test Response');
    expect(markdown.querySelector('h2')).toBeNull();
    expect(screen.getByRole('heading', { name: 'AI回答' })).toBeVisible();

    const copyButton = screen.getByLabelText('回答をコピー');
    expect(copyButton).toBeVisible();
    fireEvent.click(copyButton);

    // 描いた文字と同じく、記事 ID の目印は消してコピーする
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('# Test Response');
    expect(copied).toContain('Some **bold** text.');
    expect(copied).not.toContain('[#art-1]');
  });
});
