/**
 * /api/articles/[id] エンドポイントのテスト
 */

// モックの設定
jest.mock('@/lib/database');

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { GET } from '@/app/api/articles/[id]/route';
import { prisma } from '@/lib/database';
import { NextRequest } from 'next/server';

const prismaMock = prisma as any;

describe('/api/articles/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // デフォルトのPrismaモック設定
    prismaMock.article = {
      findUnique: jest.fn().mockResolvedValue(null),
    };
  });

  describe('GET', () => {
    const mockArticle = {
      id: 'article1',
      title: 'Test Article',
      url: 'https://example.com/article',
      summary: 'Test summary',
      detailedSummary: 'Detailed test summary',
      content: 'Full article content',
      thumbnail: 'https://example.com/thumb.jpg',
      publishedAt: new Date('2025-01-01'),
      qualityScore: 85,
      sourceId: 'qiita',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      source: {
        id: 'qiita',
        name: 'Qiita',
        type: 'api',
        url: 'https://qiita.com',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      tags: [
        { id: 't1', name: 'React', createdAt: new Date(), updatedAt: new Date() },
        { id: 't2', name: 'TypeScript', createdAt: new Date(), updatedAt: new Date() },
      ],
    };

    it('記事の詳細を返す', async () => {
      prismaMock.article.findUnique.mockResolvedValue(mockArticle);

      const request = new NextRequest('http://localhost/api/articles/article1');
      const params = Promise.resolve({ id: 'article1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('Test Article');
      expect(data.data.tags).toHaveLength(2);

      expect(prismaMock.article.findUnique).toHaveBeenCalledWith({
        where: { id: 'article1' },
        include: {
          source: true,
          tags: true,
        },
      });
    });

    it('記事が存在しない場合404を返す', async () => {
      prismaMock.article.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/articles/nonexistent');
      const params = Promise.resolve({ id: 'nonexistent' });
      const response = await GET(request, { params });

      expect(response.status).toBe(404);
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.error).toBe('Article not found');
    });

    it('データベースエラーの場合500を返す', async () => {
      prismaMock.article.findUnique.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/articles/article1');
      const params = Promise.resolve({ id: 'article1' });
      const response = await GET(request, { params });

      expect(response.status).toBe(500);
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch article');
      expect(data.details).toBe('Database error');
    });
  });
});
