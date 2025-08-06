# TechTrend プロジェクト詳細構造 (2025年1月)

## プロジェクト概要
Next.js 15を使用した技術記事収集・表示アプリケーション。
複数のソースから記事を収集し、AI要約と品質スコアリングを提供。

## ディレクトリ構造

### /app - Next.js App Router
- **メインページ**
  - `page.tsx` - トップページ（記事一覧）
  - `layout.tsx` - ルートレイアウト
  - `globals.css` - グローバルスタイル

- **機能別ページ**
  - `/analytics` - アナリティクスダッシュボード
  - `/articles/[id]` - 記事詳細ページ
  - `/favorites` - お気に入り記事
  - `/popular` - 人気記事
  - `/reading-list` - 読書リスト
  - `/search` - 検索ページ
  - `/sources` - ソース管理
  - `/stats` - 統計情報
  - `/tags` - タグ管理
  - `/trends` - トレンド分析

### /app/api - APIエンドポイント
- `/articles` - 記事CRUD操作
- `/ai/summarize` - AI要約生成
- `/feeds/collect` - フィード収集
- `/sources` - ソース管理
- `/tags` - タグ管理
- `/trends` - トレンド分析

### /app/components - UIコンポーネント

#### 共通コンポーネント (`/common`)
- `filters.tsx` - フィルター（ソース、タグ）
- `mobile-filters.tsx` - モバイル用フィルター
- `search-box.tsx` - 検索ボックス
- `server-pagination.tsx` - サーバーサイドページネーション
- `view-mode-toggle.tsx` - 表示モード切り替え
- `feed-update-button.tsx` - フィード更新ボタン
- `summary-generate-button.tsx` - 要約生成ボタン
- `tag-generate-button.tsx` - タグ生成ボタン
- `tag-filter-dropdown.tsx` - タグフィルタードロップダウン
- `popular-tags.tsx` - 人気タグ表示

#### 記事コンポーネント (`/article`)
- `list.tsx` - 記事リスト表示
- `list-item.tsx` - リストアイテム
- `card.tsx` - カード表示
- `article-skeleton.tsx` - ローディングスケルトン
- `share-button.tsx` - シェアボタン
- `related-articles.tsx` - 関連記事
- `detailed-summary-*.tsx` - 各種要約表示形式

### /lib - ビジネスロジック

#### データ取得 (`/fetchers`)
- `base.ts` - 基底フェッチャークラス
- `devto.ts` - Dev.toフェッチャー
- `qiita-popular.ts` - Qiita人気記事
- `zenn-extended.ts` - Zenn拡張
- `speakerdeck.ts` - Speaker Deck
- `publickey.ts` - Publickey
- `hatena-extended.ts` - はてなブックマーク
- その他多数のソース別フェッチャー

#### AI機能 (`/ai`)
- `gemini.ts` - Gemini API統合
- `claude-handler.ts` - Claude API統合
- `summarizer.ts` - 要約生成ロジック

#### キャッシュ (`/cache`)
- `redis-cache.ts` - Redisキャッシュ実装
- `popular-cache.ts` - 人気記事キャッシュ
- `source-cache.ts` - ソースキャッシュ
- `tag-cache.ts` - タグキャッシュ

#### ユーティリティ (`/utils`)
- `quality-score.ts` - 品質スコア計算
- `duplicate-detection.ts` - 重複検出
- `tag-normalizer.ts` - タグ正規化
- `date.ts` - 日付処理

### /prisma - データベース
- `schema.prisma` - Prismaスキーマ定義
- SQLiteデータベース使用

### /scripts - 管理スクリプト
- 記事収集、要約生成、品質管理等の各種スクリプト

### /components/ui - shadcn/uiコンポーネント
- Button, Card, Dialog, Sheet等の基本UIコンポーネント

## 主要な設定ファイル
- `next.config.ts` - Next.js設定
- `tailwind.config.ts` - Tailwind CSS設定
- `ecosystem.config.js` - PM2設定
- `scheduler-v2.ts` - スケジューラー設定
- `docker-compose.yml` - Docker設定

## 技術スタック
- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **UI**: shadcn/ui
- **データベース**: SQLite + Prisma ORM
- **キャッシュ**: Redis
- **AI**: Google Gemini, Claude
- **プロセス管理**: PM2

## 特徴的な実装
- サーバーコンポーネントを活用したSSR
- Redisキャッシュによる高速化
- 複数AIモデルによる要約生成
- 品質スコアリングシステム
- リアルタイムフィード更新