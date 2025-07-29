# 人気記事ランキング機能 - 詳細設計書

作成日: 2025-01-29

## 1. 機能概要

### 目的
読者に人気のある記事を可視化し、見逃している重要な記事を発見できるようにする。

### 主な機能
- 期間別ランキング（日間、週間、月間、全期間）
- カテゴリー別ランキング（タグ、ソース別）
- ランキング指標の複数対応
  - ブックマーク数
  - 投票数
  - 品質スコア
  - 総合スコア（複合指標）
- トレンドインジケーター
- ソーシャル共有機能

## 2. 技術設計

### 2.1 ランキング算出ロジック

#### 総合スコア計算
```typescript
const calculatePopularityScore = (article: Article) => {
  const bookmarkWeight = 0.3;
  const voteWeight = 0.2;
  const qualityWeight = 0.3;
  const recencyWeight = 0.2;
  
  // 新しさスコア（指数関数的減衰）
  const ageInDays = (Date.now() - article.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.exp(-ageInDays / 7); // 1週間で約半減
  
  return (
    article.bookmarks * bookmarkWeight +
    article.userVotes * voteWeight +
    article.qualityScore * qualityWeight +
    recencyScore * 100 * recencyWeight
  );
};
```

### 2.2 APIエンドポイント

```typescript
// GET /api/articles/popular
interface PopularArticlesRequest {
  period: 'today' | 'week' | 'month' | 'all';
  metric: 'bookmarks' | 'votes' | 'quality' | 'combined';
  category?: string; // タグまたはソース
  limit?: number;
}

interface PopularArticlesResponse {
  articles: Array<{
    ...Article;
    rank: number;
    previousRank?: number;
    score: number;
    trend: 'up' | 'down' | 'stable' | 'new';
  }>;
  period: string;
  metric: string;
}
```

### 2.3 UI/UX設計

#### レイアウトバリエーション
1. **リスト形式**: 順位、タイトル、スコア、トレンド
2. **カード形式**: リッチな表示（サムネイル、要約付き）
3. **コンパクト形式**: サイドバー用の省スペース表示

#### インタラクション
- ランキング期間の切り替え
- 指標の切り替え
- カテゴリーフィルター
- 記事プレビュー（既存機能活用）

## 3. データ更新戦略

### キャッシング
- ランキングは計算コストが高いため積極的にキャッシュ
- 期間別にキャッシュ時間を調整
  - today: 10分
  - week: 1時間
  - month: 6時間
  - all: 24時間

### 差分更新
- 前回のランキングを保持
- 順位変動を計算して表示

## 4. 実装チェックリスト

- [ ] APIエンドポイント実装
- [ ] ランキング計算ロジック
- [ ] キャッシング機構
- [ ] ランキングページ作成
- [ ] ランキングコンポーネント（複数形式）
- [ ] トレンドインジケーター
- [ ] フィルター機能
- [ ] レスポンシブ対応
- [ ] パフォーマンス最適化
- [ ] ドキュメント更新