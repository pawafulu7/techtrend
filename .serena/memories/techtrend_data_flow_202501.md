# TechTrend データフロー詳細 (2025年1月)

## 記事収集フロー

### 1. スケジューラー起動
```
scheduler-v2.ts (PM2で管理)
├── RSS系: 1時間ごと実行
└── スクレイピング系: 12時間ごと実行
```

### 2. フェッチャー実行
```
BaseFetcher (基底クラス)
├── fetch() メソッド実装
├── 品質フィルタリング
├── 正規化処理
└── エラーハンドリング
```

### 3. データ処理パイプライン
```
収集 → 重複チェック → DB保存 → 要約生成 → タグ生成
```

#### 詳細ステップ:
1. **フィード取得**
   - RSS/APIから記事データ取得
   - レート制限対応
   - エラーリトライ

2. **重複検出**
   - URL単位でユニーク制約
   - タイトル類似度チェック（予定）

3. **データ正規化**
   - 日付フォーマット統一
   - HTMLタグ除去
   - 文字エンコーディング修正

4. **DB保存**
   ```typescript
   Article {
     id: CUID
     title: 記事タイトル
     url: ユニークURL
     summary: undefined (この時点では空)
     publishedAt: 公開日時
     sourceId: ソースID
     qualityScore: 0 (後で計算)
   }
   ```

5. **要約生成** (非同期・バッチ)
   - Gemini APIで日本語要約
   - 3並列実行
   - エラー時3回リトライ
   - summaryVersion管理

6. **タグ生成** (非同期・バッチ)
   - 記事内容分析
   - カテゴリ分類
   - 最大5タグ/記事

## 表示フロー

### 1. リクエスト処理
```
ブラウザ → Next.js Server Component → データ取得
```

### 2. データ取得レイヤー
```typescript
// app/page.tsx
async function getArticles(params) {
  // 1. パラメータ解析
  // 2. WHERE句構築
  // 3. Prismaクエリ実行（並列）
  const [total, articles] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({ where, select, orderBy })
  ])
  // 4. ページング情報付加
  return { articles, total, page, totalPages }
}
```

### 3. キャッシュレイヤー
```
Redis Cache
├── namespace: "articles"
├── key生成: params → hash
├── TTL: 1時間
└── 無効化: 新記事追加時
```

### 4. レンダリング
```
Server Component (初期HTML)
├── Suspense境界
├── ストリーミングSSR
└── Client Component (インタラクション)
    ├── 投票機能
    ├── 表示切替
    └── フィルター操作
```

## キャッシュフロー

### 多層キャッシュ構造
```
CDN (Vercel/Cloudflare)
 ↓
Next.js Cache
 ↓
Redis Cache ← 主要キャッシュ層
 ↓
Database (SQLite)
```

### キャッシュ無効化戦略
1. **時間ベース**: TTL期限切れ
2. **イベントベース**: 
   - 新記事追加
   - 記事更新
   - 投票/ブックマーク
3. **手動**: 管理画面から

### Redisキー構造
```
techtrend:articles:list:{hash}     # 記事リスト
techtrend:articles:detail:{id}     # 記事詳細
techtrend:sources:{id}             # ソース情報
techtrend:tags:popular             # 人気タグ
techtrend:stats:daily:{date}       # 日別統計
```

## 品質スコア計算フロー

### スコア要素
```typescript
qualityScore = 
  (反応数 * 0.3) +
  (読了時間 * 0.2) +
  (タグ数 * 0.1) +
  (要約品質 * 0.2) +
  (公開からの経過時間 * 0.2)
```

### 更新タイミング
- 初回: 記事保存時
- 定期: 日次バッチ
- リアルタイム: 投票時

## エラー処理フロー

### フェッチャーエラー
```
エラー発生
├── ログ記録
├── 3回リトライ (exponential backoff)
├── 失敗時: 次回実行まで待機
└── 通知: Slackアラート（予定）
```

### API Rate Limit
```
Rate Limit検出
├── 429 Status Code
├── キューに追加
├── 待機時間計算
└── 順次実行
```

### データベースエラー
```
Prismaエラー
├── トランザクションロールバック
├── エラーログ記録
├── ユーザー通知
└── 管理者アラート
```

## パフォーマンス最適化

### N+1問題対策
```typescript
// 悪い例（N+1）
const articles = await prisma.article.findMany()
for (const article of articles) {
  const tags = await prisma.tag.findMany({ where: { articles: { some: { id: article.id }}}})
}

// 良い例（include使用）
const articles = await prisma.article.findMany({
  include: { tags: true, source: true }
})
```

### 並列処理
```typescript
// Promise.allで並列実行
const [articles, sources, tags] = await Promise.all([
  getArticles(params),
  getSources(),
  getPopularTags()
])
```

### SELECT最適化
```typescript
// 必要なフィールドのみ取得
select: {
  id: true,
  title: true,
  summary: true,
  // content: false, // 重いフィールドは除外
  // thumbnail: false
}
```

## モニタリングポイント

### メトリクス
1. **応答時間**: p50, p95, p99
2. **キャッシュヒット率**: Redis統計
3. **エラー率**: 5xx, 4xx
4. **API使用量**: Gemini quota

### ログ
- アプリケーションログ: PM2
- アクセスログ: Nginx/Vercel
- エラーログ: Sentry（予定）
- パフォーマンス: DataDog（予定）