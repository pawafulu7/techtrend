/**
 * 本番のマイグレーションの適用状況と、手元の読み取り用のロール自身の権限を確かめる（npm run migrate:production:check）。
 *
 *   bash scripts/db/with-prod-db.sh npx tsx scripts/db/check-prod-migrations.ts
 *
 * 読み取り用のロールは、マイグレーションの記録の失敗のログ（logs 列）を読めないので、prisma migrate status は権限で止まる。
 * 代わりに、読める列だけで prisma/migrations と比べる。出力は `名前=数値` の行だけ（with-prod-db.sh が通す形）。
 * 読み取り用のロールの権限は、マイグレーションで付け外しする（readonly-grants.ts）。マイグレーションの外で付いた権限
 * （手で足した GRANT・PUBLIC への GRANT・以前の版で直接付けた権限）は、ここで繋いだロール自身を調べて見つける。
 * 未適用か失敗があるか、権限が一覧と違えば終了コード 1
 */
import {
  assertReadonlyCandidate,
  createScriptClient,
  errorReason,
  inspectReadonlyPrivileges,
  loadTableAccess,
  readonlyPrivilegesMatch,
} from './prod-db-roles';
import {
  localMigrationNames,
  MIGRATION_RECORDS_SQL,
  summarizeMigrations,
  type MigrationRecord,
} from './migration-status';

async function main(): Promise<void> {
  const url = process.env.PROD_DATABASE_URL;
  if (!url) {
    console.log('failure_reason_prod_database_url_missing=true');
    process.exitCode = 2;
    return;
  }
  const client = createScriptClient(url);
  try {
    await client.connect();
    const { rows } = await client.query<MigrationRecord>(MIGRATION_RECORDS_SQL);
    const status = summarizeMigrations(localMigrationNames(), rows);
    console.log(`local_migrations=${status.local}`);
    console.log(`applied_migrations=${status.applied}`);
    console.log(`pending_migrations=${status.pending.length}`);
    console.log(`failed_migrations=${status.failed.length}`);
    console.log(`unknown_migrations=${status.unknown.length}`);
    // マイグレーションの名前は英数字と _ だけなので、`名前=1` の形で出せる
    for (const name of status.pending) console.log(`pending_${name}=1`);
    for (const name of status.failed) console.log(`failed_${name}=1`);
    if (status.pending.length > 0 || status.failed.length > 0) process.exitCode = 1;

    // 繋いだロール自身が、手元用のロールとして一覧どおりの権限か（ロールの名前は出さない）
    const { rows: me } = await client.query<{ name: string }>('SELECT current_user AS name');
    const privileges = await inspectReadonlyPrivileges(client, me[0].name, loadTableAccess());
    console.log(`readonly_unexpected_readable_tables=${privileges.unexpectedReadable}`);
    console.log(`readonly_unreadable_content_tables=${privileges.unreadableContent}`);
    console.log(`readonly_writable_tables=${privileges.writable}`);
    let candidateReason = 'none';
    await assertReadonlyCandidate(client, me[0].name, { self: true }).catch((error: unknown) => {
      candidateReason = errorReason(error);
    });
    console.log(`readonly_role_problem_${candidateReason}=true`);
    const ok = candidateReason === 'none' && readonlyPrivilegesMatch(privileges, true);
    console.log(`readonly_privileges_ok=${ok}`);
    if (!ok) process.exitCode = 1;
  } catch (error) {
    console.log(`failure_reason_${errorReason(error)}=true`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
