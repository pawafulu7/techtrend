/**
 * /api/digest/generate エンドポイントのテスト
 */

import { createRedisCacheMock } from '../../../helpers/cache-mock-helpers';

// モックの設定
jest.mock('@/lib/prisma');
jest.mock('@/lib/services/digest-generator');
jest.mock('@/lib/logger');

// モックインスタンスを保持する変数
let mockCacheInstance: ReturnType<typeof createRedisCacheMock>;

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => {
    const { createRedisCacheMock } = require('../../../helpers/cache-mock-helpers');
    if (!mockCacheInstance) {
      mockCacheInstance = createRedisCacheMock();
    }
    return mockCacheInstance;
  }),
  getCache: jest.fn(() => {
    const { createRedisCacheMock } = require('../../../helpers/cache-mock-helpers');
    if (!mockCacheInstance) {
      mockCacheInstance = createRedisCacheMock();
    }
    return mockCacheInstance;
  })
}));

import { prisma } from '@/lib/prisma';
import { DigestGenerator } from '@/lib/services/digest-generator';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/digest/generate/route';

// モックの型定義
const prismaMock = prisma as any;
const DigestGeneratorMock = DigestGenerator as jest.MockedClass<typeof DigestGenerator>;
const RedisCacheMock = RedisCache as jest.MockedClass<typeof RedisCache>;
const loggerMock = logger as any;

describe('/api/digest/generate', () => {
  let mockGeneratorInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Logger モック設定
    loggerMock.info = jest.fn();
    loggerMock.error = jest.fn();
    loggerMock.warn = jest.fn();
    
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
      generateWeeklyDigest: jest.fn().mockResolvedValue('digest-id-123'),
    };
    
    // DigestGeneratorコンストラクタのモック
    DigestGeneratorMock.mockImplementation(() => mockGeneratorInstance as any);
  });

  describe('POST', () => {
    it('日付指定なしで週次ダイジェストを生成する', async () => {
      const request = new NextRequest('http://localhost/api/digest/generate', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual({
        success: true,
        digestId: 'digest-id-123',
      });
      
      expect(mockGeneratorInstance.generateWeeklyDigest).toHaveBeenCalledWith(undefined);
      expect(mockCacheInstance.del).toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith({ digestId: 'digest-id-123' }, 'Weekly digest generated');
    });

    it('特定の日付で週次ダイジェストを生成する', async () => {
      const testDate = '2025-01-01';
      const request = new NextRequest('http://localhost/api/digest/generate', {
        method: 'POST',
        body: JSON.stringify({ date: testDate }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual({
        success: true,
        digestId: 'digest-id-123',
      });
      
      expect(mockGeneratorInstance.generateWeeklyDigest).toHaveBeenCalledWith(new Date(testDate));
      
      // The cache key should use the Monday of the week for the given date
      // 2025-01-01 is a Wednesday, so Monday is 2024-12-29
      expect(mockCacheInstance.generateCacheKey).toHaveBeenCalledWith('weekly-digest', {
        params: { week: '2024-12-29' }
      });
      expect(mockCacheInstance.del).toHaveBeenCalled();
    });

    it('無効な日付形式でエラーを返す', async () => {
      const request = new NextRequest('http://localhost/api/digest/generate', {
        method: 'POST',
        body: JSON.stringify({ date: 'invalid-date' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data).toEqual({
        error: 'Invalid date format',
      });
      
      expect(mockGeneratorInstance.generateWeeklyDigest).not.toHaveBeenCalled();
    });

    it('無効なJSONでエラーを返す', async () => {
      const request = new NextRequest('http://localhost/api/digest/generate', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      
      expect(data).toEqual({
        error: 'Invalid JSON in request body',
      });
      
      expect(mockGeneratorInstance.generateWeeklyDigest).not.toHaveBeenCalled();
    });

    it('ダイジェスト生成エラーの場合500を返す', async () => {
      mockGeneratorInstance.generateWeeklyDigest.mockRejectedValue(new Error('Generation failed'));

      const request = new NextRequest('http://localhost/api/digest/generate', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      
      expect(data).toEqual({
        error: 'Failed to generate digest',
      });
      
      expect(loggerMock.error).toHaveBeenCalled();
      const [firstArg, message] = loggerMock.error.mock.calls[0];
      expect(message).toBe('Failed to generate digest');
      if (firstArg instanceof Error) {
        expect(firstArg).toBeInstanceOf(Error);
      } else {
        expect(firstArg).toEqual(
          expect.objectContaining(
            firstArg.err
              ? { err: expect.any(Error) }
              : { error: expect.any(Error) }
          )
        );
      }
    });

    it('キャッシュ削除エラーでも処理を続行する', async () => {
      mockCacheInstance.del.mockRejectedValue(new Error('Cache error'));

      const request = new NextRequest('http://localhost/api/digest/generate', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);

      // キャッシュエラーでも成功レスポンスを返す
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual({
        success: true,
        digestId: 'digest-id-123',
      });
    });

    it('空のボディでも正常に処理する', async () => {
      const request = new NextRequest('http://localhost/api/digest/generate', {
        method: 'POST',
        body: JSON.stringify(null),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toEqual({
        success: true,
        digestId: 'digest-id-123',
      });
      
      expect(mockGeneratorInstance.generateWeeklyDigest).toHaveBeenCalledWith(undefined);
    });
  });
});