# 本番のデプロイ

本番は Vercel で動かす。main への push を Vercel が検知してビルドし、デプロイする。

## ビルドとマイグレーション

Vercel のビルドコマンドは `npm run vercel-build`（Settings → General → Build & Output Settings）。

```json
"vercel-build": "prisma generate && prisma migrate deploy && next build --webpack"
```

ビルドの途中で `prisma migrate deploy` が未適用のマイグレーションを本番の DB に適用する。マイグレーションの作り方は [database-migrations.md](../development/database-migrations.md)。

1. `npx prisma migrate dev --name <変更内容>` でマイグレーションを作り、`prisma/migrations/` を commit する
2. PR を main に merge する
3. Vercel のビルドで適用される（デプロイのログの Building で確かめられる）

## 本番に必要な環境変数

Vercel の Settings → Environment Variables（Production）に設定する。値はコードやドキュメントに書かない。一覧と既定値は `lib/config/env.ts` の検証が正本で、足りないとサーバーが起動時に失敗する。

| 変数 | 用途 | 設定しないと |
|------|------|------------|
| `DATABASE_URL` | PostgreSQL の接続先 | DB に接続できない |
| `AUTH_SECRET`（または `NEXTAUTH_SECRET`） | 認証のセッションの署名 | 環境変数の検証で起動に失敗する |
| `CURSOR_SECRET` | 記事一覧のページ送りのトークン（カーソル）の HMAC 署名 | 本番では `CURSOR_SECRET is required in production` で記事一覧（`/api/articles/list` など）が動かない |
| `CRON_TOKEN`（旧名 `CRON_SECRET`） | 定期実行のジョブから API を呼ぶときの認証（`lib/auth/cron-secret.ts`） | 定期実行の API 呼び出しが 401 になる |

秘密の値は次のどちらかで作る。

```bash
openssl rand -hex 32
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

設定済みの変数は `vercel env ls` で確かめる（値は表示されない）。`vercel env pull` は `.env.local` を本番の値で上書きするので、手元の設定を消さないよう注意する。

## うまくいかないとき

### マイグレーションが適用されない

1. `DATABASE_URL` が Production の環境に設定されているか
2. ビルドコマンドが `npm run vercel-build` になっているか
3. デプロイのログ（Deployments → 該当のデプロイ → Building）のエラー

### `relation already exists` で失敗する

テーブルが手で作られていて、マイグレーションの履歴と食い違っている。中身が一致していることを確かめてから、適用済みとして記録する。

```bash
bash scripts/db/with-prod-db.sh --as-database-url npx prisma migrate resolve --applied <migration_name>
```

### デプロイを戻す

Vercel の Deployments から成功した過去のデプロイを選んで Promote to Production する（`vercel rollback` でもよい）。マイグレーションは戻らないので、スキーマを戻すときは打ち消すマイグレーションを新しく作る。

## 注意

- プレビューのデプロイは本番の DB を共有しない
- `DROP`・`DELETE`・`TRUNCATE` を含むマイグレーションは、事前にバックアップを取ってから適用する
