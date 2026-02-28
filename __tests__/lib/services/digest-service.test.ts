/**
 * DigestService ユニットテスト
 *
 * キャッシュ、プリファレンス判定、重複排除、各セクション生成をテスト
 */

jest.mock('@/lib/personalization/category-filter-service', () => ({
  CategoryFilterService: jest.fn(),
  categoryFilterService: {
    filterArticles: jest.fn(),
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  sanitizeError: jest.fn((e: any) => e),
}));

import { DigestService, DIGEST_CONFIG } from '@/lib/services/digest-service';
import type { DigestResponse } from '@/lib/services/digest-service';
import { prisma } from '@/lib/prisma';
import { categoryFilterService } from '@/lib/personalization/category-filter-service';

const prismaMock = prisma as any;
const filterServiceMock = categoryFilterService as jest.Mocked<
  typeof categoryFilterService
>;

describe('DigestService', () => {
  let service: DigestService;
  let mockCache: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    service = new DigestService(
      prismaMock,
      mockCache,
      filterServiceMock as any
    );

    // デフォルトのPrismaモック設定（mockDeepのメソッドに直接設定）
    prismaMock.userCategoryPreference.count.mockResolvedValue(0);
    prismaMock.userCategoryPreference.findMany.mockResolvedValue([]);
    prismaMock.interestCategory.findMany.mockResolvedValue([
      { name: 'フロントエンド' },
    ]);
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  describe('getDigest', () => {
    it('キャッシュヒット時はキャッシュからレスポンスを返す', async () => {
      const cachedResponse: DigestResponse = {
        period: 'daily',
        sections: [
          { type: 'personalized', title: 'あなたへのおすすめ', articles: [] },
          { type: 'mustRead', title: '必読記事', articles: [] },
          { type: 'missed', title: '見逃した注目記事', articles: [] },
        ],
        generatedAt: new Date().toISOString(),
        hasPreferences: true,
      };
      mockCache.get.mockResolvedValue(cachedResponse);

      const result = await service.getDigest('user-1', 'daily');

      expect(result).toEqual(cachedResponse);
      expect(mockCache.get).toHaveBeenCalledWith('digest:user-1:daily');
      // キャッシュヒット時はDBアクセスしない
      expect(prismaMock.userCategoryPreference.count).not.toHaveBeenCalled();
    });

    it('プリファレンスが無い場合はhasPreferences: falseで空セクションを返す', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(0);

      const result = await service.getDigest('user-1', 'daily');

      expect(result.hasPreferences).toBe(false);
      expect(result.sections).toHaveLength(0);
      expect(result.period).toBe('daily');
      expect(result.generatedAt).toBeDefined();
      // キャッシュに保存しない（早期リターン）
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('プリファレンスがある場合は3セクション全てを返す', async () => {
      // プリファレンス設定
      prismaMock.userCategoryPreference.count.mockResolvedValue(2);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
        { categoryId: 'cat-2' },
      ]);

      // filterArticles結果（personalizedセクション用）
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [
          { articleId: 'article-1', score: 0.9 },
          { articleId: 'article-2', score: 0.8 },
        ],
        total: 2,
      } as any);

      // personalized記事のクエリ結果
      const personalizedRows = [
        {
          id: 'article-1',
          title: 'Personalized Article 1',
          url: 'https://example.com/1',
          summary: 'Summary 1',
          thumbnail: null,
          publishedAt: new Date('2026-02-28'),
          qualityScore: 85,
          sourceId: 'source-1',
        },
      ];

      // mustRead記事のクエリ結果
      const mustReadRows = [
        {
          id: 'article-3',
          title: 'Must Read Article',
          url: 'https://example.com/3',
          summary: 'Must read summary',
          thumbnail: null,
          publishedAt: new Date('2026-02-28'),
          qualityScore: 90,
          sourceId: 'source-2',
          viewer_count: BigInt(50),
        },
      ];

      // missed記事のクエリ結果
      const missedRows = [
        {
          id: 'article-5',
          title: 'Missed Article',
          url: 'https://example.com/5',
          summary: 'Missed summary',
          thumbnail: null,
          publishedAt: new Date('2026-02-27'),
          qualityScore: 80,
          sourceId: 'source-3',
        },
      ];

      // $queryRawは3回呼ばれる（personalized, mustRead, missed）
      prismaMock.$queryRaw
        .mockResolvedValueOnce(personalizedRows)
        .mockResolvedValueOnce(mustReadRows)
        .mockResolvedValueOnce(missedRows);

      const result = await service.getDigest('user-1', 'daily');

      expect(result.hasPreferences).toBe(true);
      expect(result.period).toBe('daily');
      expect(result.sections).toHaveLength(3);

      // personalizedセクション
      expect(result.sections[0].type).toBe('personalized');
      expect(result.sections[0].title).toBe('あなたへのおすすめ');
      expect(result.sections[0].articles).toHaveLength(1);
      expect(result.sections[0].articles[0].articleId).toBe('article-1');
      expect(result.sections[0].articles[0].recommendationReason).toBe(
        'あなたの興味: フロントエンド'
      );

      // mustReadセクション
      expect(result.sections[1].type).toBe('mustRead');
      expect(result.sections[1].title).toBe('必読記事');
      expect(result.sections[1].articles).toHaveLength(1);
      expect(result.sections[1].articles[0].recommendationReason).toContain(
        '注目度トップ'
      );

      // missedセクション
      expect(result.sections[2].type).toBe('missed');
      expect(result.sections[2].title).toBe('見逃した注目記事');
      expect(result.sections[2].articles).toHaveLength(1);

      // filterArticlesの呼び出し確認
      expect(filterServiceMock.filterArticles).toHaveBeenCalledWith({
        categoryIds: ['cat-1', 'cat-2'],
        periodMonths: 12,
        limit: DIGEST_CONFIG.PERSONALIZED_LIMIT,
      });
    });

    it('重複排除: mustReadはpersonalized IDを除外する', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);

      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [{ articleId: 'article-1', score: 0.9 }],
        total: 1,
      } as any);

      // personalized → article-1を返す
      prismaMock.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'article-1',
            title: 'Article 1',
            url: 'https://example.com/1',
            summary: null,
            thumbnail: null,
            publishedAt: new Date(),
            qualityScore: 85,
            sourceId: 'source-1',
          },
        ])
        // mustRead → 空（excludeIdsにarticle-1が含まれるため）
        .mockResolvedValueOnce([])
        // missed → 空（excludeIdsにarticle-1が含まれるため）
        .mockResolvedValueOnce([]);

      const result = await service.getDigest('user-1', 'daily');

      // $queryRawが3回呼ばれることを確認（重複排除ロジックが動作）
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(3);
      expect(result.sections[0].articles).toHaveLength(1);
      expect(result.sections[1].articles).toHaveLength(0);
      expect(result.sections[2].articles).toHaveLength(0);
    });

    it('キャッシュミス時に記事があればキャッシュへ保存する', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [{ articleId: 'article-1', score: 0.9 }],
        total: 1,
      } as any);
      // personalized: 1記事, mustRead: 空, missed: 空
      prismaMock.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'article-1',
            title: 'Article 1',
            url: 'https://example.com/1',
            summary: null,
            thumbnail: null,
            publishedAt: new Date(),
            qualityScore: 85,
            sourceId: 'source-1',
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getDigest('user-1', 'weekly');

      expect(mockCache.set).toHaveBeenCalledTimes(1);
      const [cacheKey, cacheValue] = mockCache.set.mock.calls[0];
      expect(cacheKey).toBe('digest:user-1:weekly');
      expect(cacheValue.period).toBe('weekly');
      expect(cacheValue.hasPreferences).toBe(true);
      expect(cacheValue.sections).toHaveLength(3);
    });

    it('全セクションが空の場合はキャッシュに保存しない', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [],
        total: 0,
      } as any);
      prismaMock.$queryRaw.mockResolvedValue([]);

      await service.getDigest('user-1', 'daily');

      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('キャッシュ読み込み失敗時もDBから取得して正常に動作する', async () => {
      mockCache.get.mockRejectedValue(new Error('Redis connection failed'));
      prismaMock.userCategoryPreference.count.mockResolvedValue(0);

      const result = await service.getDigest('user-1', 'daily');

      // キャッシュエラーでも正常レスポンスを返す
      expect(result.hasPreferences).toBe(false);
      expect(result.sections).toHaveLength(0);
    });

    it('キャッシュ書き込み失敗時もレスポンスを返す', async () => {
      mockCache.set.mockRejectedValue(new Error('Redis write failed'));
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [],
        total: 0,
      } as any);
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await service.getDigest('user-1', 'daily');

      // キャッシュ書き込みエラーでもレスポンスは返す
      expect(result.hasPreferences).toBe(true);
      expect(result.sections).toHaveLength(3);
    });

    it('filterArticlesがエラーを返す場合、personalizedセクションは空になる', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      filterServiceMock.filterArticles.mockRejectedValue(
        new Error('Embedding service unavailable')
      );
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await service.getDigest('user-1', 'daily');

      expect(result.sections[0].type).toBe('personalized');
      expect(result.sections[0].articles).toHaveLength(0);
      // mustRead/missedは独立して取得される
      expect(result.sections).toHaveLength(3);
    });
  });

  describe('invalidateUserCache', () => {
    it('daily/weeklyの両方のキャッシュを削除する', async () => {
      await service.invalidateUserCache('user-1');
      expect(mockCache.delete).toHaveBeenCalledTimes(2);
      expect(mockCache.delete).toHaveBeenCalledWith('digest:user-1:daily');
      expect(mockCache.delete).toHaveBeenCalledWith('digest:user-1:weekly');
    });

    it('キャッシュ削除失敗時もエラーを投げない', async () => {
      mockCache.delete.mockRejectedValue(new Error('Redis connection failed'));
      await expect(
        service.invalidateUserCache('user-1')
      ).resolves.toBeUndefined();
    });
  });
});
