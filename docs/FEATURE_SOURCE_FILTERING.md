# ソース別フィルタリング機能 - 詳細設計書

作成日: 2025-01-29

## 1. 機能概要

### 目的
特定のメディアやブログからの記事を効率的に閲覧できるようにし、信頼できるソースからの情報収集を支援する。

### 主な機能
- ソース一覧ページ
- ソース別記事フィルタリング
- ソース統計情報の表示
- ソースの特徴分析
- ソース検索機能
- ソースカテゴリー分類

## 2. 技術設計

### 2.1 データモデル拡張

```typescript
// ソースカテゴリー
enum SourceCategory {
  TECH_BLOG = 'tech_blog',
  COMPANY_BLOG = 'company_blog',
  PERSONAL_BLOG = 'personal_blog',
  NEWS_SITE = 'news_site',
  COMMUNITY = 'community',
  OTHER = 'other'
}

// ソース統計
interface SourceStats {
  totalArticles: number;
  avgQualityScore: number;
  popularTags: string[];
  publishFrequency: number; // 記事/日
  lastPublished: Date;
  growthRate: number; // 前月比
}
```

### 2.2 APIエンドポイント

```typescript
// GET /api/sources
interface SourcesResponse {
  sources: Array<{
    ...Source;
    stats: SourceStats;
    category: SourceCategory;
  }>;
  totalCount: number;
}

// GET /api/sources/[id]
interface SourceDetailResponse {
  source: Source;
  stats: SourceStats;
  recentArticles: Article[];
  topArticles: Article[];
  tagDistribution: Record<string, number>;
}
```

### 2.3 UI/UX設計

#### ソース一覧ページ
1. **グリッドレイアウト**: カード形式でソースを表示
2. **リストレイアウト**: 詳細情報を含む一覧表示
3. **フィルター**: カテゴリー、記事数、品質スコアでフィルタリング
4. **ソート**: 記事数、品質、更新頻度でソート

#### ソース詳細ページ
1. **ヘッダー**: ソース情報、統計サマリー
2. **記事一覧**: そのソースの最新記事
3. **分析**: タグ分布、投稿頻度グラフ
4. **関連ソース**: 類似のソース推薦

## 3. 実装計画

### Phase 1: 基本機能
1. ソース一覧API
2. ソース一覧ページ
3. 基本的なフィルタリング

### Phase 2: 詳細機能
1. ソース詳細ページ
2. 統計情報の計算・表示
3. カテゴリー分類

### Phase 3: 高度な機能
1. ソース推薦
2. ソース比較機能
3. お気に入り連携

## 4. 実装チェックリスト

- [ ] ソース一覧APIエンドポイント
- [ ] ソース詳細APIエンドポイント
- [ ] ソース一覧ページ
- [ ] ソースカードコンポーネント
- [ ] ソース詳細ページ
- [ ] 統計計算ロジック
- [ ] フィルター機能
- [ ] 検索機能
- [ ] レスポンシブ対応
- [ ] ドキュメント更新