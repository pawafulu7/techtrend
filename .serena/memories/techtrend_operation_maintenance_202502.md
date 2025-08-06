# TechTrend 運用・保守ガイド（2025年2月）

## 運用環境
- **OS**: WSL2 (Linux) on Windows
- **Node.js**: nvm管理
- **プロセス管理**: PM2
- **データベース**: SQLite
- **キャッシュ**: Redis

## デイリー運用タスク

### 1. システム監視
```bash
# PM2プロセス確認
pm2 status

# ログ確認
pm2 logs scheduler-v2 --lines 100

# Redis状態確認
redis-cli ping

# データベースサイズ確認
ls -lh prisma/dev.db
```

### 2. 記事収集状況確認
```bash
# 最新記事確認
npx tsx scripts/check-recent-articles.ts

# 未要約記事確認
npx tsx scripts/check-missing-summaries.ts

# 品質チェック
npx tsx scripts/check-article-quality.ts
```

### 3. エラー対応

#### Gemini API Rate Limit
```bash
# Claude Code補完要約
npm run claude:summarize

# または待機後再実行
npm run scripts:summarize
```

#### Redis接続エラー
```bash
# Redis再起動
sudo service redis-server restart

# 接続テスト
node scripts/test-redis-connection.js
```

#### PM2プロセス停止
```bash
# 再起動
pm2 restart scheduler-v2

# 完全再起動
pm2 delete scheduler-v2
pm2 start ecosystem.config.js
```

## 定期メンテナンス

### 週次タスク
1. **低品質記事削除**
```bash
npx tsx scripts/delete-low-quality-articles.ts
```

2. **データベース最適化**
```bash
sqlite3 prisma/dev.db "VACUUM;"
sqlite3 prisma/dev.db "ANALYZE;"
```

3. **キャッシュクリーンアップ**
```bash
curl -X POST http://localhost:3000/api/cache/optimize
```

### 月次タスク
1. **バックアップ**
```bash
./scripts/backup.sh
```

2. **統計レポート生成**
```bash
npx tsx scripts/generate-monthly-report.ts
```

3. **依存関係更新**
```bash
npm outdated
npm update
```

## トラブルシューティング

### 問題1: 記事が収集されない

**確認手順**:
1. PM2プロセス確認
2. ソースの有効状態確認
3. フェッチャーエラーログ確認

**対処法**:
```bash
# 手動収集実行
npx tsx scripts/collect-feeds.ts "ソース名"

# スケジューラー再起動
pm2 restart scheduler-v2
```

### 問題2: 要約が生成されない

**原因**:
- Gemini API のRate Limit
- API キーの期限切れ
- ネットワークエラー

**対処法**:
```bash
# API キー確認
echo $GEMINI_API_KEY

# 手動要約生成
npm run scripts:summarize

# Claude Code使用
npm run claude:summarize
```

### 問題3: サイトが重い

**確認手順**:
```bash
# キャッシュヒット率確認
curl http://localhost:3000/api/cache/stats

# メモリ使用量確認
pm2 monit
```

**対処法**:
```bash
# キャッシュウォーミング
npx tsx scripts/warm-cache.ts

# メモリ最適化
curl -X POST http://localhost:3000/api/cache/optimize
```

### 問題4: 重複記事が表示される

**対処法**:
```bash
# 重複チェック
npx tsx scripts/check-duplicates.ts

# URL正規化
npx tsx scripts/normalize-urls.ts
```

## CLIツール使用法

### 基本コマンド
```bash
# ヘルプ表示
npm run techtrend -- --help

# フィード収集
npm run techtrend -- feeds collect --source "Dev.to"

# 要約生成
npm run techtrend -- summaries generate --limit 50

# 品質スコア計算
npm run techtrend -- quality-scores calculate

# タグ生成
npm run techtrend -- tags generate --force

# クリーンアップ
npm run techtrend -- cleanup --days 90
```

### バッチ処理
```bash
# 全ソース更新
npm run techtrend -- feeds collect --all

# 全記事再評価
npm run techtrend -- quality-scores recalculate --all
```

## スケジューラー管理

### 設定ファイル
- `scheduler-v2.ts`: スケジュール定義
- `ecosystem.config.js`: PM2設定

### スケジュール変更
```javascript
// scheduler-v2.ts
// RSS系（1時間毎）を30分毎に変更
cron.schedule('*/30 * * * *', async () => {
  // 処理
});
```

変更後:
```bash
pm2 restart scheduler-v2
```

### ログローテーション
```javascript
// ecosystem.config.js
log_date_format: 'YYYY-MM-DD HH:mm Z',
max_size: '10M',
retain: '30',
```

## パフォーマンスチューニング

### データベース
```sql
-- インデックス再構築
REINDEX;

-- 統計情報更新
ANALYZE;

-- 断片化解消
VACUUM;
```

### Redis
```bash
# メモリ使用状況
redis-cli INFO memory

# 設定確認
redis-cli CONFIG GET maxmemory

# キー数確認
redis-cli DBSIZE
```

### Next.js
```bash
# ビルド最適化
npm run build

# 本番モード起動
npm run start
```

## 監視設定

### ヘルスチェック
```bash
# システムヘルス
curl http://localhost:3000/api/health

# キャッシュヘルス
curl http://localhost:3000/api/cache/health
```

### アラート設定（PM2）
```javascript
// ecosystem.config.js
min_uptime: '10s',
max_restarts: 10,
error_file: './logs/err.log',
out_file: './logs/out.log',
```

## セキュリティ対策

### 環境変数管理
```bash
# .env.local
DATABASE_URL="file:./dev.db"
GEMINI_API_KEY="your-api-key"
REDIS_URL="redis://localhost:6379"
```

### アクセス制限
- 管理APIには認証実装予定
- CORS設定で外部アクセス制限
- Rate Limiting実装

### データ保護
- SQLインジェクション: Prisma ORM使用
- XSS: React自動エスケープ
- CSRF: トークン検証

## バックアップ・リストア

### バックアップ
```bash
# 手動バックアップ
./scripts/backup.sh

# 自動バックアップ（cron）
0 2 * * * /path/to/backup.sh
```

### リストア
```bash
# データベース復元
cp backup/techtrend_backup_YYYYMMDD.sql prisma/dev.db

# マイグレーション実行
npx prisma migrate deploy
```

## デプロイ手順

### 1. 事前準備
```bash
# テスト実行
npm test

# ビルド確認
npm run build
```

### 2. デプロイ
```bash
# コード更新
git pull origin main

# 依存関係更新
npm ci

# データベース更新
npx prisma migrate deploy

# ビルド
npm run build

# PM2再起動
pm2 restart all
```

### 3. 確認
```bash
# ヘルスチェック
curl http://localhost:3000/api/health

# ログ確認
pm2 logs
```

## 注意事項
1. **要約生成ルール**: フェッチャーで要約生成禁止
2. **品質基準**: 各ソースのフィルタリング維持
3. **コミット**: 機能追加・修正時は都度コミット
4. **メモリ制限**: PM2で1GB制限設定
5. **ログ管理**: 定期的なログローテーション