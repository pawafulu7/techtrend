import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ArticleListItem } from '@/app/reader/article-list-item';

describe('reader ArticleListItem', () => {
  const article = {
    id: 'reader-1',
    title: 'Original English title',
    translatedTitle: null,
    thumbnail: null,
    publishedAt: '2026-10-11T06:00:00.000Z',
    source: { name: 'Lobsters' },
  };

  it('翻訳していない記事には翻訳のバッジを出さない', () => {
    render(
      <ArticleListItem
        article={article}
        isSelected={false}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText('Original English title')).toBeInTheDocument();
    expect(screen.queryByTestId('translation-badge')).not.toBeInTheDocument();
  });

  it('翻訳した記事は翻訳したタイトルを出し、ソース名の後ろに翻訳のバッジを出す（issue #725）', () => {
    render(
      <ArticleListItem
        article={{ ...article, translatedTitle: '翻訳したタイトル' }}
        isSelected={false}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText('翻訳したタイトル')).toBeInTheDocument();
    const badge = screen.getByTestId('translation-badge');
    expect(badge).toHaveTextContent('自動翻訳');
    expect(screen.getByText('Lobsters').nextElementSibling).toBe(badge);
  });
});
