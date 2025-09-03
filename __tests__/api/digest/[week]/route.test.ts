/**
 * /api/digest/[week] エンドポイントのテスト
 */

import { createRedisCacheMock } from '../../../helpers/cache-mock-helpers';

// モックの設定
jest.mock('@/lib/prisma');
jest.mock('@/lib/services/digest-generator');

// モックインスタンスを保持する変数
let mockCacheInstance: ReturnType<typeof createRedisCacheMock>;

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => {
    const { createRedisCacheMock } = require('../../../helpers/cache-mock-helpers');
    if (!mockCacheInstance) {
      mockCacheInstance = createRedisCacheMock();
    }
    return mockCacheInstance;
  })
}));

import { GET } from '@/app/api/digest/[week]/route';
import { prisma } from '@/lib/prisma';
import { DigestGenerator } from '@/lib/services/digest-generator';
import { RedisCache } from '@/lib/cache';
import { NextRequest } from 'next/server';

// モックの型定義
const prismaMock = prisma as any;
const DigestGeneratorMock = DigestGenerator as jest.MockedClass<typeof DigestGenerator>;
const RedisCacheMock = RedisCache as jest.MockedClass<typeof RedisCache>;

describe('/api/digest/[week]', () => {
  let mockGeneratorInstance: any;

  const mockDigest = {
    id: 'digest-1',
    weekStartDate: '2025-01-01T00:00:00.000Z',
    weekEndDate: '2025-01-07T00:00:00.000Z',
    topArticles: [
      {
        id: 'article1',
        title: 'Top Article 1',
        url: 'https://example.com/1',
        summary: 'Summary 1',
        score: 95,
      },
      {
        id: 'article2',
        title: 'Top Article 2',
        url: 'https://example.com/2',
        summary: 'Summary 2',
        score: 90,
      },
    ],
    topAuthors: [
      { name: 'Author 1', articleCount: 5 },
      { name: 'Author 2', articleCount: 3 },
    ],
    topTags: [
      { name: 'React', count: 10 },
      { name: 'TypeScript', count: 8 },
    ],
    stats: {
      totalArticles: 50,
      avgQualityScore: 85,
      totalViews: 1000,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // キャッシュモックのリセット（mockCacheInstanceが初期化されていることを確認）
    if (!mockCacheInstance) {
      mockCacheInstance = createRedisCacheMock();
    }
    mockCacheInstance.get.mockResolvedValue(null);
    mockCacheInstance.set.mockResolvedValue(undefined);
    mockCacheInstance.del.mockResolvedValue(undefined);
    mockCacheInstance.generateCacheKey.mockClear();
    mockCacheInstance.generateCacheKey.mockImplementation((base: string, options: any) => {
      if (options?.params) {
        return `${base}:${options.params.week}`;
      }
      return base;
    });
    
    // DigestGenerator インスタンスのモック
    mockGeneratorInstance = {
      getWeeklyDigest: jest.fn().mockResolvedValue(mockDigest),
      generateWeeklyDigest: jest.fn(),
    };
    
    // DigestGeneratorコンストラクタのモック
    DigestGeneratorMock.mockImplementation(() => mockGeneratorInstance as any);
  });

  describe('GET', () => {
    it('週次ダイジェストを取得する（キャッシュなし）', async () => {
      const request = new NextRequest('http://localhost/api/digest/2025-01-01');
      const params = { week: '2025-01-01' };

      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual(mockDigest);
      expect(mockGeneratorInstance.getWeeklyDigest).toHaveBeenCalledWith(new Date('2025-01-01'));
      expect(mockCacheInstance.set).toHaveBeenCalledWith(
        'weekly-digest:2025-01-01',
        mockDigest,
        3600
      );
    });

    it('キャッシュから週次ダイジェストを返す', async () => {
      mockCacheInstance.get.mockResolvedValue(mockDigest);

      const request = new NextRequest('http://localhost/api/digest/2025-01-01');
      const params = { week: '2025-01-01' };

      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual(mockDigest);
      expect(mockGeneratorInstance.getWeeklyDigest).not.toHaveBeenCalled();
      expect(mockCacheInstance.get).toHaveBeenCalledWith('weekly-digest:2025-01-01');
    });

    it('無効な日付形式でエラーを返す', async () => {
      const request = new NextRequest('http://localhost/api/digest/invalid-date');
      const params = { week: 'invalid-date' };

      const response = await GET(request, { params });

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data).toEqual({
        error: 'Invalid date format',
      });
      
      expect(mockGeneratorInstance.getWeeklyDigest).not.toHaveBeenCalled();
    });

    it('ダイジェストが見つからない場合404を返す', async () => {
      mockGeneratorInstance.getWeeklyDigest.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/digest/2025-01-01');
      const params = { week: '2025-01-01' };

      const response = await GET(request, { params });

      expect(response.status).toBe(404);
      const data = await response.json();
      
      expect(data).toEqual({
        error: 'Digest not found',
      });
      
      expect(mockCacheInstance.set).not.toHaveBeenCalled();
    });

    it('ダイジェスト取得エラーの場合500を返す', async () => {
      mockGeneratorInstance.getWeeklyDigest.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/digest/2025-01-01');
      const params = { week: '2025-01-01' };

      const response = await GET(request, { params });

      expect(response.status).toBe(500);
      const data = await response.json();
      
      expect(data).toEqual({
        error: 'Failed to get digest',
      });
    });

    it('キャッシュエラーでも処理を続行する', async () => {
      mockCacheInstance.get.mockRejectedValue(new Error('Cache error'));

      const request = new NextRequest('http://localhost/api/digest/2025-01-01');
      const params = { week: '2025-01-01' };

      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual(mockDigest);
      expect(mockGeneratorInstance.getWeeklyDigest).toHaveBeenCalled();
    });

    it('キャッシュ保存エラーでも成功レスポンスを返す', async () => {
      mockCacheInstance.set.mockRejectedValue(new Error('Cache set error'));

      const request = new NextRequest('http://localhost/api/digest/2025-01-01');
      const params = { week: '2025-01-01' };

      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual(mockDigest);
    });

    it('異なる週の日付でも正しくキャッシュキーを生成する', async () => {
      const request = new NextRequest('http://localhost/api/digest/2025-02-15');
      const params = { week: '2025-02-15' };

      const response = await GET(request, { params });

      expect(response.status).toBe(200);
      
      expect(mockCacheInstance.generateCacheKey).toHaveBeenCalledWith('weekly-digest', {
        params: { week: '2025-02-15' }
      });
      expect(mockCacheInstance.get).toHaveBeenCalledWith('weekly-digest:2025-02-15');
    });
  });
});