# TechTrend 運用ガイド（2025年2月）

## 日常運用

### スケジューラー管理
```bash
# スケジューラー起動
npm run scheduler:start

# スケジューラー停止
npm run scheduler:stop

# スケジューラー再起動
npm run scheduler:restart

# ログ確認
npm run scheduler:logs
pm2 logs techtrend-scheduler --lines 100

# ステータス確認
pm2 status
```

### 手動実行コマンド
```bash
# 特定ソースの記事収集
npx tsx scripts/collect-feeds.ts "Dev.to" "Qiita"

# 要約生成
npx tsx scripts/core/manage-summaries.ts generate

# 品質スコア計算
npx tsx scripts/core/manage-quality-scores.ts calculate

# 難易度レベル判定
npx tsx scripts/calculate-difficulty-levels.ts

# 低品質記事削除
npx tsx scripts/delete-low-quality-articles.ts
```

## トラブルシューティング

### 要約が生成されない
1. 環境変数確認: `GEMINI_API_KEY`
2. APIクォータ確認
3. ログ確認: `pm2 logs techtrend-scheduler`
4. 手動実行でエラー確認

### 記事が収集されない
1. ソースの有効状態確認
2. APIキー・認証情報確認
3. ネットワーク接続確認
4. 各フェッチャーのフィルタリング条件確認

### パフォーマンス問題
1. Redisサービス確認
2. データベースサイズ確認
3. メモリ使用量確認: `pm2 monit`
4. 古い記事の削除実行

## 新機能追加

### 新しいフェッチャー追加
1. `lib/fetchers/`に新しいフェッチャークラス作成
2. `BaseFetcher`を継承
3. `fetch`メソッドと`fetchInternal`メソッド実装
4. 必ず`summary: undefined`を設定
5. `lib/fetchers/index.ts`にエクスポート追加
6. データベースにソース追加
7. スケジューラーに登録

### 新しい記事タイプ追加
1. `prisma/schema.prisma`の`articleType`コメント更新
2. 要約生成プロンプト更新
3. 記事タイプ判定ロジック追加
4. 表示コンポーネント対応

## メンテナンス

### 定期メンテナンス項目
- **毎日**: ログローテーション確認
- **毎週**: 低品質記事削除状況確認
- **毎月**: 
  - データベースサイズ確認
  - API使用量確認
  - パフォーマンスメトリクス確認

### データベースメンテナンス
```bash
# バックアップ
npx prisma db execute --file backup.sql --schema prisma/schema.prisma

# 統計情報確認
sqlite3 prisma/dev.db "SELECT source.name, COUNT(*) FROM Article JOIN Source ON Article.sourceId = Source.id GROUP BY source.name;"

# 古い記事削除
npx tsx scripts/delete-low-quality-articles.ts
```

### ログ管理
```bash
# ログローテーション設定確認
ls -la logs/

# 古いログ削除
find logs/ -name "*.log" -mtime +30 -delete
```

## 環境変数一覧

### 必須
- `DATABASE_URL`: SQLiteデータベースパス
- `GEMINI_API_KEY`: Google Generative AI APIキー

### オプション
- `REDIS_URL`: Redis接続URL（デフォルト: localhost:6379）
- `NODE_ENV`: 実行環境（development/production）
- `NEXT_PUBLIC_BASE_URL`: アプリケーションベースURL

## 品質管理基準

### 記事収集基準
- **Dev.to**: 反応数10以上、読了時間2分以上
- **Qiita**: ストック数10以上、24時間以内
- **Zenn**: トレンド記事
- **Speaker Deck**: 日本語プレゼンテーション

### 品質スコア構成
- 基本スコア（40%）: エンゲージメント指標
- コンテンツスコア（30%）: 要約・本文の有無
- 鮮度スコア（20%）: 公開からの経過時間
- エンゲージメント（10%）: ユーザー活動

### 削除基準
- 3ヶ月以上前の記事
- Dev.to: 反応数0の記事
- 品質スコア10未満の記事（検討中）

## CLI使用方法

### 基本構文
```bash
npm run techtrend -- [コマンド] [オプション]
```

### 主要コマンド
- `collect`: 記事収集
- `summarize`: 要約生成
- `quality`: 品質スコア計算
- `clean`: 低品質記事削除
- `stats`: 統計情報表示

## セキュリティ注意事項

1. **APIキー管理**
   - 環境変数で管理
   - .envファイルはGit管理外
   - 定期的なキーローテーション

2. **データベースアクセス**
   - Prismaを通じたアクセスのみ
   - 直接SQLは最小限に

3. **ログ管理**
   - センシティブ情報は記録しない
   - 定期的なログクリーンアップ

## パフォーマンスチューニング

### Redis最適化
- 適切なTTL設定
- メモリ使用量監視
- 不要なキー削除

### データベース最適化
- インデックスの定期確認
- VACUUM実行（SQLite）
- 不要データの定期削除

### API最適化
- レスポンスサイズ最小化
- ページネーション活用
- 並列処理の適切な使用