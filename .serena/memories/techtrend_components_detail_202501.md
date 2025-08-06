# TechTrend コンポーネント詳細 (2025年1月)

## 主要ページコンポーネント

### app/page.tsx (メインページ)
- **役割**: 記事一覧表示のメインページ
- **タイプ**: Server Component
- **主要機能**:
  - 記事取得（getArticles）: ページネーション、フィルタリング、ソート
  - ソース取得（getSources）: 有効なソースのみ
  - タグ取得（getPopularTags）: 人気タグ上位20件
- **レイアウト構造**:
  ```
  Header (タイトル、管理ボタン)
  ├── SearchBox + TagFilterDropdown
  ├── Sidebar (Filters) - Desktop only
  └── Main Content
      ├── Sort Bar (記事件数、ソート、表示切替)
      ├── ArticleList
      └── Pagination
  ```
- **Line 219**: ソートバーのコンテナ（sticky実装で問題があった箇所）

## 記事表示コンポーネント

### article/card.tsx (ArticleCard)
- **機能**: カード形式の記事表示
- **インタラクション**:
  - クリックで新規タブで開く
  - 投票機能（handleVote）
  - NEW表示（24時間以内）
- **表示要素**: タイトル、要約、ソース、タグ、公開日時、投票数

### article/list.tsx (ArticleList)
- **機能**: 記事リストのコンテナ
- **表示モード**: 
  - カード形式: グリッドレイアウト
  - リスト形式: 縦並びレイアウト
- **レスポンシブ**: モバイル対応

### article/list-item.tsx
- **機能**: リスト形式の個別記事表示
- **特徴**: コンパクトな横並びレイアウト

## 共通コンポーネント

### common/search-box.tsx
- **機能**: 記事検索
- **特徴**: 
  - URLパラメータ連携
  - デバウンス処理
  - Enter/Escキー対応

### common/filters.tsx
- **機能**: サイドバーフィルター（デスクトップ）
- **フィルター種類**:
  - ソース選択
  - タグ選択（複数選択、AND/OR）
  - 期間フィルター（予定）

### common/mobile-filters.tsx
- **機能**: モバイル用フィルター
- **UI**: Sheet（スライドパネル）形式

### common/server-pagination.tsx
- **機能**: ページネーション
- **特徴**:
  - Server Component
  - URLパラメータ保持
  - 前後ページリンク
  - ページ番号表示（現在/全体）

### common/view-mode-toggle.tsx
- **機能**: 表示モード切替（カード/リスト）
- **実装**: 
  - Cookieで設定保存
  - Server Actionで切替
  - アイコン表示（LayoutGrid/List）

### common/tag-filter-dropdown.tsx
- **機能**: タグフィルターのドロップダウン
- **特徴**:
  - 複数選択可能
  - AND/OR切替
  - 人気タグ表示

## 管理系コンポーネント

### common/feed-update-button.tsx
- **機能**: フィード手動更新
- **権限**: 管理者のみ（予定）
- **API**: /api/feeds/collect

### common/summary-generate-button.tsx
- **機能**: 要約生成トリガー
- **API**: /api/summaries/generate
- **処理**: Gemini APIで日本語要約生成

### common/tag-generate-button.tsx
- **機能**: タグ生成トリガー
- **API**: /api/tags/generate
- **処理**: 記事内容からタグ自動生成

## レイアウトコンポーネント

### layout/header.tsx
- **機能**: 全体ヘッダー
- **内容**: ナビゲーション、テーマ切替

### layout/footer.tsx
- **機能**: フッター
- **内容**: コピーライト、リンク

### layout/no-transitions.tsx
- **機能**: 初期ロード時のトランジション無効化
- **目的**: フリッカー防止

## UIライブラリ（shadcn/ui）

### 使用コンポーネント
- **Button**: 各種ボタン
- **Card**: カードレイアウト
- **Badge**: タグ表示
- **Sheet**: モバイルパネル
- **Dialog**: モーダル
- **Select**: セレクトボックス
- **Input**: 入力フィールド
- **Skeleton**: ローディング表示
- **Tabs**: タブ切替
- **Dropdown Menu**: メニュー

## スタイリング

### globals.css
- **CSS変数**: カラーテーマ定義
- **グラデーション**: 背景効果
- **ダークモード**: `.dark`クラスで切替
- **カスタム変数**:
  - `--gradient-subtle`: 薄いグラデーション
  - `--shadow-*`: シャドウ定義
  - `--accent-*`: アクセントカラー

### Tailwind設定
- **プリセット**: shadcn/ui
- **カスタムバリアント**: `dark:`
- **レスポンシブ**: sm, md, lg, xl
- **アニメーション**: tw-animate-css

## パフォーマンス考慮事項

### Server Components優先
- データフェッチはサーバー側
- クライアント状態は最小限
- Suspenseでローディング制御

### 最適化ポイント
1. **画像**: next/imageで最適化
2. **フォント**: next/fontで最適化
3. **CSS**: Tailwindでパージ
4. **JS**: 必要なコンポーネントのみClient化

## 今後の改善案

### UI/UX改善
1. **スケルトンローディング**: 全体的に実装
2. **インフィニットスクロール**: ページネーション代替案
3. **ショートカットキー**: キーボード操作対応
4. **アクセシビリティ**: ARIA属性追加

### コンポーネント分割
1. **記事カードの細分化**: ヘッダー、ボディ、フッター
2. **フィルターの抽象化**: 汎用フィルターコンポーネント
3. **レイアウトの共通化**: 共通レイアウトテンプレート