import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReaderArticleDetail } from '@/app/reader/article-detail';
import type { ReaderDetailArticle } from '@/app/reader/types';

jest.mock('@/app/components/article/favorite-button', () => ({
  FavoriteButton: () => <button type="button">お気に入り</button>,
}));

jest.mock('@/app/components/common/optimized-image', () => ({
  OptimizedImage: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

const NO_SUMMARY = '要約はありません';
const SLIDE_NOTE = 'このプレゼンテーションの詳細は元記事でご確認ください。';

function buildArticle(
  overrides: Partial<ReaderDetailArticle> = {}
): ReaderDetailArticle {
  return {
    id: 'reader-1',
    title: 'スライドのタイトル',
    translatedTitle: null,
    url: 'https://speakerdeck.com/example/deck',
    summary: null,
    detailedSummary: null,
    thumbnail:
      'https://files.speakerdeck.com/presentations/example/slide_0.jpg',
    publishedAt: '2026-10-10T00:00:00.000Z',
    summaryVersion: null,
    articleType: null,
    source: {
      id: 'speakerdeck',
      name: 'Speaker Deck',
      url: 'https://speakerdeck.com',
    },
    tags: [],
    ...overrides,
  };
}

function renderDetail(article: ReaderDetailArticle) {
  return render(
    <ReaderArticleDetail article={article} isLoading={false} error={null} />
  );
}

// 要約の無いスライドは、記事詳細ページと同じく要約の代わりにスライドの1枚目を出す
describe('reader ReaderArticleDetail のスライド', () => {
  it('要約の無いスライドは、スライドの画像と元記事への案内を出す', () => {
    renderDetail(buildArticle());

    const figure = screen.getByTestId('reader-slide-thumbnail');
    expect(figure.querySelector('img')).toHaveAttribute(
      'src',
      'https://files.speakerdeck.com/presentations/example/slide_0.jpg'
    );
    expect(screen.getByText(SLIDE_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(NO_SUMMARY)).not.toBeInTheDocument();
  });

  it('はてブ経由の記事も URL のホストでスライドと判定する', () => {
    renderDetail(
      buildArticle({
        source: {
          id: 'hatena',
          name: 'はてなブックマーク',
          url: 'https://b.hatena.ne.jp',
        },
      })
    );

    expect(screen.getByTestId('reader-slide-thumbnail')).toBeInTheDocument();
  });

  it.each([null, '/images/slide_0.jpg'])(
    '表示できる画像の無いスライド（%s）は「要約はありません」のまま',
    (thumbnail) => {
      renderDetail(buildArticle({ thumbnail }));

      expect(
        screen.queryByTestId('reader-slide-thumbnail')
      ).not.toBeInTheDocument();
      expect(screen.getByText(NO_SUMMARY)).toBeInTheDocument();
    }
  );

  it('要約のあるスライドは要約を出し、画像は出さない', () => {
    renderDetail(buildArticle({ summary: 'スライドの要約' }));

    expect(screen.getByText('スライドの要約')).toBeInTheDocument();
    expect(
      screen.queryByTestId('reader-slide-thumbnail')
    ).not.toBeInTheDocument();
  });

  it('スライドでない記事は、画像があっても「要約はありません」のまま', () => {
    renderDetail(
      buildArticle({
        url: 'https://example.com/post',
        source: { id: 'zenn', name: 'Zenn', url: 'https://zenn.dev' },
      })
    );

    expect(
      screen.queryByTestId('reader-slide-thumbnail')
    ).not.toBeInTheDocument();
    expect(screen.getByText(NO_SUMMARY)).toBeInTheDocument();
  });
});
