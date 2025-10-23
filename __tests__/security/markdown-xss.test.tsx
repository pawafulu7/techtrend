import { render, screen } from '@testing-library/react';
import { AgentAnswerPanel } from '@/app/search/agent/_components/agent-answer-panel';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

describe('Markdown XSS Prevention', () => {
  test('strips javascript: protocol links', () => {
    const result: AgentSearchResult = {
      query: 'test',
      response: '[click me](javascript:alert("XSS"))',
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: false,
      fallback: false,
    };

    render(<AgentAnswerPanel result={result} />);
    const link = screen.queryByRole('link');
    expect(link).toHaveAttribute('href', '');
  });

  test('blocks data: protocol URLs in images', () => {
    const result: AgentSearchResult = {
      query: 'test',
      response: '![img](data:text/html,<script>alert("XSS")</script>)',
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: false,
      fallback: false,
    };

    render(<AgentAnswerPanel result={result} />);
    const img = screen.queryByRole('img');

    if (img) {
      const src = img.getAttribute('src');
      expect(src).not.toContain('data:');
      expect(src).not.toContain('script');
    }
  });

  test('does not render inline HTML (no rehype-raw)', () => {
    const result: AgentSearchResult = {
      query: 'test',
      response: '<script>alert("XSS")</script>\n\nSafe text',
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: false,
      fallback: false,
    };

    render(<AgentAnswerPanel result={result} />);
    expect(screen.queryByText('alert("XSS")')).not.toBeInTheDocument();
    expect(screen.getByText('Safe text')).toBeInTheDocument();
  });

  test('allows safe protocols (http, https, mailto)', () => {
    const result: AgentSearchResult = {
      query: 'test',
      response: '[http](http://example.com) [https](https://example.com) [mailto](mailto:test@example.com)',
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: false,
      fallback: false,
    };

    render(<AgentAnswerPanel result={result} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', 'http://example.com');
    expect(links[1]).toHaveAttribute('href', 'https://example.com');
    expect(links[2]).toHaveAttribute('href', 'mailto:test@example.com');
  });
});
