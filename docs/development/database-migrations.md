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

本番には Vercel のデプロイ時に `vercel-build` が自動で適用する（管理者のロールの `MIGRATION_DATABASE_URL` で流す。[deployment.md](../operations/deployment.md)）。手元には管理者の接続情報を置かないので、手元から適用はできない。適用状況は次で確かめる（接続先は `.env.local` の `PROD_DATABASE_URL` の読み取り用のロール。接続先が出ないよう、決まった形の行と成否だけを表示する）。

```bash
npm run migrate:production:check   # 適用状況の確認（scripts/db/check-prod-migrations.ts。読み取り用のロールでは prisma migrate status が権限で止まるため）
```

表を足すときは、`scripts/db/prod-table-access.json` の `personal`（個人情報を持つ表）か `content`（それ以外）に表の名前を入れる。`content` の表は、その表を作るマイグレーションに次の 1 行を書く（手元の読み取り用のロールで読めるようになり、本番からの同期（`npm run db:sync:prod`）でも持ってくる）。`personal` の表は何も書かない（読み取り用のロールは読めない）。

```sql
GRANT SELECT ON TABLE "<表>" TO techtrend_readonly;
```

表を `personal` に移すときは、一覧を直し、`REVOKE ALL ON TABLE "<表>" FROM techtrend_readonly;` のマイグレーションを書く。どちらかを忘れると、テスト（`__tests__/scripts/db/prod-table-access.db.test.ts`）が落ちる。詳しくは [deployment.md](../operations/deployment.md) の「DB のロール」。

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
