import { createArticleLoader } from '../article-loader';
import { prisma } from '@/lib/prisma';

// Prismaモック
jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      findMany: jest.fn()
    }
  }
}));

describe('ArticleLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should batch multiple requests into a single database query', async () => {
    const mockArticles = [
      {
        id: '1',
        title: 'Article 1',
        tags: [],
        source: { id: 'src1', name: 'Source 1' }
      },
      {
        id: '2',
        title: 'Article 2',
        tags: [],
        source: { id: 'src2', name: 'Source 2' }
      }
    ];

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

    const loader = createArticleLoader();

    // 複数のリクエストを同時に実行
    const [article1, article2] = await Promise.all([
      loader.load('1'),
      loader.load('2')
    ]);

    // 1回のfindManyクエリのみが実行されることを確認
    expect(prisma.article.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.article.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['1', '2']
        }
      },
      include: {
        tags: true,
        source: true
      }
    });

    expect(article1).toEqual(mockArticles[0]);
    expect(article2).toEqual(mockArticles[1]);
  });

  it('should return null for non-existent articles', async () => {
    const mockArticles = [
      {
        id: '1',
        title: 'Article 1',
        tags: [],
        source: { id: 'src1', name: 'Source 1' }
      }
    ];

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

    const loader = createArticleLoader();

    const [article1, article2] = await Promise.all([
      loader.load('1'),
      loader.load('2')
    ]);

    expect(article1).toEqual(mockArticles[0]);
    expect(article2).toBeNull();
  });

  it('should maintain order of results', async () => {
    const mockArticles = [
      {
        id: '2',
        title: 'Article 2',
        tags: [],
        source: { id: 'src2', name: 'Source 2' }
      },
      {
        id: '1',
        title: 'Article 1',
        tags: [],
        source: { id: 'src1', name: 'Source 1' }
      }
    ];

    (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

    const loader = createArticleLoader();

    const results = await loader.loadMany(['1', '2', '3']);

    // 入力順序と一致する結果を返すことを確認
    expect(results[0]).toEqual(expect.objectContaining({ id: '1' }));
    expect(results[1]).toEqual(expect.objectContaining({ id: '2' }));
    expect(results[2]).toBeNull();
  });

  it('should cache results when cache is enabled', async () => {
    const mockArticle = {
      id: '1',
      title: 'Article 1',
      tags: [],
      source: { id: 'src1', name: 'Source 1' }
    };

    (prisma.article.findMany as jest.Mock).mockResolvedValue([mockArticle]);

    const loader = createArticleLoader({ cache: true });

    // 同じIDで2回リクエスト
    const result1 = await loader.load('1');
    const result2 = await loader.load('1');

    // データベースクエリは1回のみ
    expect(prisma.article.findMany).toHaveBeenCalledTimes(1);
    expect(result1).toBe(result2); // 同じインスタンスを返す
  });

  it('should not cache results when cache is disabled', async () => {
    const mockArticle = {
      id: '1',
      title: 'Article 1',
      tags: [],
      source: { id: 'src1', name: 'Source 1' }
    };

    (prisma.article.findMany as jest.Mock).mockResolvedValue([mockArticle]);

    const loader = createArticleLoader({ cache: false });

    // 同じIDで2回リクエスト
    await loader.load('1');
    await loader.load('1');

    // キャッシュが無効なので2回クエリが実行される
    expect(prisma.article.findMany).toHaveBeenCalledTimes(2);
  });
});