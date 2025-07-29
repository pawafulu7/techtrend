# TechTrend API リファレンス

## 概要

TechTrendのAPIはRESTfulな設計に基づいており、Next.js App RouterのRoute Handlersを使用して実装されています。

## 基本情報

- **ベースURL**: `http://localhost:3000/api` (開発環境)
- **レスポンス形式**: JSON
- **文字エンコーディング**: UTF-8
- **認証**: 現在は不要（将来的に実装予定）

## エンドポイント

### 1. 記事関連

#### GET /api/articles

記事一覧を取得します。

**Query Parameters:**

| パラメータ | 型 | 必須 | 説明 | デフォルト |
|-----------|---|------|------|-----------|
| page | number | No | ページ番号（1から開始） | 1 |
| search | string | No | 検索キーワード（タイトル・要約を検索） | - |
| sourceId | string | No | ソースIDでフィルタ | - |
| tags | string | No | タグ名（カンマ区切りで複数指定可） | - |
| tagMode | string | No | タグの検索モード（AND/OR） | OR |
| difficulty | string | No | 難易度（beginner/intermediate/advanced） | - |

**Response:**

```json
{
  "articles": [
    {
      "id": "cmdn73lu10001texxm883gdmx",
      "title": "Next.js 15の新機能まとめ",
      "url": "https://example.com/article",
      "summary": "Next.js 15で追加された新機能について解説。App Routerの改善やパフォーマンス向上が主な内容。",
      "thumbnail": "https://example.com/thumbnail.jpg",
      "publishedAt": "2025-01-28T10:00:00.000Z",
      "sourceId": "cmdn73lu10000texxm883gdmx",
      "qualityScore": 75,
      "userVotes": 5,
      "difficulty": "intermediate",
      "source": {
        "id": "cmdn73lu10000texxm883gdmx",
        "name": "Zenn",
        "type": "FEED"
      },
      "tags": [
        {
          "id": "cmdn73lu10002texxm883gdmx",
          "name": "Next.js"
        },
        {
          "id": "cmdn73lu10003texxm883gdmx",
          "name": "React"
        }
      ]
    }
  ],
  "totalCount": 650,
  "totalPages": 33,
  "currentPage": 1
}
```

**Status Codes:**
- 200: 成功
- 500: サーバーエラー

**使用例:**

```bash
# 基本的な取得
curl "http://localhost:3000/api/articles"

# 検索とフィルタリング
curl "http://localhost:3000/api/articles?search=Next.js&tags=React,TypeScript&tagMode=AND&page=2"

# ソースと難易度でフィルタ
curl "http://localhost:3000/api/articles?sourceId=cmdn73lu10000texxm883gdmx&difficulty=intermediate"
```

#### POST /api/articles/[id]/vote

指定した記事に投票（いいね）します。

**URL Parameters:**
- `id`: 記事ID

**Request Body:** なし

**Response:**

```json
{
  "userVotes": 6
}
```

**Status Codes:**
- 200: 成功
- 404: 記事が見つからない
- 500: サーバーエラー

**使用例:**

```bash
curl -X POST "http://localhost:3000/api/articles/cmdn73lu10001texxm883gdmx/vote"
```

### 2. 統計関連

#### GET /api/stats

サイト全体の統計情報を取得します。

**Response:**

```json
{
  "overview": {
    "totalArticles": 650,
    "totalSources": 15,
    "totalTags": 170
  },
  "dailyStats": [
    {
      "date": "2025-01-28",
      "sourceName": "Zenn",
      "count": 30
    },
    {
      "date": "2025-01-28",
      "sourceName": "Qiita Popular",
      "count": 25
    }
  ],
  "sourceStats": [
    {
      "name": "Zenn",
      "articleCount": 120,
      "percentage": 18.5
    },
    {
      "name": "はてなブックマーク",
      "articleCount": 95,
      "percentage": 14.6
    }
  ],
  "tagStats": [
    {
      "name": "JavaScript",
      "articleCount": 85
    },
    {
      "name": "React",
      "articleCount": 72
    }
  ]
}
```

**Status Codes:**
- 200: 成功
- 500: サーバーエラー

**使用例:**

```bash
curl "http://localhost:3000/api/stats"
```

### 3. トレンド関連

#### GET /api/trends/keywords

急上昇キーワード（タグ）を取得します。

**Response:**

```json
{
  "trending": [
    {
      "name": "AI",
      "recentCount": 15,
      "weeklyAverage": 5,
      "growthRate": 200
    },
    {
      "name": "Next.js",
      "recentCount": 10,
      "weeklyAverage": 6,
      "growthRate": 66.7
    }
  ],
  "newTags": [
    {
      "name": "Claude Code",
      "firstSeen": "2025-01-28T08:00:00.000Z",
      "articleCount": 3
    }
  ]
}
```

**Status Codes:**
- 200: 成功
- 500: サーバーエラー

**使用例:**

```bash
curl "http://localhost:3000/api/trends/keywords"
```

#### GET /api/trends/analysis

トレンド分析データを取得します。

**Response:**

```json
{
  "popularTags": [
    {
      "name": "JavaScript",
      "count": 85
    },
    {
      "name": "React",
      "count": 72
    }
  ],
  "sourceActivity": [
    {
      "sourceName": "Zenn",
      "todayCount": 30,
      "yesterdayCount": 28,
      "weeklyCount": 195
    }
  ]
}
```

**Status Codes:**
- 200: 成功
- 500: サーバーエラー

**使用例:**

```bash
curl "http://localhost:3000/api/trends/analysis"
```

### 4. フィード管理

#### POST /api/feeds/collect

手動でフィード収集を実行します。

**Request Body:**

```json
{
  "sources": ["Zenn", "Qiita Popular"]  // 省略時は全ソース
}
```

**Response:**

```json
{
  "success": true,
  "newArticles": 45,
  "duplicates": 120,
  "duration": 15
}
```

**Status Codes:**
- 200: 成功
- 500: サーバーエラー

**使用例:**

```bash
# 全ソースから収集
curl -X POST "http://localhost:3000/api/feeds/collect"

# 特定のソースのみ
curl -X POST "http://localhost:3000/api/feeds/collect" \
  -H "Content-Type: application/json" \
  -d '{"sources": ["Zenn", "Qiita Popular"]}'
```

### 5. ヘルスチェック

#### GET /api/health

APIの稼働状況を確認します。

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-01-28T10:00:00.000Z",
  "database": "connected",
  "version": "1.0.0"
}
```

**Status Codes:**
- 200: 正常
- 503: サービス利用不可

**使用例:**

```bash
curl "http://localhost:3000/api/health"
```

## エラーレスポンス

すべてのエンドポイントは、エラー時に以下の形式でレスポンスを返します：

```json
{
  "error": "エラーメッセージ",
  "details": "詳細なエラー情報（開発環境のみ）"
}
```

## 制限事項

- レート制限: 現在は実装されていません
- ページネーション: 1ページあたり最大20件
- 検索文字数: 最大100文字
- タグ指定数: 最大10個

## 今後の実装予定

1. **認証・認可**
   - JWTベースの認証
   - APIキー管理

2. **追加エンドポイント**
   - `POST /api/articles/[id]/bookmark` - ブックマーク追加
   - `GET /api/users/[id]/feed` - パーソナライズドフィード
   - `POST /api/articles/[id]/comments` - コメント投稿

3. **WebSocket対応**
   - リアルタイム新着記事通知
   - ライブ統計更新

4. **GraphQL API**
   - より柔軟なデータ取得
   - サブスクリプション対応