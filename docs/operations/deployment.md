# 本番のデプロイ

本番は Vercel で動かす。main への push を Vercel が検知してビルドし、デプロイする。

## ビルドとマイグレーション

Vercel のビルドコマンドは `npm run vercel-build`（Settings → General → Build & Output Settings）。

```json
"vercel-build": "prisma generate && USE_MIGRATION_DATABASE_URL=1 prisma migrate deploy && next build --webpack"
```

ビルドの途中で `prisma migrate deploy` が未適用のマイグレーションを本番の DB に適用する。マイグレーションの作り方は [database-migrations.md](../development/database-migrations.md)。

マイグレーションは管理者のロール（`MIGRATION_DATABASE_URL`）で流し、アプリは表の読み書きだけのロール（`DATABASE_URL`）で動く。`prisma.config.ts` が、`USE_MIGRATION_DATABASE_URL=1` を付けた本番のビルドの `prisma migrate deploy` でだけ `MIGRATION_DATABASE_URL` を使う（`scripts/db/migration-database-url.ts`。無ければ DB に繋ぐ前に止まる）。`MIGRATION_DATABASE_URL` は、Neon の接続プール（`-pooler`）を通さない直接の接続にする（Prisma のマイグレーションはセッション単位の advisory lock で排他するため）。

1. `npx prisma migrate dev --create-only --name <変更内容>` でマイグレーションを作る（`--create-only` を付けないと、GRANT を書き足す前に開発の DB に適用される）。表を足したら `scripts/db/prod-table-access.json` にも入れ、`content` の表ならできた `migration.sql` に手元用の GRANT を書き足す（「DB のロール」の節）。`npx prisma migrate dev` で開発の DB に適用してから、`prisma/migrations/` を commit する
2. PR を main に merge する
3. Vercel のビルドで適用される（デプロイのログの Building で確かめられる）

## 本番に必要な環境変数

Vercel の Settings → Environment Variables（Production）に設定する。値はコードやドキュメントに書かない。一覧と既定値は `lib/config/env.ts` の検証が正本で、足りないとサーバーが起動時に失敗する。

| 変数 | 用途 | 設定しないと |
|------|------|------------|
| `DATABASE_URL` | PostgreSQL の接続先（アプリ用のロール。Production だけ・Secret） | DB に接続できない |
| `MIGRATION_DATABASE_URL` | マイグレーションを流す管理者のロールの接続先（Production だけ・Secret） | ビルドが DB に繋ぐ前に止まる |
| `AUTH_SECRET`（または `NEXTAUTH_SECRET`） | 認証のセッションの署名 | 環境変数の検証で起動に失敗する |
| `CURSOR_SECRET` | 記事一覧のページ送りのトークン（カーソル）の HMAC 署名 | 本番では `CURSOR_SECRET is required in production` で記事一覧（`/api/articles/list` など）が動かない |

秘密の値は次のどちらかで作る。

```bash
openssl rand -hex 32
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

設定済みの変数は `vercel env ls` で確かめる（値は表示されない）。DB の接続情報は Development・Preview に置かないので、`vercel env pull` で手元に本番の DB の接続情報が入ることはない。

## うまくいかないとき

### マイグレーションが適用されない

1. `MIGRATION_DATABASE_URL` が Production の環境に設定されているか（無いとビルドが `MIGRATION_DATABASE_URL is required` で、DB に繋ぐ前に止まる）
2. ビルドコマンドが `npm run vercel-build` になっているか
3. デプロイのログ（Deployments → 該当のデプロイ → Building）のエラー

手元には管理者の接続情報を置かないので、マイグレーションの記録を直すときは Neon のコンソールの SQL Editor（管理者で動く）で SQL を流す。適用状況は手元から `npm run migrate:production:check` で確かめられる（読み取り用のロールで動く。`prisma migrate status` は読み取り用のロールでは権限で止まる）。

### 失敗したマイグレーションが残っている（P3009）

既存のマイグレーションのファイルは直さない（ほかの環境では成功していて、中身が食い違うため）。原因によって、次のどちらかにする。

- 本番のデータが原因（制約に合わない行があるなど）: SQL Editor でデータを直し、途中まで確定した変更（先に作られた表や列など）があれば取り消す。残ったまま再デプロイすると、同じ変更が `relation already exists` などで再び失敗する。そのうえで、下の SQL（`prisma migrate resolve --rolled-back` と同じ）で失敗の記録を取り消し済みにし、同じマイグレーションを再デプロイする
- マイグレーションの SQL が原因: 意図した変更を SQL Editor で済ませてから、次の節の手順で適用済みとして記録し、直しは新しいマイグレーションで行う

```sql
UPDATE "_prisma_migrations" SET rolled_back_at = now()
WHERE migration_name = '<migration_name>' AND finished_at IS NULL AND rolled_back_at IS NULL;
```

### `relation already exists` で失敗する

テーブルが手で作られていて、マイグレーションの履歴と食い違っている。中身が一致していることを確かめてから、`prisma migrate resolve --applied` と同じく、適用済みとして記録する。

```sql
BEGIN;
-- 失敗したまま残っている記録は、取り消し済み（rolled back）にする
UPDATE "_prisma_migrations" SET rolled_back_at = now()
WHERE migration_name = '<migration_name>' AND finished_at IS NULL AND rolled_back_at IS NULL;
-- 適用済みの記録を足す
INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '<checksum>', '<migration_name>', now(), now(), 0);
COMMIT;
```

`<checksum>` は `prisma/migrations/<migration_name>/migration.sql` の SHA-256。`sha256sum prisma/migrations/<migration_name>/migration.sql` の出力の先頭の 64 文字（後ろのファイル名は入れない）。

### デプロイを戻す

Vercel の Deployments から成功した過去のデプロイを選んで Promote to Production する（`vercel rollback` でもよい）。マイグレーションは戻らないので、スキーマを戻すときは打ち消すマイグレーションを新しく作る。

戻したデプロイは、そのデプロイを作ったときの環境変数で動く。DB のパスワードを変えたり、ロールを差し替えたりした後は、それより前のデプロイに戻すと DB に繋がらない。戻す先は、差し替えた後に作ったデプロイから選ぶ。

## DB のロール

本番の DB は、用途ごとにロールを分けている。ログインのロールの名前は接続先の情報なので、リポジトリには書かない（作り方は `scripts/db/create-prod-roles.ts`）。

| ロール | 使う場所 | できること |
|------|------|------|
| 管理者（DB と表の所有者） | Vercel の Production の `MIGRATION_DATABASE_URL`、Neon のコンソール | すべて（マイグレーション・ロールの管理） |
| アプリ用 | Vercel の Production の `DATABASE_URL`、GitHub Actions の secret `DATABASE_URL` | 表の読み書きだけ。表の作成・変更・削除、ロールの作成、マイグレーションの記録の読み書きはできない |
| 手元用（読み取り用） | `.env.local` の `PROD_DATABASE_URL` | グループのロール `techtrend_readonly`（ログインできない）のメンバー。`scripts/db/prod-table-access.json` の `content` の表と、マイグレーションの記録の状態の列（失敗のログ以外）を読むだけ。`personal`（個人情報）の表は読めない。書き込めない既定で、文とトランザクションの時間の上限は既定で 60 秒（自分で変えられるので、守りではなく、うっかり長く止めないための既定） |

アプリ用ロールは、管理者が作った表を既定の権限で読み書きできる（マイグレーションは必ず管理者で流す。ほかのロールで作った表には既定の権限が効かない）。`ops_backup` などの public 以外のスキーマは、アプリ用も読み取り用も読めない。そこから戻すときは SQL Editor で行う。

### 手元用の権限はマイグレーションで付け外しする

`techtrend_readonly` の権限は、マイグレーションでだけ付け外しする（作ったのは `prisma/migrations/20261127000000_add_readonly_content_role`）。マイグレーションは Prisma が順に 1 回だけ流すので、古い commit を再デプロイしても権限は戻らない。

- 表を足すとき: `scripts/db/prod-table-access.json` の `personal`（個人情報を持つ表）か `content`（それ以外）に入れる。`content` なら、その表を作るマイグレーションに `GRANT SELECT ON TABLE "<表>" TO techtrend_readonly;` を書く（`autoincrement()` などでシーケンスもできるなら、`GRANT SELECT ON SEQUENCE "<シーケンス>" TO techtrend_readonly;` も書く。本番からの同期の pg_dump がシーケンスの値を読むため）。`personal` なら何も書かない（読み取り用には既定の権限が無いので、読めない）
- 表を `personal` に移すとき: 一覧を直し、`REVOKE ALL ON TABLE "<表>" FROM techtrend_readonly;` のマイグレーションを書く
- 書き忘れ・書き違いは、マイグレーション済みのテスト DB で `__tests__/scripts/db/prod-table-access.db.test.ts` が落とす
- 本番の実際の権限（マイグレーションの外で付いた GRANT などを含む）は、手元から `npm run migrate:production:check` で確かめる。繋いだ手元用のロール自身を調べ、一覧と違えば `readonly_privileges_ok=false` で終了コード 1 になる

本番に書き込む作業（保守スクリプト・データの直し）は、GitHub Actions の `Maintenance - Run Script`（`.github/workflows/maintenance-run.yml`）を main から手動で実行する。アプリ用のロールで動くので、表を作るスクリプトは流せない（表を作るならマイグレーションにする）。ログは公開されるので、出力は `名前=数値` の行だけが出る。スクリプトは結果と失敗の件数をその形で出し、失敗したら 0 以外で終える。引数には個人情報や秘密を入れない。

### 受け入れている危険

- 管理者の接続情報（`MIGRATION_DATABASE_URL`）は、ビルドだけでなく、本番の関数の実行中にも環境変数として読める（Vercel の環境変数をビルドだけに限る設定は無い）。SQL インジェクションのようにアプリの DB の接続を悪用される場合はアプリ用ロールの権限に収まる。一方、関数の中で任意のコードを実行されると管理者の接続情報も取られ、裏口のロールの作成や表の構造の破壊までできる。その疑いがあるときは、管理者のパスワードを変え、`pg_roles` に知らないロールが無いかを確かめる
- Neon は SQL で作るロールのパスワードを平文で受け取る（ハッシュは受け付けない）。`CREATE ROLE` が失敗すると、文がパスワードごとサーバーのログに残りうる

### ロールを作り直す・パスワードを変える

ロールは、マイグレーションを流した後の DB で作る（手元用は、マイグレーションで作る `techtrend_readonly` のメンバーにするため）。

1. Neon のコンソールで管理者の接続文字列を表示し、手元の端末で、画面に出さずに環境変数へ入れてから流す。`.env.local` の `PROD_DATABASE_URL` は読み取り用なので、管理者の URL は `PROD_ADMIN_DATABASE_URL` で渡す。サブシェルで流すので、終わると変数は消え、終了コードはスクリプトのものになる（0 以外なら先に進まない）

   ```bash
   ( read -rs PROD_ADMIN_DATABASE_URL && export PROD_ADMIN_DATABASE_URL && bash scripts/db/with-prod-db.sh npx tsx scripts/db/create-prod-roles.ts )
   ```

2. `.workflow/tmp/prod-db/new-roles.env` の値を、Vercel の `DATABASE_URL`、GitHub の secret `DATABASE_URL`、`.env.local` の `PROD_DATABASE_URL` に入れ、本番を再デプロイする。入れ終えたら、このファイルを消す（書き込めるアプリ用の接続情報を手元に残さない）
3. 古いロールを、Neon のコンソールの SQL Editor で消す。権限と既定の権限が残っていると `DROP ROLE` が失敗する（`2BP01`）ので、先に外す

   ```sql
   -- アプリ用
   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM <old_role>;
   REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM <old_role>;
   REVOKE ALL ON SCHEMA public FROM <old_role>;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM <old_role>;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM <old_role>;
   REVOKE CONNECT ON DATABASE <database> FROM <old_role>;
   DROP ROLE <old_role>;
   -- 手元用（以前の版で作り、表の権限を直接持つロールも、これで消せる）
   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM <old_role>;
   REVOKE ALL ON SCHEMA public FROM <old_role>;
   REVOKE techtrend_readonly FROM <old_role>;
   REVOKE CONNECT ON DATABASE <database> FROM <old_role>;
   DROP ROLE <old_role>;
   ```

### 以前の版で作った手元用のロールを移す

以前の版の `create-prod-roles.ts` で作った手元用のロールは、表の権限を直接持ち、`techtrend_readonly` のメンバーではない。このままだと、マイグレーションでの付け外しが届かない（表を `personal` に移しても読めたまま残る）。`techtrend_readonly` を作るマイグレーションが本番に適用された後、SQL Editor で、直接の権限を外してメンバーにする（表への `REVOKE ALL` は列の権限も外す）。

```sql
BEGIN;
GRANT techtrend_readonly TO <readonly_role>;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM <readonly_role>;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM <readonly_role>;
REVOKE ALL ON SCHEMA public FROM <readonly_role>;
COMMIT;
```

そのあと、そのロールで `npm run migrate:production:check` を流し、`readonly_privileges_ok=true` になることを確かめる。

管理者のパスワードは、SQL Editor の `ALTER ROLE <admin_role> WITH PASSWORD '<new_password>'`（60 ビット以上のエントロピー）か、コンソールの Reset password で変え、Vercel の `MIGRATION_DATABASE_URL` を差し替える。

## 注意

- プレビューのデプロイは本番の DB を共有しない（DB の接続情報は Production にだけ置く。Preview のビルドは Ignored Build Step で止めている）
- `DROP`・`DELETE`・`TRUNCATE` を含むマイグレーションは、事前にバックアップを取ってから適用する
