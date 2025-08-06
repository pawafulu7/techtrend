# TechTrend API エンドポイント詳細 (2025年1月)

## 記事関連 API

### GET /api/articles
- **機能**: 記事一覧取得
- **パラメータ**:
  - `page`: ページ番号
  - `limit`: 取得件数
  - `sourceId`: ソースID
  - `tag`: タグ名
  - `search`: 検索キーワード
  - `sortBy`: ソート項目（publishedAt/createdAt/qualityScore/bookmarks）
  - `sortOrder`: ソート順（asc/desc）
- **キャッシュ**: RedisCache使用
- **レスポンス**: 記事配列、ページング情報

### GET /api/articles/[id]
- **機能**: 記事詳細取得
- **パラメータ**: 記事ID
- **レスポンス**: 記事詳細（関連記事含む）

### POST /api/articles/[id]/vote
- **機能**: 記事への投票
- **ボディ**: `{ vote: 1 | -1 }`
- **処理**: userVotesフィールド更新
- **制限**: クライアント側で重複防止

### GET /api/articles/[id]/related
- **機能**: 関連記事取得
- **ロジック**: 同じタグを持つ記事
- **件数**: 最大5件

### GET /api/articles/popular
- **機能**: 人気記事取得
- **基準**: 
  - 投票数
  - ブックマーク数
  - 品質スコア
- **キャッシュ**: 30分TTL

### GET /api/articles/favorites
- **機能**: お気に入り記事取得
- **実装**: Cookie/LocalStorageベース

### GET /api/articles/search
- **機能**: 記事検索
- **パラメータ**:
  - `q`: 検索クエリ
  - `sourceId`: ソースフィルター
  - `tag`: タグフィルター
- **検索対象**: タイトル、要約

### GET /api/articles/search/advanced
- **機能**: 詳細検索
- **追加パラメータ**:
  - `dateFrom`: 開始日
  - `dateTo`: 終了日
  - `difficulty`: 難易度
  - `articleType`: 記事タイプ

## フィード管理 API

### POST /api/feeds/collect
- **機能**: フィード収集実行
- **パラメータ**: 
  - `source`: ソース名（省略時は全て）
- **処理**:
  1. フェッチャー実行
  2. 重複チェック
  3. DB保存
  4. キャッシュ更新
- **レスポンス**: 収集結果統計

## ソース管理 API

### GET /api/sources
- **機能**: ソース一覧取得
- **フィルター**: 有効なソースのみ
- **レスポンス**: ソース情報、記事数

### GET /api/sources/[id]
- **機能**: ソース詳細取得
- **レスポンス**: ソース情報、最新記事

### PUT /api/sources/[id]
- **機能**: ソース設定更新
- **更新可能**: enabled状態

## AI処理 API

### POST /api/ai/summarize
- **機能**: 記事要約生成
- **ボディ**: `{ articleId: string }`
- **処理**:
  1. Gemini API呼び出し
  2. 日本語要約生成
  3. DB更新
- **制限**: Rate Limit対応

### POST /api/summaries/generate
- **機能**: バッチ要約生成
- **処理**: 要約なし記事を自動処理
- **並列数**: 3
- **エラー処理**: リトライ機能

### POST /api/tags/generate
- **機能**: タグ生成
- **処理**:
  1. 記事内容分析
  2. カテゴリ分類
  3. タグ抽出
- **最大タグ数**: 5個/記事

### GET /api/tags/cloud
- **機能**: タグクラウドデータ取得
- **レスポンス**: タグ名、使用頻度、カテゴリ

### GET /api/tags/stats
- **機能**: タグ統計取得
- **内容**:
  - 総タグ数
  - カテゴリ別分布
  - トレンド情報

### POST /api/tags/new
- **機能**: 新規タグ作成
- **ボディ**: `{ name: string, category?: string }`

## 統計・分析 API

### GET /api/stats
- **機能**: 全体統計取得
- **内容**:
  - 総記事数
  - ソース別記事数
  - 日別記事数
  - タグ分布

### GET /api/trends/analysis
- **機能**: トレンド分析
- **期間**: 7日、30日、90日
- **分析内容**:
  - 人気キーワード
  - 急上昇タグ
  - ソース別トレンド

### GET /api/trends/keywords
- **機能**: キーワードトレンド
- **アルゴリズム**: TF-IDF
- **期間**: 過去24時間～1週間

## ユーティリティ API

### GET /api/health
- **機能**: ヘルスチェック
- **確認項目**:
  - DB接続
  - Redis接続
  - APIキー有効性
- **レスポンス**: `{ status: "ok" | "error", details: {} }`

### POST /api/view-mode
- **機能**: 表示モード切替
- **ボディ**: `{ mode: "card" | "list" }`
- **保存先**: Cookie

## エラーハンドリング

### 共通エラーレスポンス
```json
{
  "error": "エラーメッセージ",
  "code": "ERROR_CODE",
  "details": {}
}
```

### エラーコード
- `RATE_LIMIT`: レート制限
- `NOT_FOUND`: リソース不在
- `VALIDATION_ERROR`: バリデーションエラー
- `INTERNAL_ERROR`: サーバーエラー
- `AUTH_REQUIRED`: 認証必要

## Rate Limiting

### Gemini API
- **制限**: 60 requests/minute
- **対策**: 
  - キュー実装
  - リトライ with exponential backoff
  - 並列数制限

### 内部API
- **実装予定**: Redis-based rate limiter
- **制限案**: 100 requests/minute/IP

## キャッシュ戦略

### キャッシュ階層
1. **CDN**: 静的アセット
2. **Redis**: APIレスポンス
3. **Memory**: 頻繁アクセスデータ

### キャッシュTTL
- 記事一覧: 1時間
- 記事詳細: 6時間
- ソース情報: 12時間
- タグクラウド: 1時間
- 統計データ: 30分

## セキュリティ

### 実装済み
- CORS設定
- 入力サニタイゼーション
- SQLインジェクション対策（Prisma）

### 実装予定
- API認証（管理機能）
- Rate Limiting
- リクエスト署名検証