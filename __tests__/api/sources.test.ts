import { GET } from '@/app/api/sources/route';
import {
  testApiHandler,
  createMockPrismaClient,
  createMockRedisClient,
  generateSampleSource,
  expectApiSuccess,
  expectApiError,
} from './test-utils';

// Prismaクライアントのモック
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: createMockPrismaClient(),
}));

// Redisクライアントのモック
const mockRedis = createMockRedisClient();
jest.mock('@/lib/redis', () => ({
  __esModule: true,
  default: mockRedis,
  getRedisClient: () => mockRedis,
}));

// source-statsモジュールのモック
jest.mock('@/lib/source-stats', () => ({
  calculateSourceStats: jest.fn(),
}));

describe('Sources API', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>;
  let mockSourceStats: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = require('@/lib/prisma').default;
    mockSourceStats = require('@/lib/source-stats');
  });

  describe('GET /api/sources', () => {
    it('ソース一覧を正常に取得できる', async () => {
      const sampleSources = [
        generateSampleSource({ id: 'devto', name: 'Dev.to' }),
        generateSampleSource({ id: 'qiita', name: 'Qiita' }),
        generateSampleSource({ id: 'zenn', name: 'Zenn' }),
      ];

      mockPrisma.source.findMany.mockResolvedValue(sampleSources);
      
      // 統計情報のモック
      mockSourceStats.calculateSourceStats.mockResolvedValue({
        devto: { articleCount: 100, avgQualityScore: 85 },
        qiita: { articleCount: 150, avgQualityScore: 82 },
        zenn: { articleCount: 80, avgQualityScore: 88 },
      });

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/sources',
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('sources');
      expect(response.body.sources).toHaveLength(3);
      expect(response.body.sources[0]).toHaveProperty('name', 'Dev.to');
    });

    it('統計情報付きでソースを取得できる', async () => {
      const sampleSources = [
        generateSampleSource({ id: 'devto', name: 'Dev.to' }),
      ];

      mockPrisma.source.findMany.mockResolvedValue(sampleSources);
      
      mockSourceStats.calculateSourceStats.mockResolvedValue({
        devto: {
          articleCount: 100,
          avgQualityScore: 85,
          lastUpdate: new Date().toISOString(),
          trendingTags: ['JavaScript', 'React'],
        },
      });

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/sources',
        searchParams: {
          includeStats: 'true',
        },
      });

      expectApiSuccess(response);
      expect(response.body.sources[0]).toHaveProperty('stats');
      expect(response.body.sources[0].stats).toHaveProperty('articleCount', 100);
      expect(response.body.sources[0].stats).toHaveProperty('avgQualityScore', 85);
    });

    it('カテゴリフィルターが機能する', async () => {
      mockPrisma.source.findMany.mockResolvedValue([
        generateSampleSource({ id: 'devto', category: 'Technology' }),
      ]);

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/sources',
        searchParams: {
          category: 'Technology',
        },
      });

      expectApiSuccess(response);
      expect(mockPrisma.source.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'Technology',
          }),
        })
      );
    });

    it('アクティブなソースのみ取得できる', async () => {
      const activeSources = [
        generateSampleSource({ id: 'devto', isActive: true }),
        generateSampleSource({ id: 'qiita', isActive: true }),
      ];

      mockPrisma.source.findMany.mockResolvedValue(activeSources);

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/sources',
        searchParams: {
          active: 'true',
        },
      });

      expectApiSuccess(response);
      expect(mockPrisma.source.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
          }),
        })
      );
    });

    it('キャッシュが機能する', async () => {
      const cachedData = JSON.stringify({
        sources: [
          generateSampleSource({ id: 'cached-source' }),
        ],
      });
      
      mockRedis.get.mockResolvedValue(cachedData);

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/sources',
      });

      expectApiSuccess(response);
      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockPrisma.source.findMany).not.toHaveBeenCalled();
    });

    it('ソート機能が動作する', async () => {
      mockPrisma.source.findMany.mockResolvedValue([]);

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/sources',
        searchParams: {
          sort: 'name',
          order: 'desc',
        },
      });

      expectApiSuccess(response);
      expect(mockPrisma.source.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: expect.objectContaining({
            name: 'desc',
          }),
        })
      );
    });

    it('統計計算でエラーが発生しても基本情報は返す', async () => {
      const sampleSources = [
        generateSampleSource({ id: 'devto' }),
      ];

      mockPrisma.source.findMany.mockResolvedValue(sampleSources);
      mockSourceStats.calculateSourceStats.mockRejectedValue(
        new Error('Stats calculation failed')
      );

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/sources',
        searchParams: {
          includeStats: 'true',
        },
      });

      expectApiSuccess(response);
      expect(response.body.sources).toHaveLength(1);
      // 統計情報はnullまたは空オブジェクトになるはず
      expect(response.body.sources[0].stats).toBeUndefined();
    });

    it('データベースエラーを適切にハンドリングする', async () => {
      mockPrisma.source.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/sources',
      });

      expectApiError(response, 500);
    });

    it('空のソースリストを正常に返す', async () => {
      mockPrisma.source.findMany.mockResolvedValue([]);

      const response = await testApiHandler(GET, {
        url: 'http://localhost:3000/api/sources',
      });

      expectApiSuccess(response);
      expect(response.body.sources).toEqual([]);
    });
  });

  describe('GET /api/sources/[id]', () => {
    it('特定のソース情報を取得できる', async () => {
      const GET_BY_ID = require('@/app/api/sources/[id]/route').GET;
      
      const sampleSource = generateSampleSource({
        id: 'devto',
        name: 'Dev.to',
      });

      mockPrisma.source.findUnique.mockResolvedValue(sampleSource);

      const response = await testApiHandler(GET_BY_ID, {
        url: 'http://localhost:3000/api/sources/devto',
        params: { id: 'devto' },
      });

      expectApiSuccess(response);
      expect(response.body).toHaveProperty('id', 'devto');
      expect(response.body).toHaveProperty('name', 'Dev.to');
    });

    it('存在しないソースで404を返す', async () => {
      const GET_BY_ID = require('@/app/api/sources/[id]/route').GET;
      
      mockPrisma.source.findUnique.mockResolvedValue(null);

      const response = await testApiHandler(GET_BY_ID, {
        url: 'http://localhost:3000/api/sources/invalid',
        params: { id: 'invalid' },
      });

      expectApiError(response, 404, 'Source not found');
    });
  });
});