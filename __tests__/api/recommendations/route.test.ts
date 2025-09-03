/**
 * /api/recommendations エンドポイントのテスト
 */

// モックの設定
jest.mock('@/lib/database');
jest.mock('@/lib/auth/auth');
jest.mock('@/lib/redis/factory');
jest.mock('@/lib/recommendation/recommendation-service');

import { GET } from '@/app/api/recommendations/route';
import { auth } from '@/lib/auth/auth';
import { getRedisService } from '@/lib/redis/factory';
import { recommendationService } from '@/lib/recommendation/recommendation-service';
import { NextRequest } from 'next/server';

const authMock = auth as jest.MockedFunction<typeof auth>;
const recommendationServiceMock = recommendationService as any;
const getRedisServiceMock = getRedisService as jest.Mock;

// モック関数のヘルパー
const setUnauthenticated = () => authMock.mockResolvedValue(null);
const resetMockSession = () => authMock.mockResolvedValue({
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
});

describe('/api/recommendations', () => {
  let redisServiceMock: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockSession();
    
    // Redisサービスモックを作成
    redisServiceMock = {
      getJSON: jest.fn().mockResolvedValue(null),
      setJSON: jest.fn().mockResolvedValue(undefined),
      clearPattern: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    
    // getRedisServiceがモックを返すよう設定
    (getRedisService as jest.Mock).mockReturnValue(redisServiceMock);
    
    // recommendationServiceのモック設定
    recommendationServiceMock.getRecommendations = jest.fn();
  });

  describe('GET', () => {
    const mockRecommendations = [
      {
        id: 'article1',
        title: 'Recommended Article 1',
        url: 'https://example.com/1',
        summary: 'Summary 1',
        publishedAt: new Date('2025-01-01'),
        score: 0.95,
        source: {
          id: 'qiita',
          name: 'Qiita',
        },
        tags: [
          { id: 't1', name: 'React' },
        ],
      },
      {
        id: 'article2',
        title: 'Recommended Article 2',
        url: 'https://example.com/2',
        summary: 'Summary 2',
        publishedAt: new Date('2025-01-02'),
        score: 0.90,
        source: {
          id: 'zenn',
          name: 'Zenn',
        },
        tags: [
          { id: 't2', name: 'TypeScript' },
        ],
      },
    ];

    it('認証済みユーザーの推薦記事を返す（キャッシュなし）', async () => {
      redisServiceMock.getJSON.mockResolvedValue(null);
      recommendationServiceMock.getRecommendations.mockResolvedValue(mockRecommendations);

      const request = new NextRequest('http://localhost/api/recommendations');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual(mockRecommendations);
      expect(recommendationServiceMock.getRecommendations).toHaveBeenCalledWith('test-user-id', 10);
      expect(redisServiceMock.setJSON).toHaveBeenCalledWith(
        'recommendations:test-user-id:10',
        mockRecommendations,
        300
      );
    });

    it('キャッシュから推薦記事を返す', async () => {
      redisServiceMock.getJSON.mockResolvedValue(mockRecommendations);

      const request = new NextRequest('http://localhost/api/recommendations');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual(mockRecommendations);
      expect(recommendationServiceMock.getRecommendations).not.toHaveBeenCalled();
      expect(redisServiceMock.getJSON).toHaveBeenCalledWith('recommendations:test-user-id:10');
    });

    it('カスタムlimitパラメータを処理する', async () => {
      redisServiceMock.getJSON.mockResolvedValue(null);
      recommendationServiceMock.getRecommendations.mockResolvedValue(mockRecommendations);

      const request = new NextRequest('http://localhost/api/recommendations?limit=20');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      expect(recommendationServiceMock.getRecommendations).toHaveBeenCalledWith('test-user-id', 20);
      expect(redisServiceMock.setJSON).toHaveBeenCalledWith(
        'recommendations:test-user-id:20',
        mockRecommendations,
        300
      );
    });

    it('limitパラメータを最大30に制限する', async () => {
      redisServiceMock.getJSON.mockResolvedValue(null);
      recommendationServiceMock.getRecommendations.mockResolvedValue(mockRecommendations);

      const request = new NextRequest('http://localhost/api/recommendations?limit=50');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      expect(recommendationServiceMock.getRecommendations).toHaveBeenCalledWith('test-user-id', 30);
    });

    it('limitパラメータを最小1に制限する', async () => {
      redisServiceMock.getJSON.mockResolvedValue(null);
      recommendationServiceMock.getRecommendations.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/recommendations?limit=0');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      expect(recommendationServiceMock.getRecommendations).toHaveBeenCalledWith('test-user-id', 1);
    });

    it('未認証の場合401を返す', async () => {
      setUnauthenticated();

      const request = new NextRequest('http://localhost/api/recommendations');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
      expect(recommendationServiceMock.getRecommendations).not.toHaveBeenCalled();
    });

    it('推薦サービスエラーの場合500を返す', async () => {
      redisServiceMock.getJSON.mockResolvedValue(null);
      recommendationServiceMock.getRecommendations.mockRejectedValue(new Error('Service error'));

      const request = new NextRequest('http://localhost/api/recommendations');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to get recommendations');
    });

    it('Redisエラーでも処理を続行する', async () => {
      redisServiceMock.getJSON.mockRejectedValue(new Error('Redis error'));
      recommendationServiceMock.getRecommendations.mockResolvedValue(mockRecommendations);

      const request = new NextRequest('http://localhost/api/recommendations');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual(mockRecommendations);
      expect(recommendationServiceMock.getRecommendations).toHaveBeenCalled();
    });

    it('空の推薦リストを正しく処理する', async () => {
      redisServiceMock.getJSON.mockResolvedValue(null);
      recommendationServiceMock.getRecommendations.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/recommendations');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual([]);
      expect(redisServiceMock.setJSON).toHaveBeenCalledWith(
        'recommendations:test-user-id:10',
        [],
        300
      );
    });
  });
});