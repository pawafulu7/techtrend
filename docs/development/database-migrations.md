# データベースのマイグレーション

スキーマは Prisma のマイグレーション（`prisma/migrations/`）で管理する。

## 守ること

1. **既存のマイグレーションファイルは編集しない。** 本番に適用済みの可能性があるため、一度作ったファイルは不変として扱う
2. **直すときも新しいマイグレーションを作る。** インデックスの追加漏れ・型の変更・`DROP INDEX` の失敗（→ `DROP INDEX IF EXISTS`）など、修正はすべて新しいファイルで行う
3. **開発環境では `migrate dev`、本番では `migrate deploy` だけを使う。** `db push` は履歴が残らずデータを失うおそれがあるので本番では使わない
4. **`prisma/migrations/` は必ず commit する**

`CREATE INDEX CONCURRENTLY` はマイグレーションに直接書ける（Prisma 7.4.0 以降は文ごとに実行されるため、トランザクションの制約を受けない）。

## 手順

### 初回のセットアップ

```bash
docker compose -f docker-compose.dev.yml up -d   # 開発用の DB（初期化 SQL は scripts/docker/init-dev.sql）
npx prisma migrate dev
```

### スキーマを変える

```bash
# 1. prisma/schema.prisma を編集する
# 2. マイグレーションを作る
npx prisma migrate dev --name add_user_profile_fields
# 3. prisma/ を commit する
```

### 本番に適用する

本番には Vercel のデプロイ時に `vercel-build`（`prisma generate && prisma migrate deploy && next build --webpack`）が自動で適用する。手で確かめる・適用するときは次を使う（接続先は `.env.local` の `PROD_DATABASE_URL`。接続先が出ないよう、決まった形の行と成否だけを表示する）。

```bash
npm run migrate:production:check   # 適用状況の確認（prisma migrate status）
npm run migrate:production         # 未適用のマイグレーションを適用（scripts/db/deploy-migrations.sh）
```

## うまくいかないとき

```bash
npx prisma migrate status   # 状態を確認する
npx prisma migrate reset    # 開発環境だけ。DB を作り直す
```

本番でマイグレーションが失敗したら、既存ファイルを直さずに、失敗の内容を打ち消す新しいマイグレーションを作る。

## チェックリスト

- [ ] スキーマの変更は `prisma/schema.prisma` で行った
- [ ] `npx prisma migrate dev` で新しいマイグレーションを作った
- [ ] 既存のマイグレーションファイルを編集していない
- [ ] テスト用の DB で適用を確かめた（`npm run test:db:migrate`）
- [ ] 本番のデータへの影響（ロック・件数）を確かめた

## 参考

- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate)
- [Migration troubleshooting](https://www.prisma.io/docs/orm/prisma-migrate/workflows/troubleshooting)
