/**
 * APIテスト - Articles (シンプル版)
 * Manual Mocksを使用した簡略化されたテスト
 */

// モジュールのモック設定
jest.mock('@/lib/database');
jest.mock('@/lib/redis/client');

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '@/app/api/articles/route';
import { prisma } from '@/lib/database';
import { getRedisClient } from '@/lib/redis/client';

// モックインスタンスを取得
const prismaMock = prisma as any;
const redisMock = getRedisClient() as any;

describe.skip('Articles API Simple Tests', () => {
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
      thumbnail: null,
      publishedAt: new Date(),
      sourceId: 'test-source',
      bookmarks: 0,
      userVotes: 0,
      qualityScore: 0,
      difficulty: null,
      detailedSummary: null,
      summaryVersion: 1,
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
          thumbnail: null,
          publishedAt: new Date('2025-01-01'),
          sourceId: 'dev.to',
          bookmarks: 0,
          userVotes: 0,
          qualityScore: 85,
          difficulty: null,
          detailedSummary: null,
          summaryVersion: 5,
          articleType: 'unified',
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
        },
      ];
      
      prismaMock.article.findMany.mockResolvedValue(mockArticles);
      prismaMock.article.count.mockResolvedValue(1);
      
      // GETハンドラーは既にインポート済み
      
      // リクエストの作成
      const request = new NextRequest('http://localhost:3000/api/articles');
      
      // ハンドラーの実行
      const response = await GET(request);
      
      // レスポンスの検証
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.items).toHaveLength(1);
      expect(body.data.total).toBe(1);
      
      // モックの呼び出し確認
      expect(prismaMock.article.findMany).toHaveBeenCalled();
      expect(prismaMock.article.count).toHaveBeenCalled();
    });

    it('キャッシュが機能する', async () => {
      // キャッシュデータの設定（実際のAPI応答構造に合わせる）
      const cachedData = JSON.stringify({
        items: [{ 
          id: '1', 
          title: 'Cached Article',
          url: 'https://cached.com',
          summary: 'Cached summary',
          thumbnail: null,
          content: null,
          publishedAt: new Date('2025-01-01'),
          sourceId: 'cached-source',
          bookmarks: 0,
          userVotes: 0,
          qualityScore: 85,
          difficulty: null,
          detailedSummary: null,
          summaryVersion: 1,
          articleType: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01')
        }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1
      });
      
      redisMock.get.mockResolvedValueOnce(cachedData);
      
      // ハンドラーは既にインポート済み
      
      // リクエストの作成
      const request = new NextRequest('http://localhost:3000/api/articles');
      
      // ハンドラーの実行
      const response = await GET(request);
      
      // レスポンスの検証
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].title).toBe('Cached Article');
      
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
        publishedAt: new Date().toISOString(),
        tagNames: []
      };
      
      // 重複チェック用のモック（findUniqueを使用）
      prismaMock.article.findUnique.mockResolvedValueOnce(null);
      
      // 作成時のモックを正しい構造で設定
      prismaMock.article.create.mockResolvedValueOnce({
        id: 'test-id',
        title: 'New Article',
        url: 'https://example.com/new',
        content: 'New content',
        summary: null,
        thumbnail: null,
        publishedAt: new Date(),
        sourceId: 'test-source',
        bookmarks: 0,
        userVotes: 0,
        qualityScore: 0,
        difficulty: null,
        detailedSummary: null,
        summaryVersion: 1,
        articleType: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        source: {
          id: 'test-source',
          name: 'Test Source',
          type: 'test',
          url: 'https://test.com',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        tags: []
      });
      
      // keysとdelのモックを設定
      redisMock.keys.mockResolvedValueOnce(['cache:key1', 'cache:key2']);
      redisMock.del.mockResolvedValueOnce(2);
      
      // ハンドラーは既にインポート済み
      
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
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe('test-id');
      expect(body.data.title).toBe('New Article');
      
      // モックの呼び出し確認
      expect(prismaMock.article.create).toHaveBeenCalled();
      expect(redisMock.keys).toHaveBeenCalled(); // キャッシュパターン検索
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
      prismaMock.article.findUnique.mockResolvedValue({
        id: 'existing',
        title: 'Existing Article',
        url: duplicateArticle.url,
        content: null,
        summary: null,
        thumbnail: null,
        publishedAt: new Date(),
        sourceId: 'test-source',
        bookmarks: 0,
        userVotes: 0,
        qualityScore: 0,
        difficulty: null,
        detailedSummary: null,
        summaryVersion: 1,
        articleType: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      // ハンドラーは既にインポート済み
      
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