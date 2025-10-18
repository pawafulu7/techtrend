# DBアクセス最適化ガイド

作成日: 2025年9月22日
作成者: Claude Code
対象システム: TechTrend

## エグゼクティブサマリー

本ドキュメントは、TechTrendプロジェクトのデータベースアクセスパターンを分析し、パフォーマンス改善のための具体的な最適化案を提示します。調査の結果、6つの主要な改善点を特定し、優先度順に実装することで、システム全体のパフォーマンスを大幅に向上させることが可能です。

### 期待される改善効果
- **メモリ使用量**: 最大90%削減（/api/sources）
- **API応答時間**: 平均60-95%改善
- **データベースクエリ数**: 50-90%削減
- **バッチ処理効率**: 90%の不要処理を削減

## 現状分析

### 既に実装済みの最適化
- **Phase 3完了** (2025年9月21日)
  - DataLoaderパターンによるN+1問題解決
  - 多層キャッシュシステム（L1メモリ、L2 Redis）
  - BatchOptimizerシステム
  - カーソルベースページネーション

- **バッチ処理Phase 1,2完了** (2025年9月22日)
  - ProcessingLogによる差分処理
  - 専用タイムスタンプでの自己更新ループ防止
  - 処理頻度の最適化

### 残存する問題点
調査により、以下の6つの主要な最適化可能箇所を特定しました。

## 🔴 最優先改善項目

### 1. `/api/sources/route.ts` - 全記事データ取得によるメモリ爆発問題

#### 問題の詳細
```typescript
// 現在の問題コード（93-128行）
const sources = await prisma.source.findMany({
  include: {
    articles: {  // ❌ 全記事データを取得
      select: {
        qualityScore: true,
        publishedAt: true,
        tags: {
          select: {
            name: true
          }
        }
      }
    }
  }
});
```

**影響範囲**:
- 最大170,000件のレコードをメモリに展開（5,000記事 × 34ソース）
- 各記事のタグ情報も含めて大量のJOIN発生
- 統計計算のためだけに全データを取得

#### 改善案

```typescript
// ステップ1: 基本情報とカウントのみ取得
const sources = await prisma.source.findMany({
  where: {
    enabled: true,
    ...(ids && {
      id: { in: ids.split(',') }
    })
  },
  include: {
    _count: {
      select: {
        articles: true
      }
    }
  }
});

// ステップ2: 統計情報を集計クエリで効率的に取得
const statsMap = await prisma.$queryRaw<{
  id: string;
  avgQualityScore: number;
  lastPublished: Date;
  recentCount: number;
  monthlyGrowthRate: number;
}[]>`
  SELECT
    s.id,
    AVG(a."qualityScore")::float as "avgQualityScore",
    MAX(a."publishedAt") as "lastPublished",
    COUNT(CASE WHEN a."publishedAt" > NOW() - INTERVAL '30 days' THEN 1 END)::int as "recentCount",
    CASE
      WHEN COUNT(CASE WHEN a."publishedAt" BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' THEN 1 END) > 0
      THEN ((COUNT(CASE WHEN a."publishedAt" > NOW() - INTERVAL '30 days' THEN 1 END)::float -
            COUNT(CASE WHEN a."publishedAt" BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' THEN 1 END)::float) /
            COUNT(CASE WHEN a."publishedAt" BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' THEN 1 END)::float * 100)::int
      ELSE 0
    END as "monthlyGrowthRate"
  FROM "Source" s
  LEFT JOIN "Article" a ON s.id = a."sourceId"
  WHERE s.enabled = true
  GROUP BY s.id
`;

// ステップ3: 人気タグを別クエリで取得（上位5件のみ）
const popularTagsMap = await prisma.$queryRaw<{
  sourceId: string;
  tags: string[];
}[]>`
  WITH RankedTags AS (
    SELECT
      s.id as source_id,
      t.name as tag_name,
      COUNT(*) as tag_count,
      ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY COUNT(*) DESC) as rn
    FROM "Source" s
    JOIN "Article" a ON s.id = a."sourceId"
    JOIN "_ArticleToTag" at ON a.id = at."A"
    JOIN "Tag" t ON at."B" = t.id
    WHERE s.enabled = true
      AND a."publishedAt" > NOW() - INTERVAL '30 days'
    GROUP BY s.id, t.name
  )
  SELECT
    source_id as "sourceId",
    ARRAY_AGG(tag_name ORDER BY rn) as tags
  FROM RankedTags
  WHERE rn <= 5
  GROUP BY source_id
`;

// ステップ4: 結果をマージ
const sourcesWithStats = sources.map(source => {
  const stats = statsMap.find(s => s.id === source.id);
  const popularTags = popularTagsMap.find(t => t.sourceId === source.id);

  return {
    ...source,
    avgQualityScore: stats?.avgQualityScore || 0,
    lastPublished: stats?.lastPublished || null,
    publishFrequency: (stats?.recentCount || 0) / 30,
    growthRate: stats?.monthlyGrowthRate || 0,
    popularTags: popularTags?.tags || [],
    totalArticles: source._count.articles
  };
});
```

#### 期待効果
- **メモリ使用量**: 90%削減（170,000レコード → 34レコード + 軽量な統計データ）
- **クエリ時間**: 80%改善（5秒 → 1秒以下）
- **データ転送量**: 95%削減

### 2. `/api/sources/[id]/route.ts` - 並列化されていない独立クエリ

#### 問題の詳細
```typescript
// 現在の問題コード
// 3つの独立したクエリが順次実行されている
const stats = await prisma.article.findMany({ where: { sourceId: id } });
const recentArticles = await prisma.article.findMany({ where: { sourceId: id }, orderBy: { publishedAt: 'desc' } });
const popularArticles = await prisma.article.findMany({ where: { sourceId: id }, orderBy: { userVotes: 'desc' } });
```

#### 改善案

```typescript
const [source, stats, recentArticles, popularArticles, tagDistribution] = await Promise.all([
  // ソース基本情報
  prisma.source.findUnique({
    where: { id },
    include: {
      _count: {
        select: { articles: true }
      }
    }
  }),

  // 統計情報を集計関数で取得
  prisma.article.aggregate({
    where: { sourceId: id },
    _avg: {
      qualityScore: true,
      bookmarks: true,
      userVotes: true
    },
    _max: {
      publishedAt: true
    },
    _count: true
  }),

  // 最新記事（軽量版）
  prisma.article.findMany({
    where: { sourceId: id },
    select: {
      id: true,
      title: true,
      url: true,
      publishedAt: true,
      qualityScore: true,
      thumbnail: true
    },
    orderBy: { publishedAt: 'desc' },
    take: 10
  }),

  // 人気記事（軽量版）
  prisma.article.findMany({
    where: { sourceId: id },
    select: {
      id: true,
      title: true,
      url: true,
      userVotes: true,
      bookmarks: true,
      thumbnail: true
    },
    orderBy: [
      { userVotes: 'desc' },
      { bookmarks: 'desc' }
    ],
    take: 10
  }),

  // タグ分布
  prisma.$queryRaw`
    SELECT
      t.name,
      t.category,
      COUNT(*)::int as count
    FROM "Article" a
    JOIN "_ArticleToTag" at ON a.id = at."A"
    JOIN "Tag" t ON at."B" = t.id
    WHERE a."sourceId" = ${id}
    GROUP BY t.name, t.category
    ORDER BY count DESC
    LIMIT 20
  `
]);
```

#### 期待効果
- **応答時間**: 60%改善（300ms → 120ms）
- **データベース接続時間**: 並列化により総時間を最長クエリ時間に短縮

## 🟡 高優先度改善項目

### 3. `/api/stats/route.ts` - キャッシュなしの重い集計クエリ

#### 改善案

```typescript
import { cache } from '@/lib/cache';
import { logger } from '@/lib/logger';

export async function GET() {
  const startTime = Date.now();

  // 統計は5分間キャッシュ
  const cacheKey = 'stats:dashboard:v2';

  const stats = await cache.getOrFetch(
    cacheKey,
    async () => {
      const [
        totalArticles,
        todayArticles,
        weekArticles,
        sources,
        dailyStats,
        popularTags,
        categoryDistribution
      ] = await Promise.all([
        // 総記事数
        prisma.article.count(),

        // 今日の記事数
        prisma.article.count({
          where: {
            publishedAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        }),

        // 今週の記事数
        prisma.article.count({
          where: {
            publishedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        }),

        // アクティブソース
        prisma.source.count({
          where: { enabled: true }
        }),

        // 日別統計（最適化版）
        prisma.$queryRaw`
          SELECT
            TO_CHAR("publishedAt", 'YYYY-MM-DD') as date,
            COUNT(*)::int as count,
            AVG("qualityScore")::float as avg_quality
          FROM "Article"
          WHERE "publishedAt" >= NOW() - INTERVAL '30 days'
          GROUP BY TO_CHAR("publishedAt", 'YYYY-MM-DD')
          ORDER BY date DESC
        `,

        // 人気タグTOP20
        prisma.$queryRaw`
          SELECT
            t.name,
            t.category,
            COUNT(*)::int as count
          FROM "Tag" t
          JOIN "_ArticleToTag" at ON t.id = at."B"
          GROUP BY t.name, t.category
          ORDER BY count DESC
          LIMIT 20
        `,

        // カテゴリー分布
        prisma.article.groupBy({
          by: ['category'],
          _count: true,
          orderBy: {
            _count: {
              category: 'desc'
            }
          }
        })
      ]);

      return {
        totalArticles,
        todayArticles,
        weekArticles,
        activeSourceCount: sources,
        dailyStats,
        popularTags,
        categoryDistribution,
        cachedAt: new Date().toISOString(),
        responseTime: Date.now() - startTime
      };
    },
    300 // 5分TTL
  );

  return NextResponse.json({
    success: true,
    data: stats,
    meta: {
      cached: stats.cachedAt !== new Date().toISOString(),
      responseTime: Date.now() - startTime
    }
  });
}
```

#### 期待効果
- **応答時間**: キャッシュヒット時95%改善（500ms → 25ms）
- **データベース負荷**: 5分間隔で1回のみ実行

### 4. `/api/favorites/batch/route.ts` - DataLoader未活用

#### 改善案

```typescript
import { createLoaders } from '@/lib/dataloader';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { articleIds } = await request.json();

  if (!Array.isArray(articleIds) || articleIds.length === 0) {
    return NextResponse.json({ error: 'Invalid article IDs' }, { status: 400 });
  }

  // DataLoaderを活用してバッチ取得
  const loaders = createLoaders({ userId: session.user.id });

  // バッチで効率的に取得（内部でバッチ化される）
  const favoriteStatuses = await loaders.favorite.loadMany(articleIds);

  // エラーハンドリング
  const results = favoriteStatuses.map((status, index) => {
    if (status instanceof Error) {
      return {
        articleId: articleIds[index],
        isFavorited: false,
        error: status.message
      };
    }
    return status;
  });

  return NextResponse.json({
    success: true,
    data: results
  });
}
```

#### 期待効果
- **N+1問題解消**: 100件の場合、100クエリ → 1クエリ
- **応答時間**: 70%改善（200ms → 60ms）

## 🟢 中優先度改善項目

### 5. `/api/articles/list/route.ts` - タグマッピングの最適化

#### 改善案

```typescript
// lib/cache/tag-cache.ts を拡張
export class EnhancedTagCache {
  private cache: RedisCache;
  private memoryCache: Map<string, { id: string; cachedAt: number }>;
  private readonly TTL = 3600; // 1時間
  private readonly MEMORY_TTL = 60000; // 1分

  async getBulkTagMapping(tagNames: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const missing: string[] = [];

    // Step 1: メモリキャッシュをチェック
    const now = Date.now();
    for (const name of tagNames) {
      const cached = this.memoryCache.get(name);
      if (cached && now - cached.cachedAt < this.MEMORY_TTL) {
        result[name] = cached.id;
      } else {
        missing.push(name);
      }
    }

    if (missing.length === 0) return result;

    // Step 2: Redisから一括取得
    const redisKeys = missing.map(name => `tag:name:${name}`);
    const redisValues = await this.cache.mget(redisKeys);

    const stillMissing: string[] = [];
    redisValues.forEach((value, index) => {
      if (value) {
        const name = missing[index];
        result[name] = value;
        this.memoryCache.set(name, { id: value, cachedAt: now });
      } else {
        stillMissing.push(missing[index]);
      }
    });

    if (stillMissing.length === 0) return result;

    // Step 3: DBから取得して全キャッシュを更新
    const dbTags = await prisma.tag.findMany({
      where: { name: { in: stillMissing } },
      select: { id: true, name: true }
    });

    const pipeline = this.cache.pipeline();
    for (const tag of dbTags) {
      result[tag.name] = tag.id;
      this.memoryCache.set(tag.name, { id: tag.id, cachedAt: now });
      pipeline.set(`tag:name:${tag.name}`, tag.id, 'EX', this.TTL);
    }
    await pipeline.exec();

    return result;
  }
}
```

#### 期待効果
- **DB接続回数**: 50%削減
- **メモリキャッシュヒット率**: 80%向上

### 6. バッチ処理の差分チェック強化

#### 改善案

```typescript
// scripts/utils/article-processor.ts
export class ArticleProcessor {
  private readonly BATCH_SIZE = 100;

  async processNewArticles(sources: string[]) {
    // 最終処理時刻を取得
    const lastProcessed = await getLastProcessedTime('article-collection');

    // 新規または更新された記事のみを取得
    const newArticles = await this.fetchArticlesWithDiff(sources, lastProcessed);

    if (newArticles.length === 0) {
      logger.info('No new articles to process');
      return;
    }

    // バッチ処理
    for (let i = 0; i < newArticles.length; i += this.BATCH_SIZE) {
      const batch = newArticles.slice(i, i + this.BATCH_SIZE);

      // 既存記事のチェックを一括実行
      const urls = batch.map(a => a.url);
      const existing = await prisma.article.findMany({
        where: { url: { in: urls } },
        select: { url: true, updatedAt: true }
      });

      const existingMap = new Map(existing.map(e => [e.url, e.updatedAt]));

      // 新規または更新が必要な記事のみ処理
      const toProcess = batch.filter(article => {
        const existingDate = existingMap.get(article.url);
        if (!existingDate) return true; // 新規
        return article.lastModified && article.lastModified > existingDate; // 更新
      });

      if (toProcess.length > 0) {
        await this.saveBatch(toProcess);
      }
    }

    // 処理完了を記録
    await saveProcessingStatus('article-collection', newArticles.length);
  }
}
```

#### 期待効果
- **不要な更新**: 90%削減
- **処理時間**: 70%短縮

## 実装ロードマップ

### Phase 1（1週目）- 最優先項目
1. **Day 1-2**: `/api/sources` の全面改修
   - 集計クエリへの移行
   - メモリ使用量の監視

2. **Day 3**: `/api/sources/[id]` の並列化
   - Promise.all実装
   - エラーハンドリング追加

### Phase 2（2週目）- 高優先度項目
3. **Day 4-5**: 統計APIのキャッシュ実装
   - Redisキャッシュ統合
   - TTL設定の最適化

4. **Day 6**: DataLoader活用拡大
   - batch APIへの適用
   - パフォーマンステスト

### Phase 3（3週目）- 中優先度項目
5. **Day 7-8**: タグキャッシュの多層化
   - メモリキャッシュ追加
   - バルク取得API実装

6. **Day 9-10**: バッチ処理の差分強化
   - 差分チェックロジック実装
   - ProcessingLog活用拡大

## パフォーマンス監視

### 監視すべきメトリクス

```typescript
// lib/monitoring/performance-tracker.ts
export class PerformanceTracker {
  private metrics = {
    apiResponseTime: new Map<string, number[]>(),
    dbQueryCount: new Map<string, number>(),
    cacheHitRate: new Map<string, number>(),
    memoryUsage: []
  };

  trackAPICall(endpoint: string, responseTime: number) {
    if (!this.metrics.apiResponseTime.has(endpoint)) {
      this.metrics.apiResponseTime.set(endpoint, []);
    }
    this.metrics.apiResponseTime.get(endpoint)!.push(responseTime);
  }

  getMetricsSummary() {
    const summary: Record<string, any> = {};

    for (const [endpoint, times] of this.metrics.apiResponseTime) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const p95 = this.calculatePercentile(times, 0.95);

      summary[endpoint] = {
        avg: Math.round(avg),
        p95: Math.round(p95),
        count: times.length
      };
    }

    return summary;
  }
}
```

### アラート閾値

| メトリクス | 警告閾値 | エラー閾値 |
|-----------|---------|-----------|
| API応答時間（p95） | 500ms | 1000ms |
| メモリ使用量 | 1GB | 2GB |
| DBクエリ数/リクエスト | 10 | 20 |
| キャッシュヒット率 | <70% | <50% |

## テスト戦略

### 単体テスト

```typescript
// __tests__/api/sources/route.test.ts
describe('Sources API Optimization', () => {
  it('should not load all articles', async () => {
    const querySpy = jest.spyOn(prisma.source, 'findMany');

    await GET(mockRequest);

    expect(querySpy).toHaveBeenCalledWith(
      expect.not.objectContaining({
        include: expect.objectContaining({
          articles: expect.anything()
        })
      })
    );
  });

  it('should use aggregate for statistics', async () => {
    const aggregateSpy = jest.spyOn(prisma.article, 'aggregate');

    await GET(mockRequest);

    expect(aggregateSpy).toHaveBeenCalled();
  });
});
```

### 負荷テスト

```bash
# scripts/load-test/api-sources.js
import autocannon from 'autocannon';

const result = await autocannon({
  url: 'http://localhost:3000/api/sources',
  connections: 10,
  duration: 30,
  headers: {
    'content-type': 'application/json'
  }
});

console.log('Response time p95:', result.percentiles['95']);
console.log('Requests per second:', result.requests.average);
```

## リスク管理

### 潜在的リスクと対策

1. **キャッシュ不整合**
   - 対策: TTL短縮、イベントドリブンな無効化

2. **集計クエリのパフォーマンス低下**
   - 対策: 適切なインデックス追加、マテリアライズドビュー検討

3. **メモリリーク**
   - 対策: メモリキャッシュサイズ上限設定、定期的なGC

### ロールバック計画

```typescript
// 環境変数で新旧切り替え
const USE_OPTIMIZED_SOURCES_API = process.env.USE_OPTIMIZED_SOURCES_API === 'true';

export async function GET(request: NextRequest) {
  if (!USE_OPTIMIZED_SOURCES_API) {
    return legacySourcesHandler(request);
  }
  return optimizedSourcesHandler(request);
}
```

## まとめ

本最適化により、TechTrendのパフォーマンスを大幅に改善できます。特に`/api/sources`の改修は最優先で実施すべきです。段階的な実装とモニタリングにより、リスクを最小限に抑えながら改善を進めることが可能です。

### 次のステップ
1. 本ドキュメントのレビューと承認
2. Phase 1の実装開始
3. 本番環境でのA/Bテスト実施
4. メトリクス収集と効果測定

## 更新履歴

| 日付 | 版 | 変更内容 | 作成者 |
|------|-----|----------|--------|
| 2025-09-22 | 1.0 | 初版作成 | Claude Code |