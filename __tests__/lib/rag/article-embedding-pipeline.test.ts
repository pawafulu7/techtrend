/**
 * 記事の埋め込みのパイプライン（lib/rag/article-embedding-pipeline.ts）が、要約の埋め込みを書いた記事の
 * 興味の分野の点数を書き直すこと
 */

const mockEmbedText = jest.fn();
jest.mock('@/lib/rag/embedding-service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    embedText: (...args: unknown[]) => mockEmbedText(...args),
  })),
}));

const mockRefreshInterestScoresForArticle = jest.fn();
jest.mock('@/lib/personalization/interest-scores', () => ({
  refreshInterestScoresForArticle: (...args: unknown[]) =>
    mockRefreshInterestScoresForArticle(...args),
}));

import { ArticleEmbeddingPipeline } from '@/lib/rag/article-embedding-pipeline';
import type { Article } from '@/lib/prisma-exports';

const article = (overrides: Partial<Article> = {}) =>
  ({
    id: 'article-1',
    title: 'タイトル',
    summary: '要約',
    ...overrides,
  }) as Article;

describe('ArticleEmbeddingPipeline.embedArticle の興味の分野の点数', () => {
  const db = { $executeRaw: jest.fn().mockResolvedValue(1) };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmbedText.mockResolvedValue([0.1, 0.2]);
    mockRefreshInterestScoresForArticle.mockResolvedValue(1);
  });

  it('要約の埋め込みを書いたら、その記事の点数を書き直す', async () => {
    const pipeline = new ArticleEmbeddingPipeline(db as never);

    const result = await pipeline.embedArticle(article());

    expect(result).toMatchObject({
      success: true,
      embeddingsCreated: ['title', 'summary'],
    });
    expect(mockRefreshInterestScoresForArticle).toHaveBeenCalledWith(
      db,
      'article-1'
    );
  });

  it('要約が無い記事は、点数を書き直さない', async () => {
    const pipeline = new ArticleEmbeddingPipeline(db as never);

    const result = await pipeline.embedArticle(article({ summary: null }));

    expect(result.embeddingsCreated).toEqual(['title']);
    expect(mockRefreshInterestScoresForArticle).not.toHaveBeenCalled();
  });

  it('点数を書けなければ失敗として返す（ジョブを再試行させる）', async () => {
    mockRefreshInterestScoresForArticle.mockRejectedValue(new Error('boom'));
    const pipeline = new ArticleEmbeddingPipeline(db as never);

    const result = await pipeline.embedArticle(article());

    expect(result).toMatchObject({ success: false, error: 'boom' });
  });
});
