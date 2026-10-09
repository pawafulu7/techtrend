import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RelatedArticles } from '@/app/components/article/related-articles';

// useRelatedArticlesフックをモック
jest.mock('@/hooks/use-related-articles', () => ({
  useRelatedArticles: jest.fn(),
}));

// Next/Linkモック
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockArticles = [
  {
    id: 'article-1',
    title: 'Test Related Article 1',
    summary: 'Summary of test article 1',
    url: 'https://example.com/article-1',
    publishedAt: new Date('2025-01-01T10:00:00Z'),
    source: 'Test Source 1',
    tags: [
      { id: 'tag-1', name: 'React', category: 'framework' },
      { id: 'tag-2', name: 'Testing', category: 'tool' },
    ],
    similarity: 0.85,
    commonTags: 2,
  },
  {
    id: 'article-2',
    title: 'Test Related Article 2',
    summary: 'Summary of test article 2',
    url: 'https://example.com/article-2',
    publishedAt: new Date('2025-01-02T10:00:00Z'),
    source: 'Test Source 2',
    tags: [
      { id: 'tag-3', name: 'TypeScript', category: 'language' },
    ],
    similarity: 0.75,
    commonTags: 1,
  },
];

describe('RelatedArticles', () => {
  let mockUseRelatedArticles: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRelatedArticles = require('@/hooks/use-related-articles').useRelatedArticles;
  });

  it('関連記事が正しいリンクで表示される', async () => {
    mockUseRelatedArticles.mockReturnValue({
      data: { articles: mockArticles, algorithm: 'tag' },
      isLoading: false,
      error: null,
    });

    render(<RelatedArticles articleId="test-article" />);

    await waitFor(() => {
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
    });

    const firstLink = screen.getByText('Test Related Article 1').closest('a');
    expect(firstLink).toHaveAttribute('href', '/articles/article-1');

    const secondLink = screen.getByText('Test Related Article 2').closest('a');
    expect(secondLink).toHaveAttribute('href', '/articles/article-2');
  });

  it('タグ方式では関連の理由を共通タグの数で表示し、% は出さない', async () => {
    mockUseRelatedArticles.mockReturnValue({
      data: { articles: mockArticles, algorithm: 'tag' },
      isLoading: false,
      error: null,
    });

    render(<RelatedArticles articleId="test-article" />);

    await waitFor(() => {
      expect(screen.getByText('共通タグ 2件')).toBeInTheDocument();
      expect(screen.getByText('共通タグ 1件')).toBeInTheDocument();
    });
    expect(screen.queryByText('85%')).not.toBeInTheDocument();
    expect(screen.queryByText('75%')).not.toBeInTheDocument();
  });

  it('ベクトル方式では共通タグの数によらず関連の理由を「内容が近い」と表示する', async () => {
    mockUseRelatedArticles.mockReturnValue({
      data: {
        articles: [{ ...mockArticles[0], commonTags: 0 }, mockArticles[1]],
        algorithm: 'embedding',
      },
      isLoading: false,
      error: null,
    });

    render(<RelatedArticles articleId="test-article" />);

    await waitFor(() => {
      expect(screen.getAllByText('内容が近い')).toHaveLength(2);
    });
    expect(screen.queryByText(/共通タグ/)).not.toBeInTheDocument();
  });

  it('タグ方式で共通タグが0件なら関連の理由を出さない', async () => {
    mockUseRelatedArticles.mockReturnValue({
      data: {
        articles: [{ ...mockArticles[0], commonTags: 0 }],
        algorithm: 'tag',
      },
      isLoading: false,
      error: null,
    });

    render(<RelatedArticles articleId="test-article" />);

    await waitFor(() => {
      expect(screen.getByText('Test Related Article 1')).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId('related-article-reason')
    ).not.toBeInTheDocument();
  });

  it('ローディング中はスケルトンを表示する', () => {
    mockUseRelatedArticles.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<RelatedArticles articleId="test-article" />);

    expect(screen.getByText('関連記事')).toBeInTheDocument();
  });

  it('エラー時は何も表示しない', () => {
    mockUseRelatedArticles.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to fetch'),
    });

    const { container } = render(<RelatedArticles articleId="test-article" />);

    expect(container.firstChild).toBeNull();
  });

  it('関連記事が0件の場合はメッセージを表示する', () => {
    mockUseRelatedArticles.mockReturnValue({
      data: { articles: [], algorithm: 'tag' },
      isLoading: false,
      error: null,
    });

    render(<RelatedArticles articleId="test-article" />);

    expect(screen.getByText('関連記事が見つかりませんでした。')).toBeInTheDocument();
  });

  it('タグが正しく表示される', async () => {
    mockUseRelatedArticles.mockReturnValue({
      data: { articles: mockArticles, algorithm: 'tag' },
      isLoading: false,
      error: null,
    });

    render(<RelatedArticles articleId="test-article" />);

    await waitFor(() => {
      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('Testing')).toBeInTheDocument();
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });
  });

  it('5件以上の関連記事がある場合は展開ボタンを表示する', async () => {
    const manyArticles = Array.from({ length: 10 }, (_, i) => ({
      id: `article-${i + 1}`,
      title: `Test Related Article ${i + 1}`,
      summary: `Summary ${i + 1}`,
      url: `https://example.com/article-${i + 1}`,
      publishedAt: new Date(),
      source: 'Test Source',
      tags: [],
      similarity: 0.8 - i * 0.05,
      commonTags: 1,
    }));

    mockUseRelatedArticles.mockReturnValue({
      data: { articles: manyArticles, algorithm: 'tag' },
      isLoading: false,
      error: null,
    });

    render(<RelatedArticles articleId="test-article" />);

    await waitFor(() => {
      const expandButton = screen.getByRole('button', { name: /さらに表示/i });
      expect(expandButton).toBeInTheDocument();
    });
  });

  it('New バッジが24時間以内の記事に表示される', async () => {
    const recentArticle = {
      ...mockArticles[0],
      publishedAt: new Date(),
    };

    mockUseRelatedArticles.mockReturnValue({
      data: { articles: [recentArticle], algorithm: 'tag' },
      isLoading: false,
      error: null,
    });

    render(<RelatedArticles articleId="test-article" />);

    await waitFor(() => {
      expect(screen.getByText('New')).toBeInTheDocument();
    });
  });

  it('ソース名が正しく表示される', async () => {
    mockUseRelatedArticles.mockReturnValue({
      data: { articles: mockArticles, algorithm: 'tag' },
      isLoading: false,
      error: null,
    });

    render(<RelatedArticles articleId="test-article" />);

    await waitFor(() => {
      expect(screen.getByText('Test Source 1')).toBeInTheDocument();
      expect(screen.getByText('Test Source 2')).toBeInTheDocument();
    });
  });
});