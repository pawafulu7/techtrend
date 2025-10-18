# TechTrend DBアクセス・画面表示最適化ガイド

**作成日**: 2025年9月22日 18:50
**作成者**: Claude Code
**対象バージョン**: TechTrend v8.x (SUMMARY_VERSION: 8)

## 📋 目次

1. [現状分析](#現状分析)
2. [最適化提案](#最適化提案)
3. [実装ガイドライン](#実装ガイドライン)
4. [パフォーマンス測定](#パフォーマンス測定)
5. [実装ロードマップ](#実装ロードマップ)

## 現状分析

### 既に実装済みの最適化

#### DBアクセス最適化
- **DataLoaderパターン** (Phase 3完了)
  - N+1問題の解決
  - 多層キャッシュ（L1/L2/L3）
- **sources API最適化** (Phase 2完了)
  - DB集計によるメモリ使用量90%削減
- **バッチ処理差分最適化** (Phase 3完了)
  - ProcessingLog活用で処理時間95%削減
- **API軽量化**
  - lightweight mode実装済み
  - includeRelations制御

#### 画面表示最適化
- **Suspense実装済み**
  - ArticleCount
  - Articles list
- **並列データ取得**
  - Sources/Tags (Promise.all)
- **無限スクロール**
  - HomeClientInfinite実装済み

### 未最適化の課題

1. **Recommendations API**
   - ArticleViewテーブルへの複数クエリ
   - 過剰なinclude使用

2. **Tags関連API**
   - cloud/search等での最適化余地

3. **フロントエンド**
   - 追加の非同期化可能箇所

## 最適化提案

### 1. Recommendations API最適化

#### 問題点
```typescript
// 現在の実装 - 2回の別々のクエリ
const recentlyViewedIds = await prisma.articleView.findMany({
  where: {
    userId,
    viewedAt: { gte: sevenDaysAgo }
  },
  select: { articleId: true },
});

// さらに後で全履歴を再取得
const allViewedIds = await prisma.articleView.findMany({
  where: { userId },
  select: { articleId: true },
});
```

#### 改善案
```typescript
// lib/recommendation/recommendation-service.ts

async getRecommendations(
  userId: string,
  limit: number = 10
): Promise<RecommendedArticle[]> {

  // 1. 一回のクエリで全データ取得
  const viewedArticles = await prisma.articleView.findMany({
    where: { userId },
    select: {
      articleId: true,
      viewedAt: true
    },
  });

  // メモリ上で分類
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentlyViewedIds = viewedArticles
    .filter(v => v.viewedAt >= sevenDaysAgo)
    .map(v => v.articleId);
  const allViewedIds = new Set(viewedArticles.map(v => v.articleId));

  // 2. 必要最小限のフィールドのみ取得
  const candidates = await prisma.article.findMany({
    where: {
      id: { notIn: recentlyViewedIds },
      publishedAt: { gte: thirtyDaysAgo },
      qualityScore: { gte: this.config.minQualityScore },
    },
    select: {
      id: true,
      title: true,
      url: true,
      summary: true,
      thumbnail: true,
      publishedAt: true,
      qualityScore: true,
      bookmarks: true,
      // 必要な関連データのみ
      tags: {
        select: { name: true }
      },
      source: {
        select: { name: true, id: true }
      }
    },
    orderBy: { publishedAt: 'desc' },
    take: 100,
  });

  // 以下、スコアリング処理は同じ
}
```

#### 期待効果
- **クエリ数**: 3-4回 → 2回（50%削減）
- **データ転送量**: 30%削減
- **処理時間**: 約200ms短縮

### 2. DataLoader統合の拡張

#### 実装箇所
```typescript
// lib/dataloader/article-view-loader.ts (新規作成)

import DataLoader from 'dataloader';
import { prisma } from '@/lib/di/prisma';

export class ArticleViewLoader {
  private viewedLoader: DataLoader<
    { userId: string; articleId: string },
    boolean
  >;

  constructor() {
    this.viewedLoader = new DataLoader(
      async (keys) => {
        const conditions = keys.map(k => ({
          userId: k.userId,
          articleId: k.articleId,
        }));

        const views = await prisma.articleView.findMany({
          where: { OR: conditions },
          select: { userId: true, articleId: true },
        });

        const viewSet = new Set(
          views.map(v => `${v.userId}:${v.articleId}`)
        );

        return keys.map(key =>
          viewSet.has(`${key.userId}:${key.articleId}`)
        );
      },
      { cache: true }
    );
  }

  async isViewed(userId: string, articleId: string): Promise<boolean> {
    return this.viewedLoader.load({ userId, articleId });
  }

  async areViewed(
    userId: string,
    articleIds: string[]
  ): Promise<Map<string, boolean>> {
    const results = await Promise.all(
      articleIds.map(id => this.isViewed(userId, id))
    );

    return new Map(
      articleIds.map((id, i) => [id, results[i]])
    );
  }
}
```

### 3. Tags API最適化

#### 現状の問題
```typescript
// app/api/tags/cloud/route.ts
const tags = await prisma.tag.findMany({
  include: {
    articles: true  // 過剰なデータ取得
  }
});
```

#### 改善案
```typescript
// タグの使用回数のみ必要な場合
const tags = await prisma.tag.findMany({
  select: {
    id: true,
    name: true,
    _count: {
      select: { articles: true }
    }
  },
  where: {
    articles: {
      some: {}  // 記事が1つ以上ある
    }
  },
  orderBy: {
    articles: {
      _count: 'desc'
    }
  },
  take: 50  // 上位50件
});

// レスポンス形式
const tagCloud = tags.map(tag => ({
  id: tag.id,
  name: tag.name,
  count: tag._count.articles,
  weight: calculateWeight(tag._count.articles)
}));
```

### 4. フロントエンド非同期化の追加

#### Recommendationsセクション分離
```tsx
// app/components/recommendations/RecommendationsSection.tsx
import { Suspense, lazy } from 'react';

const RecommendationsList = lazy(() =>
  import('./RecommendationsList')
);

export function RecommendationsSection() {
  return (
    <section className="recommendations-section">
      <h2>おすすめ記事</h2>
      <Suspense
        fallback={
          <div className="grid gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 animate-pulse rounded" />
            ))}
          </div>
        }
      >
        <RecommendationsList />
      </Suspense>
    </section>
  );
}
```

#### ストリーミングSSR活用
```tsx
// app/page.tsx
export default async function Home() {
  // 重要度の高いデータは即座に取得
  const criticalData = await Promise.all([
    getArticles({ limit: 10 }),
    getSources(),
  ]);

  // 重要度の低いデータは遅延
  const deferredData = Promise.all([
    getPopularTags(),
    getRecommendations(),
  ]);

  return (
    <>
      {/* 即座に表示 */}
      <ArticleList articles={criticalData[0]} />

      {/* 遅延表示 */}
      <Suspense fallback={<TagCloudSkeleton />}>
        <TagCloud dataPromise={deferredData} />
      </Suspense>
    </>
  );
}
```

## 実装ガイドライン

### 1. 段階的実装

#### Phase 1: Quick Wins（1-2日）
- Recommendations APIのクエリ削減
- 不要なinclude削除

#### Phase 2: DataLoader統合（3-5日）
- ArticleViewLoader実装
- 既存APIへの統合
- テスト作成

#### Phase 3: フロントエンド改善（2-3日）
- Suspense境界の追加
- lazy loadingの実装
- ストリーミングSSR

### 2. 実装時の注意点

#### TypeScript型定義
```typescript
// types/optimization.ts
export interface OptimizedArticle {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  thumbnail: string | null;
  publishedAt: Date;
  // 最小限の関連データ
  source: {
    id: string;
    name: string;
  };
  tags: {
    name: string;
  }[];
}

export interface DataLoaderContext {
  favoriteLoader: FavoriteLoader;
  articleViewLoader: ArticleViewLoader;
  // 将来の拡張用
}
```

#### エラーハンドリング
```typescript
try {
  const data = await optimizedQuery();
  return data;
} catch (error) {
  // フォールバック戦略
  logger.warn('Optimization failed, using fallback', error);
  return fallbackQuery();
}
```

## パフォーマンス測定

### 1. 測定指標

#### DBクエリ
```typescript
// lib/monitoring/query-monitor.ts
export class QueryMonitor {
  private queries: Map<string, number> = new Map();

  async measureQuery<T>(
    name: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();

    try {
      const result = await queryFn();
      const duration = performance.now() - start;

      this.queries.set(name, duration);

      if (duration > 1000) {
        logger.warn(`Slow query: ${name} took ${duration}ms`);
      }

      return result;
    } catch (error) {
      logger.error(`Query failed: ${name}`, error);
      throw error;
    }
  }

  getMetrics() {
    return {
      totalQueries: this.queries.size,
      totalTime: Array.from(this.queries.values()).reduce((a, b) => a + b, 0),
      slowQueries: Array.from(this.queries.entries())
        .filter(([_, time]) => time > 1000)
        .map(([name, time]) => ({ name, time })),
    };
  }
}
```

### 2. 測定コマンド

```bash
# DBクエリ分析
npm run analyze:db-queries

# API応答時間測定
npm run perf:api-response

# フロントエンドメトリクス
npm run lighthouse:performance
```

### 3. 目標メトリクス

| 指標 | 現在値 | 目標値 | 測定方法 |
|------|--------|--------|----------|
| API応答時間(P95) | 500ms | 300ms | DataDog/NewRelic |
| DBクエリ数/リクエスト | 10-15 | 5-8 | Query Monitor |
| Time to First Byte | 800ms | 500ms | Lighthouse |
| Largest Contentful Paint | 2.5s | 1.8s | Lighthouse |
| メモリ使用量 | 250MB | 200MB | process.memoryUsage() |

## 実装ロードマップ

### Week 1 (優先度: 高)
- [ ] Recommendations APIクエリ最適化
- [ ] 不要なinclude削除
- [ ] パフォーマンス測定基盤構築

### Week 2 (優先度: 中)
- [ ] DataLoader統合（ArticleView）
- [ ] DataLoader統合（Favorites）
- [ ] キャッシュ戦略見直し

### Week 3 (優先度: 低)
- [ ] フロントエンドSuspense追加
- [ ] Lazy loading実装
- [ ] ストリーミングSSR検証

### 継続的改善
- [ ] 月次パフォーマンスレビュー
- [ ] 新機能実装時の影響評価
- [ ] ユーザーフィードバック収集

## 実装チェックリスト

### 各最適化実装前
- [ ] 現状のメトリクス記録
- [ ] 影響範囲の特定
- [ ] ロールバック計画策定

### 実装中
- [ ] TypeScript型定義更新
- [ ] ユニットテスト作成
- [ ] エラーハンドリング実装

### 実装後
- [ ] パフォーマンス測定
- [ ] 本番環境モニタリング
- [ ] ドキュメント更新

## 参考資料

### 関連ドキュメント
- `docs/CLAUDE-HISTORY.md` - 過去の最適化履歴
- `CODE-MAINTENANCE-GUIDE.md` - コード保守ガイド
- `docs/TESTING-GUIDELINES.md` - テストガイドライン

### 技術リファレンス
- [Prisma Query Optimization](https://www.prisma.io/docs/guides/performance-and-optimization/query-optimization-performance)
- [Next.js Streaming SSR](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming)
- [DataLoader Pattern](https://github.com/graphql/dataloader)

## 更新履歴

| 日時 | 更新内容 | 更新者 |
|------|----------|--------|
| 2025-09-22 18:50 | 初版作成 | Claude Code |

---

**注意事項**:
- このドキュメントは定期的に更新してください
- 実装前に必ず最新の状況を確認してください
- 大規模な変更はチーム内でレビューを実施してください