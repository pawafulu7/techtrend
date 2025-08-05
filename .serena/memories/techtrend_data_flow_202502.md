# TechTrend データフロー詳細（2025年2月）

## データ収集から表示までの流れ

### 1. 記事収集フェーズ
```
スケジューラー（scheduler-v2.ts）
  ↓
フェッチャー起動（scripts/collect-feeds.ts）
  ↓
各フェッチャー（lib/fetchers/*.ts）
  ↓
品質フィルタリング
  ↓
データベース保存（Prisma → SQLite）
```

#### 収集タイミング
- **RSS系**: 1時間ごと（毎時0分）
- **Qiitaポピュラー**: 1日2回（5:05、17:05）
- **スクレイピング系**: 12時間ごと（0:00、12:00）
- **定期メンテナンス**: 
  - 低品質記事削除: 毎週日曜 2:00
  - 要約再生成: 毎日 3:00
  - Qiitaコンテンツ更新: 毎日 10:30

### 2. 記事処理パイプライン
```
収集済み記事
  ↓
要約生成（scripts/core/manage-summaries.ts）
  ├─ 記事タイプ判定（GeminiClient）
  ├─ タイプ別プロンプトで要約生成
  └─ タグ抽出
  ↓
品質スコア計算（scripts/core/manage-quality-scores.ts）
  ├─ 基本スコア（ブックマーク・投票）
  ├─ コンテンツスコア（要約・本文）
  ├─ 鮮度スコア（公開日時）
  └─ エンゲージメントスコア
  ↓
難易度レベル判定（scripts/calculate-difficulty-levels.ts）
  └─ AIによる5段階評価
```

### 3. データ取得・表示フロー
```
ユーザーリクエスト
  ↓
Next.js API Route（app/api/）
  ↓
Redisキャッシュチェック
  ├─ ヒット → キャッシュデータ返却
  └─ ミス → データベース検索
      ↓
Prisma ORM
  ↓
SQLiteデータベース
  ↓
レスポンス生成
  ↓
Redisキャッシュ保存
  ↓
クライアント表示
```

## フェッチャー別データ処理

### Dev.to
1. API経由で記事リスト取得
2. フィルタリング:
   - positive_reactions_count >= 10
   - reading_time_minutes >= 2
3. 個別記事詳細取得（description → content）
4. summary: undefined設定

### Qiita
1. APIで検索（stocks:>10、24時間以内）
2. 最大30件取得
3. 記事本文はbodyから取得
4. summary: undefined設定

### Zenn
1. トレンドRSSフィード取得
2. 複数トピック対応（ZennExtendedFetcher）
3. contentSnippetを本文として保存
4. summary: undefined設定

### Speaker Deck
1. トレンドページスクレイピング
2. 日本語プレゼンテーション抽出
3. スライド情報取得
4. summary: undefined設定

## キャッシュ戦略

### Redisキャッシュキー構造
```typescript
// 記事一覧
`articles:${page}:${limit}:${sourceId}:${tag}:${sortBy}`

// 記事詳細
`article:${id}`

// タグクラウド
`tags:cloud`

// ソース一覧
`sources:list`

// 統計情報
`stats:overview`
```

### キャッシュTTL
- 記事一覧: 5分
- 記事詳細: 10分
- タグクラウド: 30分
- ソース一覧: 1時間
- 統計情報: 15分

## エラーハンドリング

### フェッチャーレベル
- 最大3回リトライ（指数バックオフ）
- エラー時は空配列返却
- ログ記録（Winston）

### APIレベル
- try-catchでエラーキャッチ
- 適切なHTTPステータスコード返却
- エラーメッセージの標準化

### スケジューラーレベル
- 各タスク独立実行
- エラー時も継続実行
- PM2による自動再起動

## パフォーマンス最適化

### データベース
- インデックス設定（url、sourceId、publishedAt）
- ページネーション実装
- 不要なフィールド除外（select指定）

### API
- Redisキャッシュ活用
- 並列処理（Promise.all）
- レスポンス圧縮

### フロントエンド
- React Query使用
- 無限スクロール実装
- 画像遅延読み込み
- コンポーネント最適化

## 監視・ログ

### ログ出力先
- スケジューラー: logs/scheduler-*.log
- APIエラー: console.error
- フェッチャー: 各フェッチャー内でログ

### 監視項目
- API応答時間
- エラー率
- 記事収集成功率
- キャッシュヒット率

## セキュリティ考慮事項
- XSS対策: テキストサニタイズ
- SQLインジェクション対策: Prisma使用
- レート制限: 各APIの制限遵守
- 環境変数: APIキーの安全管理