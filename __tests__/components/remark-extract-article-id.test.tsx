import { render, screen } from '@testing-library/react';
import { LazyMarkdown } from '@/app/components/common/lazy-markdown';
import remarkExtractArticleId, {
  stripArticleIdTokens,
} from '@/app/search/agent/_components/remark-extract-article-id';

const markdown = `# Heading [#art-1]

Intro [#art-2] text.

- Item one [#art-1]
- Item two`;

describe('remarkExtractArticleId', () => {
  it('attaches the article id to the list item and strips the tokens everywhere', async () => {
    render(
      <LazyMarkdown remarkPlugins={[remarkExtractArticleId]}>
        {markdown}
      </LazyMarkdown>
    );

    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-article-id', 'art-1');
    expect(items[0]).toHaveTextContent('Item one');
    expect(items[1]).not.toHaveAttribute('data-article-id');

    // 見出しや段落の目印も消え、書式なしの表示（stripArticleIdTokens）と同じ文字になる
    expect(
      screen.getByRole('heading', { level: 1, name: 'Heading' })
    ).toBeInTheDocument();
    expect(screen.getByText('Intro text.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('[#');
    expect(stripArticleIdTokens(markdown)).not.toContain('[#');
  });
});
