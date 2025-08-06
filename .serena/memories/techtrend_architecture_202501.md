# TechTrend アーキテクチャ詳細 (2025年1月)

## 技術スタック
- **フレームワーク**: Next.js 15 (App Router)
- **データベース**: SQLite (Prisma ORM)
- **キャッシュ**: Redis
- **スタイリング**: Tailwind CSS + shadcn/ui
- **AI**: Google Gemini API (要約・タグ生成)
- **言語**: TypeScript

## プロジェクト構造

### /app - Next.js App Router
- **page.tsx**: メインページ（記事一覧）
  - サーバーコンポーネント
  - ページネーション（上部・下部）
  - ソートオプション（公開順/取込順/品質/人気）
  - 表示モード切替（カード/リスト）
  
- **主要ルート**:
  - `/` - 記事一覧
  - `/search` - 検索
  - `/favorites` - お気に入り
  - `/sources` - ソース管理
  - `/stats` - 統計
  - `/tags` - タグクラウド
  - `/trends` - トレンド分析
  - `/reading-list` - 読書リスト
  - `/articles/[id]` - 記事詳細

### /lib - ビジネスロジック

#### fetchers/ - 記事取得システム（17ソース）
- **RSS系**: はてな, Qiita, Zenn, Dev.to, Publickey等
- **スクレイピング系**: Speaker Deck
- **基底クラス**: BaseFetcher
- **品質フィルタリング**:
  - Dev.to: 反応数10以上、読了時間2分以上
  - Qiita: ストック数10以上、24時間以内
  - Zenn: デイリートレンド

#### ai/ - AI処理
- **gemini-handler.ts**: Gemini API統合
  - 日本語要約生成
  - タグ自動生成
  - 記事分類（tutorial, release, problem-solving等）
- **claude-handler.ts**: Claude Code統合（対話的処理）

#### cache/ - キャッシュシステム
- **RedisCache**: 汎用キャッシュクラス
- **PopularCache**: 人気記事キャッシュ
- **SourceCache**: ソース別キャッシュ
- **TagCache**: タグ情報キャッシュ
- **TTL**: デフォルト1時間

#### database/ - データベース
- **Prisma Client**: SQLite接続
- **モデル**:
  - Article: 記事（要約、品質スコア、投票数等）
  - Source: ソース情報
  - Tag: タグ（カテゴリ付き）

### /components - UIコンポーネント

#### article/ - 記事表示
- **card.tsx**: カード表示
- **list.tsx**: リスト表示
- **list-item.tsx**: リストアイテム
- **detailed-summary-*.tsx**: 詳細要約表示（5種類）

#### common/ - 共通コンポーネント
- **filters.tsx**: サイドバーフィルター
- **search-box.tsx**: 検索ボックス
- **server-pagination.tsx**: ページネーション
- **view-mode-toggle.tsx**: 表示切替
- **tag-filter-dropdown.tsx**: タグフィルター

### /scripts - 管理スクリプト
- **generate-summaries.ts**: Gemini要約生成
- **generate-tags.ts**: タグ生成
- **collect-feeds.ts**: フィード収集
- **delete-low-quality-articles.ts**: 低品質記事削除

## スケジューラー（scheduler-v2.ts）

### RSS系（1時間ごと）
- はてなブックマーク
- Qiita Popular
- Zenn
- Dev.to
- Publickey
- Stack Overflow Blog
- Think IT

### スクレイピング系（12時間ごと - 0時・12時）
- Speaker Deck

### メンテナンス
- 週次: 低品質記事削除（日曜2時）
- 日次: 要約生成（3時）
- 半日: タグ生成（5時・17時）

## 最近の主要変更

### 2025年1月
1. **ページネーション上部配置**: 記事件数と同じ行に配置
2. **リスト表示追加**: カード/リスト切替機能
3. **パフォーマンス最適化**: 
   - Redis N+1問題解決
   - 背景グラデーション最適化
   - Cookie基テーマ管理

### 失敗した実装
- **Sticky ソートバー** (2025/01/06):
  - 背景色が意図しない要素に影響
  - ユーザー要求と実装が不一致
  - 完全にリバート済み

## パフォーマンス最適化

### キャッシュ戦略
- Redis多層キャッシュ
- 記事リスト: 1時間TTL
- 人気記事: 30分TTL
- ソース情報: 6時間TTL

### データベース最適化
- インデックス: URL、publishedAt、sourceId
- SELECT最適化: 必要フィールドのみ取得
- 並列クエリ実行

### フロントエンド最適化
- Server Components優先
- Suspenseバウンダリ
- 遅延ローディング
- 画像最適化（next/image）

## 運用ガイドライン

### 記事品質管理
1. **要約生成**: 必ずgenerate-summaries.tsで日本語生成
2. **フェッチャー**: summary: undefined設定必須
3. **品質フィルタ**: 各ソース独自の基準

### デプロイ
- PM2でスケジューラー管理
- Next.js本体はVercel/自社サーバー
- Redis必須（ローカル/Docker）

### 監視ポイント
- API Rate Limit（特にGemini）
- Redis接続状態
- スケジューラー実行ログ
- 記事取得成功率