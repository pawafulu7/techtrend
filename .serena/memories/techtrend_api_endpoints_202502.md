# TechTrend APIエンドポイント仕様（2025年2月）

## API概要
Next.js App Router のRoute Handlersを使用したRESTful API実装。
全エンドポイントは `/app/api/` ディレクトリに配置。

## 記事関連API

### GET /api/articles
記事一覧取得
- **パラメータ**:
  - `page`: ページ番号（デフォルト: 1）
  - `limit`: 取得件数（デフォルト: 20、最大: 100）
  - `source`: ソース名でフィルタ
  - `tag`: タグ名でフィルタ
  - `difficulty`: 難易度でフィルタ
  - `dateFrom/dateTo`: 期間フィルタ
  - `qualityMin/qualityMax`: 品質スコア範囲
- **レスポンス**: 記事配列、総件数、ページネーション情報
- **キャッシュ**: 30分

### POST /api/articles
記事作成（内部使用）
- **ボディ**: 記事オブジェクト
- **認証**: 不要（将来的に実装予定）

### GET /api/articles/[id]
記事詳細取得
- **パラメータ**: 記事ID
- **レスポンス**: 記事詳細、関連タグ、ソース情報
- **キャッシュ**: 1時間

### POST /api/articles/[id]/vote
記事への投票
- **ボディ**: `{ vote: 1 | -1 }`
- **レスポンス**: 更新後の投票数

### GET /api/articles/[id]/related
関連記事取得
- **パラメータ**: 記事ID
- **レスポンス**: 関連記事配列（最大10件）
- **アルゴリズム**: タグ類似度ベース

### GET /api/articles/popular
人気記事取得
- **パラメータ**:
  - `period`: 期間（day/week/month/all）
  - `limit`: 取得件数（デフォルト: 10）
- **レスポンス**: 人気記事配列
- **ソート**: qualityScore × userVotes

### GET /api/articles/favorites
お気に入り記事取得
- **認証**: 必要（Cookie/Session）
- **レスポンス**: ユーザーのお気に入り記事

## 検索API

### GET /api/articles/search
基本検索
- **パラメータ**:
  - `q`: 検索クエリ
  - `page`: ページ番号
  - `limit`: 取得件数
- **検索対象**: タイトル、要約、コンテンツ
- **レスポンス**: 検索結果、ハイライト付き

### GET /api/articles/search/advanced
詳細検索
- **パラメータ**:
  - `q`: 検索クエリ（AND/OR/NOT対応）
  - `tags[]`: タグ（複数指定可）
  - `sources[]`: ソース（複数指定可）
  - `difficulty[]`: 難易度（複数指定可）
  - `excludeTags`: 除外タグ（カンマ区切り）
  - `excludeSources`: 除外ソース（カンマ区切り）
  - `hasContent`: コンテンツ有無
  - `sortBy`: ソート（relevance/date/popularity/quality）
- **検索エンジン**: SQLite FTS5
- **レスポンス**: 検索結果、ファセット情報

## ソース関連API

### GET /api/sources
ソース一覧取得
- **レスポンス**: 全ソース情報
- **フィールド**: id, name, type, url, enabled, 記事数

### GET /api/sources/[id]
ソース詳細取得
- **パラメータ**: ソースID
- **レスポンス**: ソース詳細、統計情報

### PUT /api/sources/[id]
ソース更新（管理用）
- **ボディ**: 更新内容
- **更新可能**: enabled, url

### DELETE /api/sources/[id]
ソース削除（管理用）
- **注意**: 関連記事も削除される

## タグ関連API

### GET /api/tags/cloud
タグクラウド取得
- **パラメータ**:
  - `limit`: 取得件数（デフォルト: 50）
  - `minCount`: 最小記事数（デフォルト: 2）
- **レスポンス**: タグ名、記事数、カテゴリ
- **キャッシュ**: 2時間

### GET /api/tags/stats
タグ統計取得
- **レスポンス**: 
  - 総タグ数
  - カテゴリ別統計
  - 人気タグTOP10

### POST /api/tags/generate
タグ生成（管理用）
- **ボディ**: `{ articleId: string }`
- **処理**: AI によるタグ自動生成

### GET /api/tags/new
新規タグ取得
- **パラメータ**: `days`（過去N日間）
- **レスポンス**: 新規作成されたタグ一覧

## AI/要約関連API

### POST /api/ai/summarize
要約生成
- **ボディ**: 
  ```json
  {
    "title": "記事タイトル",
    "content": "記事本文",
    "articleType": "記事タイプ"
  }
  ```
- **レスポンス**: 要約文（60-80文字）
- **AI**: Google Generative AI (Gemini)

### POST /api/summaries/generate
バッチ要約生成（管理用）
- **処理**: 未要約記事の一括処理
- **制限**: 100件/バッチ

### POST /api/feeds/collect
フィード収集（管理用）
- **ボディ**: `{ sources?: string[] }`
- **処理**: 指定ソースから記事収集

## トレンド分析API

### GET /api/trends/analysis
トレンド分析取得
- **パラメータ**:
  - `period`: 期間（day/week/month）
  - `type`: 分析タイプ（keyword/source/tag）
- **レスポンス**: トレンドデータ、グラフ用データ
- **キャッシュ**: 1時間

### GET /api/trends/keywords
キーワードトレンド取得
- **パラメータ**:
  - `limit`: 取得件数
  - `period`: 期間
- **レスポンス**: トレンドキーワード、出現頻度

## 統計API

### GET /api/stats
総合統計取得
- **レスポンス**:
  - 総記事数
  - 総ソース数
  - 総タグ数
  - 日別/週別/月別統計
- **キャッシュ**: 1時間

## キャッシュ管理API

### GET /api/cache/health
キャッシュヘルスチェック
- **レスポンス**:
  - Redis接続状態
  - メモリ使用量
  - ヒット率統計

### GET /api/cache/stats
キャッシュ統計取得
- **レスポンス**:
  - 名前空間別統計
  - ヒット/ミス数
  - 平均レスポンス時間

### POST /api/cache/optimize
キャッシュ最適化実行
- **処理**: メモリ最適化、古いキー削除
- **認証**: 必要（管理者のみ）

## システムAPI

### GET /api/health
ヘルスチェック
- **レスポンス**: 
  ```json
  {
    "status": "ok",
    "database": "connected",
    "cache": "connected",
    "timestamp": "2025-02-06T10:00:00Z"
  }
  ```

### GET /api/view-mode
表示モード取得
- **レスポンス**: ユーザーの表示設定

### POST /api/view-mode
表示モード更新
- **ボディ**: `{ mode: "card" | "list" | "compact" }`

## エラーレスポンス

### 共通エラー形式
```json
{
  "error": "エラーメッセージ",
  "code": "ERROR_CODE",
  "details": {
    // 詳細情報
  }
}
```

### HTTPステータスコード
- 200: 成功
- 201: 作成成功
- 400: 不正なリクエスト
- 404: リソース未発見
- 429: レート制限
- 500: サーバーエラー
- 503: サービス一時停止

## レート制限
- 一般API: 100リクエスト/分
- 検索API: 30リクエスト/分
- AI API: 10リクエスト/分
- 管理API: 認証必須

## セキュリティ
- CORS設定: 同一オリジンのみ
- CSRFトークン: POST/PUT/DELETE で必須
- 入力検証: Zodスキーマ使用
- SQLインジェクション対策: Prisma ORM