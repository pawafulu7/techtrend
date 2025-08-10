/**
 * APIテスト - Articles (シンプル版)
 * Manual Mocksを使用した簡略化されたテスト
 */

import { NextRequest, NextResponse } from 'next/server';

// Manual mocksを直接インポート
import prismaMock from '../../__mocks__/lib/prisma';
import redisMock from '../../__mocks__/lib/redis/client';

// モジュールのモック設定（moduleNameMapperで解決）
jest.mock('@/lib/database');
jest.mock('@/lib/redis/client');

describe('Articles API Simple Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // デフォルトのモック値を設定
    prismaMock.article.findMany.mockResolvedValue([]);
    prismaMock.article.count.mockResolvedValue(0);
    prismaMock.article.findUnique.mockResolvedValue(null);
    prismaMock.article.findFirst.mockResolvedValue(null);
    prismaMock.article.create.mockResolvedValue({
      id: 'test-id',
      title: 'Test Article',
      url: 'https://test.com',
      content: 'Test content',
      summary: null,
      publishedAt: new Date(),
      sourceId: 'test-source',
      imageUrl: null,
      author: null,
      viewCount: 0,
      favoriteCount: 0,
      qualityScore: null,
      summaryVersion: null,
      articleType: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue('OK');
    redisMock.setex.mockResolvedValue('OK');
    redisMock.del.mockResolvedValue(1);
  });

  describe('GET /api/articles', () => {
    it('記事一覧を正常に取得できる', async () => {
      // モックデータの設定
      const mockArticles = [
        {
          id: '1',
          title: 'Article 1',
          url: 'https://example.com/1',
          content: 'Content 1',
          summary: 'Summary 1',
          publishedAt: new Date('2025-01-01'),
          sourceId: 'dev.to',
          imageUrl: null,
          author: 'Author 1',
          viewCount: 100,
          favoriteCount: 10,
          qualityScore: 85,
          summaryVersion: 5,
          articleType: 'unified',
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
      ];
      
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(1);
      
      // APIハンドラーのインポート（動的）
      const { GET } = await import('@/app/api/articles/route');
      
      // リクエストの作成
      const request = new NextRequest('http://localhost:3000/api/articles');
      
      // ハンドラーの実行
      const response = await GET(request);
      
      // レスポンスの検証
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.articles).toBeDefined();
      expect(body.articles).toHaveLength(1);
      expect(body.total).toBe(1);
      
      // モックの呼び出し確認
      expect(prismaMock.article.findMany).toHaveBeenCalled();
      expect(prismaMock.article.count).toHaveBeenCalled();
    });

    it('キャッシュが機能する', async () => {
      // キャッシュデータの設定
      const cachedData = JSON.stringify({
        articles: [{ id: '1', title: 'Cached Article' }],
        total: 1,
      });
      
      redisMock.get.mockResolvedValue(cachedData);
      
      // APIハンドラーのインポート
      const { GET } = await import('@/app/api/articles/route');
      
      // リクエストの作成
      const request = new NextRequest('http://localhost:3000/api/articles');
      
      // ハンドラーの実行
      const response = await GET(request);
      
      // レスポンスの検証
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.articles).toHaveLength(1);
      expect(body.articles[0].title).toBe('Cached Article');
      
      // Redisキャッシュが使用されたことを確認
      expect(redisMock.get).toHaveBeenCalled();
      // データベースが呼ばれないことを確認
      expect(prismaMock.article.findMany).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/articles', () => {
    it('新しい記事を作成できる', async () => {
      const newArticle = {
        title: 'New Article',
        url: 'https://example.com/new',
        content: 'New content',
        sourceId: 'test-source',
      };
      
      // 重複チェック用のモック
      prismaMock.article.findFirst.mockResolvedValue(null);
      
      // APIハンドラーのインポート
      const { POST } = await import('@/app/api/articles/route');
      
      // リクエストの作成
      const request = new NextRequest('http://localhost:3000/api/articles', {
        method: 'POST',
        body: JSON.stringify(newArticle),
      });
      
      // ハンドラーの実行
      const response = await POST(request);
      
      // レスポンスの検証
      expect(response.status).toBe(201);
      
      const body = await response.json();
      expect(body.id).toBe('test-id');
      expect(body.title).toBe('Test Article');
      
      // モックの呼び出し確認
      expect(prismaMock.article.create).toHaveBeenCalled();
      expect(redisMock.del).toHaveBeenCalled(); // キャッシュクリア
    });

    it('重複URLの記事作成を防ぐ', async () => {
      const duplicateArticle = {
        title: 'Duplicate Article',
        url: 'https://example.com/duplicate',
        content: 'Content',
        sourceId: 'test-source',
      };
      
      // 重複する記事が存在する
      prismaMock.article.findFirst.mockResolvedValue({
        id: 'existing',
        url: duplicateArticle.url,
      });
      
      // APIハンドラーのインポート
      const { POST } = await import('@/app/api/articles/route');
      
      // リクエストの作成
      const request = new NextRequest('http://localhost:3000/api/articles', {
        method: 'POST',
        body: JSON.stringify(duplicateArticle),
      });
      
      // ハンドラーの実行
      const response = await POST(request);
      
      // レスポンスの検証
      expect(response.status).toBe(409);
      
      const body = await response.json();
      expect(body.error).toContain('already exists');
      
      // 記事が作成されないことを確認
      expect(prismaMock.article.create).not.toHaveBeenCalled();
    });
  });
});