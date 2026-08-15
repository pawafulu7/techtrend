# システム全体構成

TechTrend の本番構成（01-A）と、ローカル開発・CI 専用の構成（01-B）を分けて示す。凡例は [索引](./README.md#凡例全図共通) を参照。

## 01-A 本番構成

情報ソースから記事を収集し、GitHub Actions のスケジューラが要約・埋め込みを生成、Vercel 上の Next.js アプリがユーザーに配信するまでの全体像。

```mermaid
flowchart LR
    browser["ブラウザ"]

    subgraph src["情報ソース"]
        src_rss["RSS フィード"]
        src_scrape["スクレイピング"]
        src_api["API 提供ソース<br/>Qiita 等"]
    end

    subgraph gha["GitHub Actions"]
        gha_sched["スケジューラ<br/>12 本"]
        gha_ci["CI<br/>ci.yml / CodeQL / AI regression / Lighthouse / tag-quality"]
    end

    subgraph vercel["Vercel: Next.js 16.2 App Router"]
        proxy["proxy.ts<br/>Basic gate / CSRF / maintenance"]
        pages["RSC Pages"]
        api_routes["API Routes<br/>74"]
        better_auth["Better Auth"]
    end

    subgraph data["データ層"]
        pg[("PostgreSQL + pgvector<br/>Prisma 7")]
        redis[("Redis<br/>cache + rate limit")]
    end

    gemini(("Gemini"))
    openai(("OpenAI<br/>embeddings"))
    mail(("Resend / SMTP"))
    slack(("Slack Webhook"))
    oauth(("Google / GitHub<br/>OAuth"))
    newrelic(("New Relic"))

    src_rss --> gha_sched
    src_scrape --> gha_sched
    src_api --> gha_sched
    gha_sched --> pg
    gha_sched --> gemini
    gha_sched --> openai
    gha_sched -.-> slack

    browser --> proxy
    proxy --> pages
    proxy --> api_routes
    pages --> better_auth
    api_routes --> better_auth
    better_auth --> oauth
    better_auth --> pg
    pages --> pg
    pages --> redis
    api_routes --> pg
    api_routes --> redis
    api_routes --> mail
    vercel -.-> newrelic
```

### 読み方

| 図中のボックス | 実体 | 対応する env 変数 |
|----------------|------|-------------------|
| ブラウザ | エンドユーザーのクライアント | - |
| RSS フィード / スクレイピング / API 提供ソース | `Source` テーブル（2026-08-15 時点の dev DB で 76 件・全件 enabled）+ `lib/fetchers/` 各 fetcher | - |
| GitHub Actions スケジューラ 12 本 | `.github/workflows/scheduler-*.yml`（`npx tsx scripts/...` を本番 DB に対して直接実行、失敗時 Slack 通知） | `DATABASE_URL`, `SLACK_WEBHOOK_URL`, `GEMINI_API_KEY`, `OPENAI_API_KEY` |
| GitHub Actions CI | `ci.yml` / `codeql.yml` / `ai-regression-test.yml` / `lighthouse-ci.yml` / `tag-quality-check.yml` | - |
| proxy.ts | Next.js middleware（Basic 認証ゲート / CSRF / メンテナンスモード / 保護パスのセッションゲート） | `MAINTENANCE_MODE`, 署名 Cookie 用シークレット |
| RSC Pages | `app/` 配下の公開・認証必須・管理者ページ | - |
| API Routes | `app/api/` 配下 74 件の `route.ts` | - |
| Better Auth | `lib/auth/auth.ts`（email+password, admin プラグインで RBAC） | `AUTH_SECRET`（フォールバック `NEXTAUTH_SECRET`） |
| PostgreSQL + pgvector | Prisma 7（`prisma/schema.prisma`, 31 model）。マネージド。バージョン・提供元は注記参照 | `DATABASE_URL` |
| Redis | `lib/cache/`（LayeredCache: 用途別キャッシュ）+ `lib/rate-limiter.ts`（`getRedisClient()` 兼用） | `REDIS_URL` |
| Gemini | 要約・抽出（`lib/ai/`） | `GEMINI_API_KEY` |
| OpenAI embeddings | `text-embedding-3-small`（RAG, `lib/rag/`） | `OPENAI_API_KEY` |
| Resend / SMTP | メール送信（ダイジェスト等） | `RESEND_API_KEY`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_SECURE` |
| Slack Webhook | バッチ失敗通知 | `SLACK_WEBHOOK_URL` |
| Google / GitHub OAuth | Better Auth 経由のソーシャルログイン | `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` |
| New Relic | 本番 APM。Vercel Marketplace 統合で導入する（`README.md:191`「Phase 1.5: 本番環境（Vercel + New Relic）」、手順は `operations/monitoring-setup-phase2a.md`） | アプリ側が読むのは OTLP エクスポータ設定の `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` / `OTEL_SERVICE_NAME`（`instrumentation.ts`）。New Relic 固有の変数はコードから参照していない |

## 01-B ローカル開発・CI 環境

Docker Compose と PM2 はローカル開発・CI 用の構成。本番と同じ `scripts/` と `prisma/schema.prisma` を使う点が接続点になる（PM2 の位置づけについては注記を参照）。

```mermaid
flowchart LR
    subgraph local["ローカル開発・CI 環境（本番外）"]
        dc_dev["Docker Compose: dev<br/>postgres pgvector + redis"]
        dc_app["Docker Compose: app"]
        dc_test["Docker Compose: test"]
        dc_otel["Docker Compose: otel"]
        pm2["PM2 scheduler<br/>ecosystem.config.js<br/>scheduler.ts の node-cron"]
        otelc["OTel Collector"]
        subgraph mon["Docker Compose: monitoring"]
            grafana["Grafana"]
            loki["Loki"]
            tempo["Tempo"]
        end
    end

    prod_ref["本番構成<br/>01-A 参照"]

    dc_otel --> otelc
    otelc --> grafana
    otelc --> loki
    otelc --> tempo
    pm2 --> dc_dev
    dc_app --> dc_dev
    dc_test --> dc_dev
    dc_dev -. "同じ scripts/・同じ Prisma スキーマ" .-> prod_ref

    style local stroke-dasharray: 5 5
```

### 読み方

| 図中のボックス | 実体 | 対応する env 変数 |
|----------------|------|-------------------|
| Docker Compose: dev | `docker-compose.dev.yml`（postgres pgvector/pg17 + redis:7-alpine） | `DATABASE_URL`, `REDIS_URL`（ローカル値） |
| Docker Compose: app / test / monitoring / otel | 同名の docker-compose ファイル群 | - |
| PM2 scheduler | `ecosystem.config.js` / `ecosystem.local.config.js`。`scripts/scheduled/scheduler.ts` の node-cron オーケストレータ | - |
| OTel Collector | `docker-compose.otel.yml`。`instrumentation.ts` の OTLP HTTP エクスポート先（ローカル時） | - |
| Grafana / Loki / Tempo | `docker-compose.monitoring.yml`。全ポート `127.0.0.1` バインドでローカル専用 | - |
| 本番構成（01-A 参照） | 同じ `scripts/` ディレクトリと `prisma/schema.prisma` を本番 GitHub Actions が実行 | - |

## 注記

- **本番 PostgreSQL のバージョンと提供元は断定しない**。`pg17` と確認できるのはローカル用の `Dockerfile.postgres-pgvector`（`FROM pgvector/pgvector:pg17`、`docker-compose.dev.yml` が使用）だけで、本番の接続先バージョンはコードから取得していない [推測]。提供元についても、運用手順書 `docs/operations/rag-rollback-procedure.md` では Neon の操作（Snapshot 取得、`console.neon.tech`）を記載しているが、`docs/VERCEL_MIGRATION_SETUP.md` は Prisma Postgres（db.prisma.io）、`README.md` は Supabase と記述が混在しており、現行の提供元はコードからは確定できない [推測]。GitHub Actions は `secrets.DATABASE_URL` のみを参照しており、接続先そのものはワークフロー定義から特定できない
- **Upstash は図に載せていない**。`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` は `lib/config/env.ts:123-125` にスキーマ定義があるだけで、この env を読むコードは存在しない。レート制限の実体は `lib/rate-limiter.ts` で、`REDIS_URL` の ioredis クライアント（未設定時はメモリ）を使う。したがってキャッシュとレート制限は同じ Redis 1 ノードを共有している。なお `app/api/rag/*/route.ts` のコメントには「Upstash Redis」という旧記述が残っている（実装とは無関係）
- **PM2 はローカル開発用と位置づけられているが、定義としては本番相当のバッチを持っている**。`scripts/scheduled/scheduler.ts:637` には「本番は GHA 側で実行」という注記がある一方、`ecosystem.config.js` には `techtrend-embedding-worker`（`cron_restart: */30`）など GHA と同間隔のバッチ app が定義されている。実際にどちらが動いているかは運用側の起動状態しだいで、コードからは判定できない [推測]。詳細は [02-batch-pipeline.md](./02-batch-pipeline.md#注記) を参照
- Source 76 件は 2026-08-15 時点の **dev DB** の値（本番の件数は未確認）。取得コマンド: `docker exec techtrend-postgres psql -U postgres -d techtrend_dev -c 'SELECT COUNT(*), COUNT(*) FILTER (WHERE enabled) FROM "Source";'`
- API routes 74 件の取得コマンド: `find app/api -name route.ts | wc -l`
- GitHub Actions スケジューラ 12 本の取得コマンド: `ls .github/workflows/scheduler-*.yml | wc -l`

---
2026-08-15 時点のコードをもとに作成。更新ルールは [索引](./README.md) を参照。
