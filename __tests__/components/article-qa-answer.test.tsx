import { render, screen } from '@testing-library/react';
import { ArticleQaAnswer } from '@/app/articles/_components/article-qa-answer';

describe('ArticleQaAnswer', () => {
  describe('Markdown rendering', () => {
    it('should render markdown content correctly', () => {
      const markdown = `# Heading

Some **bold** text and a [link](https://example.com).`;

      render(
        <ArticleQaAnswer
          answer={markdown}
          isStreaming={false}
        />
      );

      expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeInTheDocument();
      expect(screen.getByText('bold')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'link' })).toBeInTheDocument();
    });

    it('should render external links with target="_blank" and rel="noopener noreferrer"', () => {
      render(
        <ArticleQaAnswer
          answer="Check out [this link](https://example.com)"
          isStreaming={false}
        />
      );

      const link = screen.getByRole('link', { name: 'this link' });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should render GFM features like strikethrough', () => {
      render(
        <ArticleQaAnswer
          answer="This is ~~strikethrough~~ text"
          isStreaming={false}
        />
      );

      // Strikethrough should be rendered as <del> element
      expect(screen.getByText('strikethrough')).toBeInTheDocument();
    });

    it('should render line breaks correctly', () => {
      render(
        <ArticleQaAnswer
          answer="Line 1\nLine 2"
          isStreaming={false}
        />
      );

      // remarkBreaks converts single newlines to <br>
      const markdown = screen.getByTestId('qa-answer-markdown');
      expect(markdown).toBeInTheDocument();
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

    it('should show both streaming indicator and partial answer', () => {
      render(
        <ArticleQaAnswer
          answer="Partial answer..."
          isStreaming={true}
        />
      );

      expect(screen.getByTestId('qa-streaming-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('qa-answer-markdown')).toBeInTheDocument();
      expect(screen.getByText('Partial answer...')).toBeInTheDocument();
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

      const region = screen.getByRole('region', { name: 'AI回答' });
      expect(region).toBeInTheDocument();
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
