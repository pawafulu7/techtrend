import { render, screen } from '@testing-library/react';
import { AgentAnswerPanel } from '@/app/search/agent/_components/agent-answer-panel';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

// Markdown の表示は遅延読み込み（Issue #718）。描き終わる前は本文が無く、
// 「含まない」の確認が素通りするので、安全な文字列が出るのを待ってから確かめる
describe('Markdown XSS Prevention', () => {
  test('blocks javascript: protocol links', async () => {
    const result: AgentSearchResult = {
      query: 'test',
      response: '[click me](javascript:alert("XSS")) and safe text',
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: false,
      fallback: false,
    };

    const { container } = render(
      <AgentAnswerPanel result={result}/>
    );
    await screen.findByText(/and safe text/);
    expect(container.textContent).toContain('safe text');
    expect(container.textContent).not.toContain('javascript:');
  });

  test('blocks data: protocol URLs in images', async () => {
    const result: AgentSearchResult = {
      query: 'test',
      response: 'Image: ![img](data:text/html,<script>alert("XSS")</script>) and safe text',
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: false,
      fallback: false,
    };

    const { container } = render(
      <AgentAnswerPanel result={result}/>
    );
    await screen.findByText(/and safe text/);
    expect(container.textContent).toContain('safe text');
    expect(container.textContent).not.toContain('data:');
    expect(container.textContent).not.toContain('script');
  });

  test('does not render inline HTML (no rehype-raw)', async () => {
    const result: AgentSearchResult = {
      query: 'test',
      response: '<script>alert("XSS")</script>\n\nSafe text',
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: false,
      fallback: false,
    };

    render(<AgentAnswerPanel result={result}/>);
    expect(await screen.findByText('Safe text')).toBeInTheDocument();
    expect(screen.queryByText('alert("XSS")')).not.toBeInTheDocument();
  });

  test('allows safe protocols (http, https, mailto)', async () => {
    const result: AgentSearchResult = {
      query: 'test',
      response: '[http](http://example.com) [https](https://example.com) [mailto](mailto:test@example.com)',
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: false,
      fallback: false,
    };

    render(<AgentAnswerPanel result={result}/>);
    const links = await screen.findAllByRole('link');
    expect(links[0]).toHaveAttribute('href', 'http://example.com');
    expect(links[1]).toHaveAttribute('href', 'https://example.com');
    expect(links[2]).toHaveAttribute('href', 'mailto:test@example.com');
  });
});
