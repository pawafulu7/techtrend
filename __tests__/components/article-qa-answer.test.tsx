import { render, screen, waitFor } from '@testing-library/react';
import { ArticleQaAnswer } from '@/app/articles/_components/article-qa-answer';

describe('ArticleQaAnswer', () => {
  // Markdown の表示は遅延読み込み（Issue #718）なので、描き終わるのを待ってから確かめる
  describe('Markdown rendering', () => {
    it('should render markdown content correctly', async () => {
      const markdown = `# Heading

Some **bold** text and a [link](https://example.com).`;

      render(
        <ArticleQaAnswer
          answer={markdown}
          isStreaming={false}
        />
      );

      // 「#」は h2 にする（記事詳細の h1 は記事タイトルだけ。Issue #700）
      expect(await screen.findByRole('heading', { level: 2, name: 'Heading' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      expect(screen.getByText('bold')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'link' })).toBeInTheDocument();
    });

    it('「#」だけを h2 にし、「##」以降の見出しは変えない（Issue #700）', async () => {
      const markdown = `# Parent

## Child

### Grandchild`;

      render(<ArticleQaAnswer answer={markdown} isStreaming={false} />);

      expect(await screen.findByRole('heading', { level: 2, name: 'Parent' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Child' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'Grandchild' })).toBeInTheDocument();
    });

    it('should render external links with target="_blank" and rel="noopener noreferrer"', async () => {
      render(
        <ArticleQaAnswer
          answer="Check out [this link](https://example.com)"
          isStreaming={false}
        />
      );

      const link = await screen.findByRole('link', { name: 'this link' });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should render GFM features like strikethrough', async () => {
      render(
        <ArticleQaAnswer
          answer="This is ~~strikethrough~~ text"
          isStreaming={false}
        />
      );

      // Strikethrough should be rendered as <del> element
      expect((await screen.findByText('strikethrough')).tagName).toBe('DEL');
    });

    it('should render line breaks correctly', async () => {
      render(
        <ArticleQaAnswer
          answer={`Line 1
Line 2`}
          isStreaming={false}
        />
      );

      const markdown = screen.getByTestId('qa-answer-markdown');
      expect(markdown).toBeInTheDocument();
      // remarkBreaks converts single newlines to <br>
      await waitFor(() => expect(markdown.innerHTML).toContain('<br'));
    });
  });

  describe('Streaming indicator', () => {
    it('should show streaming indicator when isStreaming=true', () => {
      render(
        <ArticleQaAnswer
          answer=""
          isStreaming={true}
        />
      );

      const indicator = screen.getByTestId('qa-streaming-indicator');
      expect(indicator).toBeVisible();
      expect(indicator).toHaveTextContent('回答を生成中...');
    });

    it('should hide streaming indicator when isStreaming=false', () => {
      render(
        <ArticleQaAnswer
          answer="Some answer"
          isStreaming={false}
        />
      );

      expect(screen.queryByTestId('qa-streaming-indicator')).not.toBeInTheDocument();
    });

    it('should show both streaming indicator and partial answer', async () => {
      render(
        <ArticleQaAnswer
          answer="Partial answer..."
          isStreaming={true}
        />
      );

      expect(screen.getByTestId('qa-streaming-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('qa-answer-markdown')).toBeInTheDocument();
      expect(await screen.findByText('Partial answer...')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty state when answer is null and not streaming', () => {
      render(
        <ArticleQaAnswer
          answer={null}
          isStreaming={false}
        />
      );

      const emptyState = screen.getByTestId('qa-empty-state');
      expect(emptyState).toBeInTheDocument();
      expect(emptyState).toHaveTextContent('回答がありません');
    });

    it('should show empty state when answer is empty string and not streaming', () => {
      render(
        <ArticleQaAnswer
          answer=""
          isStreaming={false}
        />
      );

      expect(screen.getByTestId('qa-empty-state')).toBeInTheDocument();
    });

    it('should show empty state when answer is whitespace only and not streaming', () => {
      render(
        <ArticleQaAnswer
          answer="   "
          isStreaming={false}
        />
      );

      expect(screen.getByTestId('qa-empty-state')).toBeInTheDocument();
    });

    it('should NOT show empty state while streaming even with empty answer', () => {
      render(
        <ArticleQaAnswer
          answer=""
          isStreaming={true}
        />
      );

      expect(screen.queryByTestId('qa-empty-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('qa-streaming-indicator')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria attributes', () => {
      render(
        <ArticleQaAnswer
          answer="Test answer"
          isStreaming={false}
        />
      );

      const article = screen.getByRole('article', { name: 'AI回答' });
      expect(article).toBeInTheDocument();
    });

    it('should have aria-live on streaming indicator', () => {
      render(
        <ArticleQaAnswer
          answer=""
          isStreaming={true}
        />
      );

      const indicator = screen.getByTestId('qa-streaming-indicator');
      expect(indicator).toHaveAttribute('aria-live', 'polite');
      expect(indicator).toHaveAttribute('role', 'status');
    });
  });

  describe('Props', () => {
    it('should accept data-testid prop', () => {
      render(
        <ArticleQaAnswer
          answer="Test"
          isStreaming={false}
          data-testid="custom-testid"
        />
      );

      expect(screen.getByTestId('custom-testid')).toBeInTheDocument();
    });
  });
});
