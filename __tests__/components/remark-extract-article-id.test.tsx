import { render, screen } from '@testing-library/react';
import { LazyMarkdown } from '@/app/components/common/lazy-markdown';
import remarkExtractArticleId, {
  stripArticleIdTokens,
} from '@/app/search/agent/_components/remark-extract-article-id';

const markdown = `# Heading [#art-1]

Intro **bold** [#art-2] text.

- **Title** [#art-1] (match: 80%) - Desc
- [#art-3] Leading token item
- Item two`;

describe('remarkExtractArticleId', () => {
  it('attaches the article id to the list item and strips the tokens everywhere', async () => {
    const { container } = render(
      <LazyMarkdown remarkPlugins={[remarkExtractArticleId]}>
        {markdown}
      </LazyMarkdown>
    );

    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-article-id', 'art-1');
    // 太字の直後の目印を消しても、前後の文字をくっつけない
    expect(items[0]).toHaveTextContent('Title (match: 80%) - Desc');
    expect(items[1]).toHaveAttribute('data-article-id', 'art-3');
    expect(items[1]).toHaveTextContent('Leading token item');
    expect(items[2]).not.toHaveAttribute('data-article-id');

    // 見出しや段落の目印も消え、書式なしの表示（stripArticleIdTokens）と同じ文字になる
    expect(
      screen.getByRole('heading', { level: 1, name: 'Heading' })
    ).toBeInTheDocument();
    expect(container.querySelector('p')).toHaveTextContent('Intro bold text.');
    expect(document.body.textContent).not.toContain('[#');
  });

  it('strips the tokens from raw text the same way', () => {
    expect(
      stripArticleIdTokens(
        'Intro **bold** [#a2] text.\n[#a3] item\n- Item [#a1], desc'
      )
    ).toBe('Intro **bold** text.\nitem\n- Item, desc');
    expect(stripArticleIdTokens(markdown)).not.toContain('[#');
  });
});
