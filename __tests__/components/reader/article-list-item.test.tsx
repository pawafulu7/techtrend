import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  ArticleListItem,
  readerOptionId,
} from '@/app/reader/article-list-item';

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

  it('行は listbox の aria-activedescendant が指す id を持ち、自分ではフォーカスを受けない', () => {
    render(
      <ArticleListItem article={article} isSelected onSelect={jest.fn()} />
    );
    const option = screen.getByRole('option');
    expect(option).toHaveAttribute('id', readerOptionId('reader-1'));
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(option).not.toHaveAttribute('tabindex');
  });

  it('画像のある記事は右に小さな画像（72px 幅で取る）を出し、画像の無い記事は枠も出さない', () => {
    const { container, rerender } = render(
      <ArticleListItem
        article={{ ...article, thumbnail: 'https://example.com/thumb.png' }}
        isSelected={false}
        onSelect={jest.fn()}
      />
    );
    expect(container.querySelector('img')).toHaveAttribute('sizes', '72px');

    rerender(
      <ArticleListItem article={article} isSelected={false} onSelect={jest.fn()} />
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('押すとその記事を選ぶ', () => {
    const onSelect = jest.fn();
    render(
      <ArticleListItem
        article={article}
        isSelected={false}
        onSelect={onSelect}
      />
    );
    screen.getByRole('option').click();
    expect(onSelect).toHaveBeenCalledWith('reader-1');
  });
});
