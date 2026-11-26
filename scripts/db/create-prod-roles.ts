/**
 * 本番 DB に、アプリ用（表の読み書きだけ）と手元用（記事系の表の読み取りだけ）のログインロールを作る。
 * 管理者（DB と表の所有者）の接続で流す。パスワードを変えるときも、これで新しいロールを作って差し替え、古いロールを消す
 * （docs/operations/deployment.md の「DB のロール」）。
 *
 *   bash scripts/db/with-prod-db.sh npx tsx scripts/db/create-prod-roles.ts
 *
 * 管理者の接続 URL は PROD_ADMIN_DATABASE_URL から読み、無ければ PROD_DATABASE_URL を使う（切り替えた後の手元の
 * PROD_DATABASE_URL は読み取り用なので、そのときは PROD_ADMIN_DATABASE_URL を一時的に渡す）。
 * ロールの名前とパスワードは乱数で作り、接続 URL を .workflow/tmp/prod-db/new-roles.env（権限 600。既にあれば止まる）に書く。
 * 値を Vercel・GitHub・.env.local に入れ終えたら、このファイルは消す（書き込めるアプリ用の接続情報を手元に残さないため）。
 * 画面には `名前=値` の行だけを出す（with-prod-db.sh がそれ以外を通さない）。作った後、それぞれのロールで繋いで権限を確かめる
 */
import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildRoleUrl,
  createProdRoles,
  createScriptClient,
  errorReason,
  generateRoleName,
  generateRolePassword,
  loadTableAccess,
  setLocalTimeouts,
} from './prod-db-roles';

const OUTPUT =
  process.env.PROD_ROLES_OUTPUT ??
  path.join(process.cwd(), '.workflow/tmp/prod-db/new-roles.env');

/** 確かめる項目の名前と、期待する値（文字列） */
type Expectation = Record<string, string>;

/** url のロールで繋いで、name・value の行を出し、期待と比べる */
async function checkAs(
  url: string,
  sql: string,
  values: unknown[],
  expected: Expectation
): Promise<boolean> {
  const client = createScriptClient(url);
  try {
    await client.connect();
    const { rows } = await client.query<{ name: string; value: string }>(sql, values);
    for (const { name, value } of rows) console.log(`${name}=${value}`);
    return Object.entries(expected).every(([name, value]) =>
      rows.some((r) => r.name === name && r.value === value)
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const adminUrl = process.env.PROD_ADMIN_DATABASE_URL ?? process.env.PROD_DATABASE_URL;
  if (!adminUrl) {
    console.log('failure_reason_admin_url_missing=true');
    process.exitCode = 2;
    return;
  }

  const access = loadTableAccess();
  const appRole = generateRoleName('app');
  const readonlyRole = generateRoleName('readonly');
  const appPassword = generateRolePassword();
  const readonlyPassword = generateRolePassword();
  const appUrl = buildRoleUrl(adminUrl, appRole, appPassword);
  const readonlyUrl = buildRoleUrl(adminUrl, readonlyRole, readonlyPassword);

  // 先に書き出す（ロールを作った後に書けないと、パスワードを失う）。作らずに終わったら消す。
  // 既にあるファイル（前の実行の控え）は消さないよう、排他で作ってから書き、書けなかったら今回作ったファイルだけを消す
  mkdirSync(path.dirname(OUTPUT), { recursive: true, mode: 0o700 });
  let fd: number;
  try {
    fd = openSync(OUTPUT, 'wx', 0o600);
  } catch (error) {
    const exists = (error as { code?: unknown }).code === 'EEXIST';
    console.log(`failure_reason_${exists ? 'output_exists' : errorReason(error)}=true`);
    process.exitCode = 1;
    return;
  }
  try {
    writeFileSync(
      fd,
      [
        `PROD_APP_ROLE=${appRole}`,
        `PROD_APP_DATABASE_URL=${appUrl}`,
        `PROD_READONLY_ROLE=${readonlyRole}`,
        `PROD_READONLY_DATABASE_URL=${readonlyUrl}`,
        '',
      ].join('\n')
    );
  } catch (error) {
    closeSync(fd);
    unlinkSync(OUTPUT);
    console.log(`failure_reason_${errorReason(error)}=true`);
    process.exitCode = 1;
    return;
  }
  closeSync(fd);

  const admin = createScriptClient(adminUrl);
  let commitSent = false;
  try {
    await admin.connect();
    await admin.query('BEGIN');
    await setLocalTimeouts(admin);
    const result = await createProdRoles(admin, {
      appRole,
      appPassword,
      readonlyRole,
      readonlyPassword,
      access,
    });
    commitSent = true;
    await admin.query('COMMIT');
    console.log('created_roles=2');
    console.log(`app_writable_tables=${result.appTables}`);
    console.log(`readonly_readable_tables=${result.readonly.granted}`);
    console.log(`readonly_missing_tables=${result.readonly.missing}`);
    console.log(`unclassified_tables=${result.readonly.unclassified}`);
  } catch (error) {
    if (commitSent) {
      // COMMIT の結果が分からない。ロールができているかもしれないので、パスワードの控えを残す
      console.log('commit_result_unknown=true');
    } else {
      await admin.query('ROLLBACK').catch(() => undefined);
      unlinkSync(OUTPUT);
    }
    console.log(`failure_reason_${errorReason(error)}=true`);
    process.exitCode = 1;
    return;
  } finally {
    await admin.end().catch(() => undefined);
  }

  // 作ったロールで繋いで、権限を確かめる（真偽と件数だけを出し、期待と違えば失敗にする）
  const appOk = await checkAs(
    appUrl,
    `SELECT 'app_can_read_user' AS name, has_table_privilege('public."User"', 'SELECT')::text AS value
     UNION ALL SELECT 'app_can_write_article', (has_table_privilege('public."Article"', 'INSERT')
       AND has_table_privilege('public."Article"', 'UPDATE')
       AND has_table_privilege('public."Article"', 'DELETE'))::text
     UNION ALL SELECT 'app_can_touch_migrations',
       (has_any_column_privilege('public."_prisma_migrations"', 'SELECT, INSERT, UPDATE')
         OR has_table_privilege('public."_prisma_migrations"', 'DELETE, TRUNCATE'))::text
     UNION ALL SELECT 'app_can_create_in_public', has_schema_privilege('public', 'CREATE')::text
     UNION ALL SELECT 'app_is_privileged', (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls)::text
       FROM pg_roles WHERE rolname = current_user
     UNION ALL SELECT 'app_can_select_article',
       ((SELECT count(*) FROM (SELECT 1 FROM "Article" LIMIT 1) s) >= 0)::text`,
    [],
    {
      app_can_read_user: 'true',
      app_can_write_article: 'true',
      app_can_touch_migrations: 'false',
      app_can_create_in_public: 'false',
      app_is_privileged: 'false',
      app_can_select_article: 'true',
    }
  );
  const readonlyOk = await checkAs(
    readonlyUrl,
    `SELECT 'readonly_can_read_article' AS name, has_table_privilege('public."Article"', 'SELECT')::text AS value
     UNION ALL SELECT 'readonly_can_write_article',
       has_table_privilege('public."Article"', 'INSERT, UPDATE, DELETE, TRUNCATE')::text
     UNION ALL SELECT 'readonly_can_read_migration_status',
       (has_column_privilege('public."_prisma_migrations"', 'migration_name', 'SELECT')
         AND has_column_privilege('public."_prisma_migrations"', 'finished_at', 'SELECT')
         AND has_column_privilege('public."_prisma_migrations"', 'rolled_back_at', 'SELECT'))::text
     UNION ALL SELECT 'readonly_can_read_migration_logs',
       has_column_privilege('public."_prisma_migrations"', 'logs', 'SELECT')::text
     UNION ALL SELECT 'readonly_readable_personal_tables', count(*)::text
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1::name[])
         AND has_any_column_privilege(c.oid, 'SELECT')
     UNION ALL SELECT 'readonly_can_create_objects', (has_schema_privilege('public', 'CREATE')
       OR has_database_privilege(current_database(), 'CREATE'))::text
     UNION ALL SELECT 'readonly_default_read_only',
       (current_setting('default_transaction_read_only') = 'on')::text`,
    [access.personal],
    {
      readonly_can_read_article: 'true',
      readonly_can_write_article: 'false',
      readonly_can_read_migration_status: 'true',
      readonly_can_read_migration_logs: 'false',
      readonly_readable_personal_tables: '0',
      readonly_can_create_objects: 'false',
      readonly_default_read_only: 'true',
    }
  );
  const ok = appOk && readonlyOk;
  console.log(`verification_ok=${ok}`);
  if (!ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.log(`failure_reason_${errorReason(error)}=true`);
  process.exitCode = 1;
});
