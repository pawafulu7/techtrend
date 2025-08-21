/**
 * APIテスト - Articles (改善版)
 * モック問題を解決したバージョン
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '@/app/api/articles/route';
import { prisma } from '@/lib/database';
import { getRedisClient } from '@/lib/redis/client';

// Prismaモック
jest.mock('@/lib/database');
jest.mock('@/lib/redis/client');

const prismaMock = prisma as any;
const redisMock = getRedisClient() as any;

describe('Articles API Tests V2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // デフォルトのモック設定
    prismaMock.article = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    };
    
    prismaMock.source = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    
    prismaMock.tag = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    
    redisMock.get = jest.fn().mockResolvedValue(null);
    redisMock.set = jest.fn().mockResolvedValue('OK');
  });

  describe('GET /api/articles', () => {
    it('should return articles list', async () => {
      const mockArticles = [
        {
          id: '1',
          title: 'Test Article',
          url: 'https://example.com/1',
          summary: 'Test Summary',
          publishedAt: new Date('2025-01-01'),
          qualityScore: 85,
          bookmarks: 10,
          userVotes: 5,
          difficulty: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          sourceId: 'test-source',
          source: {
            id: 'test-source',
            name: 'Test Source',
            type: 'rss',
            url: 'https://test.com',
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          tags: []
        }
      ];

      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.items).toHaveLength(1);
      expect(body.data.total).toBe(1);
    });

    it('should use cache when available', async () => {
      const cachedData = JSON.stringify({
        items: [{ id: '1', title: 'Cached Article' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1
      });

      redisMock.get.mockResolvedValueOnce(cachedData);

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].title).toBe('Cached Article');
      
      // データベースクエリが呼ばれていないことを確認
      expect(prismaMock.article.findMany).not.toHaveBeenCalled();
    });

    it('should handle filters', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/articles?source=qiita&tag=react');
      await GET(request);

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: 'qiita',
            tags: {
              some: {
                name: 'react'
              }
            }
          })
        })
      );
    });

    it('should handle pagination', async () => {
      prismaMock.article.findMany.mockResolvedValue([]);
      prismaMock.article.count.mockResolvedValue(100);

      const request = new NextRequest('http://localhost:3000/api/articles?page=2&limit=10');
      const response = await GET(request);

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10
        })
      );

      const body = await response.json();
      expect(body.data.page).toBe(2);
      expect(body.data.limit).toBe(10);
    });

    it('should handle errors gracefully', async () => {
      prismaMock.article.findMany.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/articles');
      const response = await GET(request);

      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });
  });

  describe('POST /api/articles', () => {
    it('should create a new article', async () => {
      const newArticle = {
        title: 'New Article',
        url: 'https://example.com/new',
        summary: 'New Summary',
        sourceId: 'test-source'
      };

      const createdArticle = {
        id: 'new-id',
        ...newArticle,
        publishedAt: new Date(),
        qualityScore: 80,
        bookmarks: 0,
        userVotes: 0,
        difficulty: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      prismaMock.article.create.mockResolvedValue(createdArticle);

      const request = new NextRequest('http://localhost:3000/api/articles', {
        method: 'POST',
        body: JSON.stringify(newArticle)
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('new-id');
      expect(body.data.title).toBe('New Article');
    });

    it('should validate required fields', async () => {
      const invalidArticle = {
        title: 'Missing URL'
        // urlが欠けている
      };

      const request = new NextRequest('http://localhost:3000/api/articles', {
        method: 'POST',
        body: JSON.stringify(invalidArticle)
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('required');
    });
  });
});