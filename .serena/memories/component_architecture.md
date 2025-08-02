# コンポーネントアーキテクチャ

## UIコンポーネント構成

### 基盤UIライブラリ
- **Radix UI**: ヘッドレスUIコンポーネント
- **class-variance-authority (CVA)**: バリアント管理
- **Tailwind CSS**: スタイリング
- **lucide-react**: アイコン

### コンポーネント階層

#### 1. 基礎UIコンポーネント (`components/ui/`)
- Button, Badge, Card, Dialog, Sheet
- Select, Input, Label, Separator
- Toast, Tabs, Dropdown Menu
- 全てRadix UIベース、CVAでバリアント管理
- `cn()`ユーティリティでクラス名結合

#### 2. ドメイン固有コンポーネント

**記事関連 (`app/components/article/`)**
- ArticleCard: 記事カード表示
- ArticleList: 記事一覧
- DetailedSummaryDisplay: 詳細要約表示
- RelatedArticles: 関連記事
- ShareButton: 共有ボタン

**検索関連 (`app/components/search/`)**
- SearchBar: 検索バー（サジェスト機能付き）
- SearchFilters: 検索フィルター
- SearchResults: 検索結果表示

**タグ関連 (`app/components/tags/`)**
- TagCloud: タグクラウド
- TagStats: タグ統計

**ソース関連 (`app/components/sources/`)**
- SourceCard: ソース情報カード
- FavoriteButton: お気に入りボタン

**統計関連 (`app/components/stats/`)**
- DailyChart: 日別チャート（Recharts使用）
- SourceChart: ソース別チャート
- StatsOverview: 統計概要

**共通 (`app/components/common/`)**
- Pagination: ページネーション
- TagFilter: タグフィルター
- Filters: フィルター全般
- FeedUpdateButton: フィード更新ボタン

### 特徴的な実装
- React Server Components対応
- useClientディレクティブでクライアントコンポーネント指定
- 読書リスト機能はIndexedDB使用（`lib/reading-list/db.ts`）
- 分析トラッキング機能（`lib/analytics/tracking.ts`）