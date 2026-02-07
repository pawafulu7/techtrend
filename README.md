# TechTrend

技術記事アグリゲーター / Tech Article Aggregator

## 概要

複数の技術情報源から記事を自動収集し、AI要約を生成する個人プロジェクトです。

## 技術スタック

- **Frontend**: Next.js 15, React 18, TypeScript
- **Backend**: Next.js API Routes, Prisma
- **Database**: PostgreSQL
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS
- **Cache**: Redis

## 環境変数設定

### クイックスタート

```bash
# 1. .env.exampleをコピー
cp .env.example .env

# 2. 必須項目を設定
# - NEXTAUTH_SECRET（32文字以上のランダム文字列）
# - DATABASE_URL（PostgreSQL接続URL）
# - GEMINI_API_KEY（AI要約生成用）
```

### 必須環境変数

| 変数名 | 説明 | 生成方法 | セキュリティ |
|--------|------|---------|-------------|
| `NEXTAUTH_SECRET` | NextAuth認証シークレット | `openssl rand -base64 32` | 🔴 必須・最小32文字 |
| `DATABASE_URL` | PostgreSQL接続URL | Vercel/Supabaseから取得 | 🔴 必須 |
| `GEMINI_API_KEY` | Google Gemini APIキー | [AI Studio](https://ai.google.dev/) | 🔴 要約生成に必須 |
| `CURSOR_SECRET` | ページネーション暗号化キー | `openssl rand -hex 32` | 🔴 本番環境で必須 |

### 推奨環境変数（本番環境）

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `REDIS_URL` | Redis接続URL（キャッシュ） | なし（キャッシュ無効） |
| `EMAIL_FROM` | メール送信元アドレス | - |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Gmail経由のメール送信 | - |

### オプション環境変数

詳細は `.env.example` を参照してください。

- OAuth設定（Google/GitHubログイン）
- 機能フラグ（ENABLE_AUTH, ENABLE_CACHE等）
- ログレベル設定
- 品質チェック設定

### セキュリティベストプラクティス

#### ✅ 必ず実施

- **シークレットキーの変更**: 全ての`replace-with-*`を実際の値に置き換え
- **強力なパスワード**: 最低16文字、大小英数字+記号を含む
- **環境分離**: 開発環境と本番環境で異なるシークレットを使用
- **.envの保護**: `.gitignore`に含まれていることを確認

#### ⚠️ 禁止事項

- .envファイルをGitにコミット
- シークレットをログに出力
- 開発環境のシークレットを本番で使用
- デフォルト値のまま本番環境にデプロイ

### トラブルシューティング

#### 問題: 「CURSOR_SECRET is required in production」エラー

**解決方法**:
```bash
# シークレットキーを生成
openssl rand -hex 32

# .envに追加
CURSOR_SECRET=生成された64文字の文字列
```

#### 問題: Redisに接続できない

**確認事項**:
- `REDIS_URL`が正しく設定されているか
- Redisサーバーが起動しているか（`docker ps`で確認）
- 接続文字列のフォーマットが正しいか

#### 問題: データベースマイグレーションエラー

**解決方法**:
```bash
# マイグレーション状態確認
npx prisma migrate status

# マイグレーション実行
npx prisma migrate deploy
```

詳細な環境変数の説明は [.env.example](./.env.example) を参照してください。

## Development Server

### Turbopack (Default)

```bash
# Turbopack enabled (faster HMR, quicker startup)
npm run dev
```

### Webpack (Fallback)

```bash
# Use webpack if Turbopack has issues
npm run dev:webpack
```

### Performance Measurement

```bash
# Compare Turbopack vs Webpack startup times
npx tsx scripts/performance/measure-dev-startup.ts

# Measure specific mode only
npx tsx scripts/performance/measure-dev-startup.ts --turbopack-only
npx tsx scripts/performance/measure-dev-startup.ts --webpack-only

# Custom number of runs (default: 3)
npx tsx scripts/performance/measure-dev-startup.ts --runs=5
```

### Known Limitations

- `@next/bundle-analyzer` does not work with Turbopack
  - Use `npm run analyze` (uses webpack) for bundle analysis
- Some webpack-specific plugins may not be supported
- If you encounter issues, fallback to webpack: `npm run dev:webpack`

## OpenTelemetry統合

### Phase 1: CLI確認（最小構成）

```bash
# Collector起動
npm run otel:dev

# トレースログ確認
npm run otel:logs

# 停止
npm run otel:down
```

### Phase 2: Grafana UI（基本監視）

#### 起動

```bash
# 監視スタック起動（Loki + Tempo + Grafana + Collector）
npm run monitoring:up

# すべてのログ確認
npm run monitoring:logs

# 停止
npm run monitoring:down
```

#### Grafana UIアクセス

1. **URL**: http://localhost:3002
2. **ログイン**:
   - Username: `admin`
   - Password: `admin`（初回ログイン時に変更必須）
3. **データソース確認**: "Connections" → "Data sources" → Tempo/Loki
4. **トレース検索**: "Explore" → "Tempo" → Service = `techtrend-dev`
5. **ログ検索**: "Explore" → "Loki" → `{service_name="techtrend-dev"}`
6. **ダッシュボード**: "Dashboards" → "Observability" → "TechTrend Observability"

### Phase 1.5: 本番環境（Vercel + New Relic）

#### セットアップ（初回のみ、約20分）

**前提条件**: Phase 1 & 2完了、Vercelプロジェクト作成済み

**手順**:
1. New Relicアカウント作成: https://newrelic.com/signup
2. License Key発行: New Relic → API Keys
3. Vercel Marketplace統合: https://vercel.com/integrations/newrelic
4. GitHubプッシュ（自動デプロイ）
5. New Relicでトレース確認: https://one.newrelic.com

**詳細**: 本番環境セットアップガイドおよびチェックリストは`.claude/docs/`配下（gitignore、ローカル参照）

#### New Relicダッシュボード

- APM & Services → `techtrend-web`
- Distributed tracing: トレース検索
- Logs: ログ検索（console.log移行後）
- Alerts: エラー率、レスポンスタイム監視

詳細は [CLAUDE.md](./CLAUDE.md) を参照してください。

## ⚠️ 重要なお知らせ

**このプロジェクトは個人の学習・実験用プロジェクトです。**

- 🚫 **Pull Requestは受け付けていません**
- 🚫 **Issueへの対応は行いません**
- 🚫 **フォークは自由ですが、サポートは提供しません**

*This is a personal learning project. Not accepting contributions.*

