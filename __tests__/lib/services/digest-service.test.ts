/**
 * DigestService ユニットテスト
 *
 * キャッシュ、プリファレンス判定、重複排除、各セクション生成をテスト
 */

jest.mock('@/lib/personalization/category-filter-service', () => ({
  CategoryFilterService: jest.fn(),
  categoryFilterService: {
    filterArticles: jest.fn(),
    getActiveCategories: jest.fn(),
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

// テスト用のカテゴリデータ
const mockAllCategories = [
  {
    id: 'cat-1',
    slug: 'frontend',
    name: 'フロントエンド',
    description: null,
    icon: null,
    sortOrder: 1,
    isActive: true,
  },
];

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

    // filterArticles / getActiveCategories のデフォルトモック（各テストで上書き可能）
    // jest.clearAllMocks() は実装をクリアしないが、明示的に再設定することで確実に初期化する
    (filterServiceMock as any).filterArticles = jest.fn();
    (filterServiceMock as any).getActiveCategories = jest.fn();
    filterServiceMock.getActiveCategories.mockResolvedValue(mockAllCategories);
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
        selectedCategories: ['cat-1'],
        categories: mockAllCategories,
      };
      mockCache.get.mockResolvedValue(cachedResponse);

      const result = await service.getDigest('user-1', 'daily');

      expect(result).toEqual(cachedResponse);
      expect(mockCache.get).toHaveBeenCalledWith('digest:user-1:daily');
      // キャッシュヒット時はDBアクセスしない
      expect(prismaMock.userCategoryPreference.count).not.toHaveBeenCalled();
    });

    it('プリファレンスが無い場合はhasPreferences: falseで空記事の3セクションを返す', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(0);

      const result = await service.getDigest('user-1', 'daily');

      expect(result.hasPreferences).toBe(false);
      expect(result.sections).toHaveLength(3);
      expect(result.sections[0]).toEqual(
        expect.objectContaining({ type: 'personalized', articles: [] })
      );
      expect(result.sections[1]).toEqual(
        expect.objectContaining({ type: 'mustRead', articles: [] })
      );
      expect(result.sections[2]).toEqual(
        expect.objectContaining({ type: 'missed', articles: [] })
      );
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
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1'],
          periodMonths: 12,
          totalMatched: 2,
          queryMs: 10,
        },
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
      // Promise.allによる並列実行のため、クエリ内容でセクションを識別して返す
      prismaMock.$queryRaw.mockImplementation((query: any) => {
        const sql = Array.isArray(query)
          ? query.join('')
          : (query?.strings?.join('') ?? String(query));
        if (sql.includes('array_position'))
          return Promise.resolve(personalizedRows);
        if (sql.includes('viewer_count') || sql.includes('COUNT(DISTINCT'))
          return Promise.resolve(mustReadRows);
        if (sql.includes('_ArticleToTag')) return Promise.resolve(missedRows);
        return Promise.resolve([]);
      });

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

      // filterArticlesの呼び出し確認（topK, maxConcurrencyが追加されたことを確認）
      expect(filterServiceMock.filterArticles).toHaveBeenCalledWith({
        categoryIds: ['cat-1', 'cat-2'],
        periodMonths: 12,
        limit: DIGEST_CONFIG.PERSONALIZED_LIMIT,
        topK: DIGEST_CONFIG.DIGEST_TOP_K,
        maxConcurrency: DIGEST_CONFIG.DIGEST_MAX_CONCURRENCY,
      });
    });

    it('重複排除: overfetchで取得した結果が優先順位通りにdedupeされる', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);

      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [{ articleId: 'article-1', score: 0.9 }],
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1'],
          periodMonths: 12,
          totalMatched: 1,
          queryMs: 10,
        },
        total: 1,
      } as any);

      // Promise.allによる並列実行のため、クエリ内容でセクションを識別して返す
      prismaMock.$queryRaw.mockImplementation((query: any) => {
        const sql = Array.isArray(query)
          ? query.join('')
          : (query?.strings?.join('') ?? String(query));
        if (sql.includes('array_position'))
          return Promise.resolve([
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
          ]);
        // mustRead → 空を返す
        if (sql.includes('viewer_count') || sql.includes('COUNT(DISTINCT'))
          return Promise.resolve([]);
        // missed → 空を返す
        if (sql.includes('_ArticleToTag')) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      const result = await service.getDigest('user-1', 'daily');

      // $queryRawが3回呼ばれることを確認（並列実行）
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(3);
      expect(result.sections[0].articles).toHaveLength(1);
      expect(result.sections[0].articles[0].articleId).toBe('article-1');
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
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1'],
          periodMonths: 12,
          totalMatched: 1,
          queryMs: 10,
        },
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

    it('全セクション正常空（all ok: true）の場合はNEGATIVE_CACHE_TTLでキャッシュする', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [],
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1'],
          periodMonths: 12,
          totalMatched: 0,
          queryMs: 10,
        },
        total: 0,
      } as any);
      prismaMock.$queryRaw.mockResolvedValue([]);

      await service.getDigest('user-1', 'daily');

      // 全セクション空かつ全ok → negative cache TTLでキャッシュする
      expect(mockCache.set).toHaveBeenCalledTimes(1);
      const [, , ttl] = mockCache.set.mock.calls[0];
      expect(ttl).toBe(DIGEST_CONFIG.NEGATIVE_CACHE_TTL);
    });

    it('キャッシュ読み込み失敗時もDBから取得して正常に動作する', async () => {
      mockCache.get.mockRejectedValue(new Error('Redis connection failed'));
      prismaMock.userCategoryPreference.count.mockResolvedValue(0);

      const result = await service.getDigest('user-1', 'daily');

      // キャッシュエラーでも正常レスポンスを返す
      expect(result.hasPreferences).toBe(false);
      expect(result.sections).toHaveLength(3);
      expect(result.sections.every((s) => s.articles.length === 0)).toBe(true);
    });

    it('キャッシュ書き込み失敗時もレスポンスを返す', async () => {
      mockCache.set.mockRejectedValue(new Error('Redis write failed'));
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [{ articleId: 'article-1', score: 0.9 }],
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1'],
          periodMonths: 12,
          totalMatched: 1,
          queryMs: 10,
        },
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

      const result = await service.getDigest('user-1', 'daily');

      // キャッシュ書き込みエラーでもレスポンスは返す
      expect(result.hasPreferences).toBe(true);
      expect(result.sections).toHaveLength(3);
      // cache.setが実際に呼ばれたことを確認（エラーが発生しても握りつぶされる）
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('filterArticlesがエラーを返す場合、personalizedセクションは空になる', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      filterServiceMock.filterArticles.mockRejectedValue(
        new Error('Embedding service unavailable')
      );
      // filterArticles失敗時、personalized用$queryRawは呼ばれない
      // mustRead → 実データを返す
      prismaMock.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'article-must-1',
            title: 'Must Read Article',
            url: 'https://example.com/must-1',
            summary: 'Must read summary',
            thumbnail: null,
            publishedAt: new Date(),
            qualityScore: 90,
            sourceId: 'source-2',
            viewer_count: BigInt(50),
          },
        ])
        // missed → 実データを返す
        .mockResolvedValueOnce([
          {
            id: 'article-missed-1',
            title: 'Missed Article',
            url: 'https://example.com/missed-1',
            summary: 'Missed summary',
            thumbnail: null,
            publishedAt: new Date(),
            qualityScore: 80,
            sourceId: 'source-3',
          },
        ]);

      const result = await service.getDigest('user-1', 'daily');

      expect(result.sections[0].type).toBe('personalized');
      expect(result.sections[0].articles).toHaveLength(0);
      // filterArticles失敗時はpersonalized用$queryRawは呼ばれない（mustRead+missedの2回のみ）
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
      // mustRead/missedはfilterArticles失敗に関わらず独立して取得される
      expect(result.sections).toHaveLength(3);
      expect(result.sections[1].articles).toHaveLength(1);
      expect(result.sections[1].articles[0].articleId).toBe('article-must-1');
      expect(result.sections[2].articles).toHaveLength(1);
      expect(result.sections[2].articles[0].articleId).toBe('article-missed-1');
    });

    // =========================================================================
    // 新規テスト: 並列実行
    // =========================================================================

    it('3セクションが並列実行されること（Promise.allによる同時起動）', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [{ articleId: 'article-1', score: 0.9 }],
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1'],
          periodMonths: 12,
          totalMatched: 1,
          queryMs: 10,
        },
        total: 1,
      } as any);

      const callOrder: string[] = [];

      // 各$queryRaw呼び出しにタイムスタンプを記録
      prismaMock.$queryRaw
        .mockImplementationOnce(async () => {
          callOrder.push('personalized');
          return [
            {
              id: 'article-1',
              title: 'A1',
              url: 'https://example.com/1',
              summary: null,
              thumbnail: null,
              publishedAt: new Date(),
              qualityScore: 85,
              sourceId: 'src-1',
            },
          ];
        })
        .mockImplementationOnce(async () => {
          callOrder.push('mustRead');
          return [];
        })
        .mockImplementationOnce(async () => {
          callOrder.push('missed');
          return [];
        });

      const result = await service.getDigest('user-1', 'daily');

      // 3回すべてのクエリが実行される
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(3);
      expect(callOrder).toHaveLength(3);
      expect(result.sections).toHaveLength(3);
    });

    // =========================================================================
    // 新規テスト: dedupe（優先順位: personalized > mustRead > missed）
    // =========================================================================

    it('dedupe: personalizedに含まれる記事はmustReadから除外される', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);

      // personalizedとmustRead両方に article-dup が含まれる
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [
          { articleId: 'article-dup', score: 0.9 },
          { articleId: 'article-only-p', score: 0.8 },
        ],
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1'],
          periodMonths: 12,
          totalMatched: 2,
          queryMs: 10,
        },
        total: 2,
      } as any);

      const dupArticle = {
        id: 'article-dup',
        title: 'Dup Article',
        url: 'https://example.com/dup',
        summary: null,
        thumbnail: null,
        publishedAt: new Date(),
        qualityScore: 88,
        sourceId: 'src-1',
      };
      const onlyPArticle = {
        id: 'article-only-p',
        title: 'Only Personalized',
        url: 'https://example.com/only-p',
        summary: null,
        thumbnail: null,
        publishedAt: new Date(),
        qualityScore: 82,
        sourceId: 'src-1',
      };
      const mustReadDupArticle = {
        ...dupArticle,
        viewer_count: BigInt(100),
      };
      const mustReadOnlyArticle = {
        id: 'article-only-mr',
        title: 'Only MustRead',
        url: 'https://example.com/only-mr',
        summary: null,
        thumbnail: null,
        publishedAt: new Date(),
        qualityScore: 90,
        sourceId: 'src-2',
        viewer_count: BigInt(50),
      };

      // Promise.allによる並列実行のため、クエリ内容でセクションを識別して返す
      prismaMock.$queryRaw.mockImplementation((query: any) => {
        const sql = Array.isArray(query)
          ? query.join('')
          : (query?.strings?.join('') ?? String(query));
        if (sql.includes('array_position'))
          return Promise.resolve([dupArticle, onlyPArticle]);
        if (sql.includes('viewer_count') || sql.includes('COUNT(DISTINCT'))
          return Promise.resolve([mustReadDupArticle, mustReadOnlyArticle]);
        if (sql.includes('_ArticleToTag')) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      const result = await service.getDigest('user-1', 'daily');

      const personalizedIds = result.sections[0].articles.map(
        (a) => a.articleId
      );
      const mustReadIds = result.sections[1].articles.map((a) => a.articleId);
      const missedIds = result.sections[2].articles.map((a) => a.articleId);

      // personalized には article-dup と article-only-p が含まれる
      expect(personalizedIds).toContain('article-dup');
      expect(personalizedIds).toContain('article-only-p');

      // mustRead には article-dup が含まれず、article-only-mr のみ
      expect(mustReadIds).not.toContain('article-dup');
      expect(mustReadIds).toContain('article-only-mr');

      // missed は空
      expect(missedIds).toHaveLength(0);
    });

    it('dedupe: personalizedとmustRead両方に含まれる記事はmissedからも除外される', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);

      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [{ articleId: 'article-shared', score: 0.9 }],
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1'],
          periodMonths: 12,
          totalMatched: 1,
          queryMs: 10,
        },
        total: 1,
      } as any);

      const sharedArticle = {
        id: 'article-shared',
        title: 'Shared Article',
        url: 'https://example.com/shared',
        summary: null,
        thumbnail: null,
        publishedAt: new Date(),
        qualityScore: 85,
        sourceId: 'src-1',
      };

      // Promise.allによる並列実行のため、クエリ内容でセクションを識別して返す
      prismaMock.$queryRaw.mockImplementation((query: any) => {
        const sql = Array.isArray(query)
          ? query.join('')
          : (query?.strings?.join('') ?? String(query));
        if (sql.includes('array_position'))
          return Promise.resolve([sharedArticle]);
        if (sql.includes('viewer_count') || sql.includes('COUNT(DISTINCT'))
          return Promise.resolve([]);
        if (sql.includes('_ArticleToTag'))
          return Promise.resolve([
            sharedArticle,
            {
              id: 'article-only-m',
              title: 'Only Missed',
              url: 'https://example.com/only-m',
              summary: null,
              thumbnail: null,
              publishedAt: new Date(),
              qualityScore: 78,
              sourceId: 'src-3',
            },
          ]);
        return Promise.resolve([]);
      });

      const result = await service.getDigest('user-1', 'daily');

      const personalizedIds = result.sections[0].articles.map(
        (a) => a.articleId
      );
      const missedIds = result.sections[2].articles.map((a) => a.articleId);

      expect(personalizedIds).toContain('article-shared');
      // missedには article-shared が含まれず、article-only-m のみ
      expect(missedIds).not.toContain('article-shared');
      expect(missedIds).toContain('article-only-m');
    });

    // =========================================================================
    // 新規テスト: negative cache
    // =========================================================================

    it('negative cache: 全セクション空かつ全ok時はNEGATIVE_CACHE_TTL(300)でキャッシュする', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [],
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1'],
          periodMonths: 12,
          totalMatched: 0,
          queryMs: 10,
        },
        total: 0,
      } as any);
      // 全セクション空（ok: true）
      prismaMock.$queryRaw.mockResolvedValue([]);

      await service.getDigest('user-1', 'daily');

      expect(mockCache.set).toHaveBeenCalledTimes(1);
      const [cacheKey, , ttl] = mockCache.set.mock.calls[0];
      expect(cacheKey).toBe('digest:user-1:daily');
      expect(ttl).toBe(DIGEST_CONFIG.NEGATIVE_CACHE_TTL);
      expect(DIGEST_CONFIG.NEGATIVE_CACHE_TTL).toBe(300);
    });

    it('negative cache: 障害含む空（ok: false あり）はキャッシュしない', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      // filterArticles がエラー → personalizedResult.ok = false
      filterServiceMock.filterArticles.mockRejectedValue(
        new Error('Embedding service unavailable')
      );
      // mustRead, missed は空（正常）
      prismaMock.$queryRaw.mockResolvedValue([]);

      await service.getDigest('user-1', 'daily');

      // ok: false のセクションがあるためキャッシュしない
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    // =========================================================================
    // 新規テスト: DigestResponseの selectedCategories と categories フィールド
    // =========================================================================

    it('DigestResponseにselectedCategoriesとcategoriesフィールドが含まれる', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(2);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
        { categoryId: 'cat-2' },
      ]);
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [],
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1', 'cat-2'],
          periodMonths: 12,
          totalMatched: 0,
          queryMs: 10,
        },
        total: 0,
      } as any);
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await service.getDigest('user-1', 'daily');

      // selectedCategories にユーザーのカテゴリIDが含まれる
      expect(result.selectedCategories).toEqual(['cat-1', 'cat-2']);
      // categories に全アクティブカテゴリが含まれる
      expect(result.categories).toEqual(mockAllCategories);
    });

    it('プリファレンスなし時のDigestResponseにも selectedCategories と categories が含まれる', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(0);

      const result = await service.getDigest('user-1', 'daily');

      expect(result.selectedCategories).toEqual([]);
      expect(result.categories).toEqual(mockAllCategories);
    });
  });

  describe('scope filtering', () => {
    it('getDigest should query preferences with scope: digest', async () => {
      prismaMock.userCategoryPreference.count.mockResolvedValue(1);
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);
      filterServiceMock.filterArticles.mockResolvedValue({
        articles: [],
        meta: {
          filterMode: 'category',
          appliedCategories: ['cat-1'],
          periodMonths: 12,
          totalMatched: 0,
          queryMs: 10,
        },
        total: 0,
      } as any);
      prismaMock.$queryRaw.mockResolvedValue([]);

      await service.getDigest('user-1', 'daily');

      // count should filter by scope: 'digest'
      expect(prismaMock.userCategoryPreference.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', scope: 'digest' },
      });

      // findMany should also filter by scope: 'digest'
      expect(prismaMock.userCategoryPreference.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', scope: 'digest' },
        select: { categoryId: true },
      });
    });

    it('should return empty sections when user has no digest scope preferences', async () => {
      // User has home preferences but no digest preferences
      prismaMock.userCategoryPreference.count.mockResolvedValue(0);

      const result = await service.getDigest('user-1', 'daily');

      expect(result.hasPreferences).toBe(false);
      expect(result.sections).toHaveLength(3);
      expect(result.sections.every((s) => s.articles.length === 0)).toBe(true);

      // findMany should not be called when count is 0 (early return)
      expect(prismaMock.userCategoryPreference.findMany).not.toHaveBeenCalled();
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
