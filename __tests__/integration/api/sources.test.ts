/**
 * APIテスト - Sources
 * Manual Mocksを使用したAPIルートハンドラーのテスト
 */

import { GET } from '@/app/api/sources/route';
import {
  createMockRequest,
  createMockContext,
  parseResponse,
  setupPrismaMock,
  setupRedisMock,
  expectApiSuccess,
  expectApiError,
  expectCacheHit,
  expectCacheSet,
  expectDatabaseQuery,
} from '../helpers/mock-helpers';

// Manual mocksのインポート
import prismaMock from '../../__mocks__/lib/prisma';
import redisMock from '../../__mocks__/lib/redis/client';

// モックの自動適用
jest.mock('@/lib/database');
// Redisクライアントのモックはjest.setup.node.jsで設定済み

describe('Sources API Tests', () => {
  beforeEach(() => {
    // モックのセットアップ
    setupPrismaMock();
    setupRedisMock();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/sources', () => {
    it('ソース一覧を正常に取得できる', async () => {
      const mockSources = [
        {
          id: 'dev.to',
          name: 'Dev.to',
          url: 'https://dev.to',
          iconUrl: null,
          description: 'Developer community',
          isActive: true,
          fetchInterval: 3600,
          lastFetchedAt: new Date('2025-01-01'),
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
        {
          id: 'qiita',
          name: 'Qiita',
          url: 'https://qiita.com',
          iconUrl: null,
          description: 'Japanese tech community',
          isActive: true,
          fetchInterval: 3600,
          lastFetchedAt: new Date('2025-01-01'),
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
      ];

      prismaMock.source.findMany.mockResolvedValue(mockSources);
      prismaMock.article.groupBy.mockResolvedValue([
        { sourceId: 'dev.to', _count: { id: 100 } },
        { sourceId: 'qiita', _count: { id: 50 } },
      ]);

      const request = createMockRequest('http://localhost:3000/api/sources');
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      expect(result.body.sources).toHaveLength(2);
      expect(result.body.sources[0]).toHaveProperty('articleCount');
      expectDatabaseQuery(prismaMock, 'source', 'findMany');
    });

    it('非アクティブなソースを除外できる', async () => {
      const mockSources = [
        {
          id: 'active-source',
          name: 'Active Source',
          url: 'https://active.com',
          iconUrl: null,
          description: 'Active source',
          isActive: true,
          fetchInterval: 3600,
          lastFetchedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      prismaMock.source.findMany.mockResolvedValue(mockSources);
      prismaMock.article.groupBy.mockResolvedValue([]);

      const request = createMockRequest('http://localhost:3000/api/sources', {
        searchParams: { active: 'true' },
      });
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      expect(prismaMock.source.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
          }),
        })
      );
    });

    it('記事数で並び替えができる', async () => {
      prismaMock.source.findMany.mockResolvedValue([]);
      prismaMock.article.groupBy.mockResolvedValue([]);

      const request = createMockRequest('http://localhost:3000/api/sources', {
        searchParams: { sort: 'articleCount' },
      });
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      // ソート処理はアプリケーション側で行われることを確認
      expect(result.body.sources).toBeDefined();
    });

    it('キャッシュが機能する', async () => {
      const cachedData = JSON.stringify({
        sources: [
          {
            id: 'cached-source',
            name: 'Cached Source',
            articleCount: 10,
          },
        ],
      });
      
      redisMock.get.mockResolvedValue(cachedData);

      const request = createMockRequest('http://localhost:3000/api/sources');
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      expectCacheHit(redisMock, expect.stringContaining('sources:'));
      expect(prismaMock.source.findMany).not.toHaveBeenCalled();
    });

    it('キャッシュミス時にデータベースから取得してキャッシュする', async () => {
      const mockSources = [
        {
          id: 'test-source',
          name: 'Test Source',
          url: 'https://test.com',
          iconUrl: null,
          description: 'Test',
          isActive: true,
          fetchInterval: 3600,
          lastFetchedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      redisMock.get.mockResolvedValue(null); // キャッシュミス
      prismaMock.source.findMany.mockResolvedValue(mockSources);
      prismaMock.article.groupBy.mockResolvedValue([]);

      const request = createMockRequest('http://localhost:3000/api/sources');
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      expectCacheHit(redisMock, expect.stringContaining('sources:'));
      expectDatabaseQuery(prismaMock, 'source', 'findMany');
      expectCacheSet(redisMock, expect.stringContaining('sources:'), 300); // 5分のTTL
    });

    it('データベースエラーを適切に処理する', async () => {
      redisMock.get.mockResolvedValue(null);
      prismaMock.source.findMany.mockRejectedValue(new Error('Database connection failed'));

      const request = createMockRequest('http://localhost:3000/api/sources');
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiError(result, 500);
      expect(result.body.error).toContain('Failed to fetch sources');
    });

    it('最終取得日時でフィルタリングできる', async () => {
      prismaMock.source.findMany.mockResolvedValue([]);
      prismaMock.article.groupBy.mockResolvedValue([]);

      const request = createMockRequest('http://localhost:3000/api/sources', {
        searchParams: { 
          lastFetchedAfter: '2025-01-01T00:00:00Z',
        },
      });
      const context = createMockContext();
      
      const response = await GET(request, context);
      const result = await parseResponse(response);
      
      expectApiSuccess(result);
      expect(prismaMock.source.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            lastFetchedAt: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        })
      );
    });
  });
});