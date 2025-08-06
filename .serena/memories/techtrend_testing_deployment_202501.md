# TechTrend テスト・デプロイ詳細 (2025年1月)

## テスト構成

### 現在のテストカバレッジ
- **Unit Tests**: 基本的なユーティリティ関数
- **Integration Tests**: 限定的（Redis接続等）
- **E2E Tests**: 未実装
- **Manual Tests**: チェックリスト有り

### テストファイル構造
```
tests/
├── unit/
│   ├── share-button.test.tsx
│   ├── tag-categories.test.ts
│   └── fetchers/ (予定)
├── integration/
│   └── api/
│       └── rate-limit.test.skip.ts
├── e2e/ (未実装)
└── manual-test-checklist.md
```

### Jest設定
```javascript
// jest.config.js
- 基本設定: Next.js用
- カバレッジ: 未設定

// jest.config.integration.js
- 統合テスト専用
- Redis必要
```

### テストコマンド
```bash
npm test              # ユニットテスト
npm run test:watch    # ウォッチモード
npm run test:coverage # カバレッジ
npm run test:integration # 統合テスト
npm run test:integration:docker # Docker環境
```

## デプロイメント

### 環境構成
```
開発環境 (Local)
├── Next.js: npm run dev
├── Database: SQLite (local file)
├── Redis: Docker or Local
└── Scheduler: PM2

本番環境 (Production)
├── Next.js: Vercel / 自社サーバー
├── Database: SQLite (persistent volume)
├── Redis: Redis Cloud / Self-hosted
└── Scheduler: PM2 on VPS
```

### 環境変数
```env
# Database
DATABASE_URL="file:./techtrend.db"

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_HOST="localhost"
REDIS_PORT="6379"

# AI APIs
GOOGLE_AI_API_KEY="..."
GEMINI_API_KEY="..."

# Application
NODE_ENV="production"
NEXT_PUBLIC_BASE_URL="https://techtrend.example.com"
```

### PM2設定 (ecosystem.config.js)
```javascript
{
  apps: [{
    name: 'techtrend-scheduler',
    script: './scheduler-v2.ts',
    interpreter: 'npx',
    interpreter_args: 'tsx',
    env: {
      NODE_ENV: 'production'
    },
    cron_restart: '0 0 * * *',
    max_memory_restart: '500M'
  }]
}
```

### デプロイフロー
```
1. コード変更
   ├── Feature branch作成
   ├── 開発・テスト
   └── PR作成

2. レビュー
   ├── コードレビュー
   ├── 自動テスト実行
   └── マージ to main

3. デプロイ
   ├── Vercel: 自動デプロイ
   ├── VPS: 手動デプロイ
   └── PM2: restart

4. 検証
   ├── ヘルスチェック
   ├── 機能テスト
   └── モニタリング確認
```

## Docker構成

### docker-compose.yml
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  # 開発用DB (オプション)
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: techtrend
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
```

### 開発環境セットアップ
```bash
# Dockerでインフラ起動
docker-compose up -d

# DB初期化
npx prisma migrate dev
npx prisma db seed

# 開発サーバー起動
npm run dev

# スケジューラー起動
npm run scheduler:start
```

## バックアップ戦略

### データベースバックアップ
```bash
# scripts/backup.sh
- 日次バックアップ
- 7日間保持
- S3アップロード（オプション）
```

### バックアップ対象
1. **SQLiteデータベース**: 全データ
2. **環境変数**: .env.backup
3. **ログファイル**: PM2ログ
4. **設定ファイル**: ecosystem.config.js

## モニタリング

### ヘルスチェック
```typescript
// /api/health
- DB接続確認
- Redis接続確認
- APIキー有効性
- ディスク容量
```

### アラート設定（予定）
```
エラー率 > 1% → Slack通知
応答時間 > 3秒 → 警告
Redis接続失敗 → 緊急アラート
スケジューラー停止 → 自動再起動
```

### ログ管理
```
PM2ログ
├── ~/.pm2/logs/techtrend-scheduler-out.log
└── ~/.pm2/logs/techtrend-scheduler-error.log

アプリケーションログ
├── 標準出力 → Vercelログ
└── エラー → Sentryへ送信（予定）
```

## トラブルシューティング

### よくある問題

#### 1. Redis接続エラー
```bash
# 確認
redis-cli ping

# 解決
docker-compose restart redis
```

#### 2. スケジューラー停止
```bash
# 状態確認
pm2 status

# 再起動
pm2 restart techtrend-scheduler

# ログ確認
pm2 logs techtrend-scheduler
```

#### 3. Gemini API Rate Limit
```javascript
// 対策
- リトライ間隔延長
- 並列数削減
- キャッシュ活用
```

#### 4. データベースロック
```bash
# SQLiteロック解除
rm techtrend.db-journal
```

## セキュリティ考慮事項

### 実装済み
- 環境変数でシークレット管理
- Prismaでクエリサニタイゼーション
- CORS設定
- XSS対策（React自動エスケープ）

### 実装予定
- Rate Limiting
- API認証（管理機能）
- WAF導入
- セキュリティヘッダー強化
- 依存関係の定期更新

## パフォーマンス目標

### 目標メトリクス
- **TTFB**: < 200ms
- **FCP**: < 1.5s
- **LCP**: < 2.5s
- **CLS**: < 0.1
- **キャッシュヒット率**: > 80%

### 最適化施策
1. **画像最適化**: WebP変換、lazy loading
2. **コード分割**: dynamic imports
3. **プリフェッチ**: 重要リソース
4. **CDN活用**: 静的アセット配信

## 今後の改善計画

### Phase 1 (短期)
- E2Eテスト実装
- CI/CDパイプライン構築
- エラー監視強化

### Phase 2 (中期)
- Kubernetes移行検討
- マイクロサービス化
- GraphQL API追加

### Phase 3 (長期)
- マルチリージョン対応
- リアルタイム更新（WebSocket）
- 機械学習による記事推薦