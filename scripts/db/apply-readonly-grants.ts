/**
 * 手元（ローカル・AI）の読み取り用ロールの権限を、scripts/db/prod-table-access.json どおりに付け直す（readonly-grants.ts）。
 * Vercel の本番ビルド（package.json の vercel-build）で、マイグレーションの前と後に毎回流す。
 *
 *   tsx scripts/db/apply-readonly-grants.ts --before-migrations   # 前: personal に移した表を読めなくするだけ
 *   tsx scripts/db/apply-readonly-grants.ts                       # 後: マイグレーションで足した content の表も読めるようにする
 *
 * 前の 1 回で、personal に移した表を読めなくしてからマイグレーションを確定させる（後が失敗しても読めたまま残らない）。
 * 読めるようにするのは後の 1 回だけ（途中まで作られた表を読ませない）。対象は PROD_READONLY_ROLE と、印の付いた
 * すべての読み取り用ロール（ロールを作り直している途中の古いロールも含める）。
 *
 * 管理者の接続（MIGRATION_DATABASE_URL）と読み取り用ロールの名前（PROD_READONLY_ROLE）は、Vercel の Production にだけある。
 * 本番のビルドでなければ何もしない。本番のビルドで、どちらかが無い・付け直しに失敗した・付け直した後の権限が一覧と違う
 * ときは、ビルドを止める。DB に、このビルドに無いマイグレーションが適用済みなら、このビルドは古い（古い commit の
 * Redeploy など）ので、古い一覧で付け直さずに終える（このビルドにしか無い未適用のマイグレーションもあれば、履歴が
 * 分かれているので止める）。ロールの名前と接続先は出力しない
 */
import {
  applyReadonlyGrants,
  createScriptClient,
  errorReason,
  hasAppDefaultPrivileges,
  inspectReadonlyPrivileges,
  loadTableAccess,
  markedReadonlyRoles,
  readonlyPrivilegesSafe,
  RoleSetupError,
  setLocalTimeouts,
  type ReadonlyGrantResult,
} from './prod-db-roles';
import {
  localMigrationNames,
  MIGRATION_RECORDS_SQL,
  readonlyGrantDecision,
  summarizeMigrations,
  type MigrationRecord,
} from './migration-status';

const TAG = '[readonly-grants]';
/** prisma migrate が DB を排他する advisory lock の鍵（Prisma の schema engine の pg_advisory_lock(72707369)） */
const PRISMA_MIGRATE_LOCK_KEY = 72707369;

async function main(): Promise<void> {
  const mode = process.argv.includes('--before-migrations') ? 'revoke' : 'full';
  const label = mode === 'revoke' ? 'マイグレーションの前' : 'マイグレーションの後';
  if (process.env.VERCEL_ENV !== 'production') {
    console.log(`${TAG} 本番のビルドではないので、何もしません`);
    return;
  }
  const url = process.env.MIGRATION_DATABASE_URL;
  const role = process.env.PROD_READONLY_ROLE;
  if (!url || !role) {
    console.error(
      `${TAG} Production の環境変数に MIGRATION_DATABASE_URL と PROD_READONLY_ROLE が要ります。ビルドを止めます`
    );
    process.exitCode = 1;
    return;
  }

  const access = loadTableAccess();
  const client = createScriptClient(url);
  try {
    await client.connect();
    await client.query('BEGIN');
    await setLocalTimeouts(client);
    // ほかのビルドの migrate deploy と重ならないよう、同じ鍵を取ってから状態を読む（REVOKE ALL は public の表の
    // pg_class の行を書き換えるので、並行する ALTER TABLE と衝突しうる）。待ちが lock_timeout を超えたら止まる
    await client.query('SELECT pg_advisory_xact_lock($1)', [PRISMA_MIGRATE_LOCK_KEY]);

    const { rows: table } = await client.query<{ exists: boolean }>(
      `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS exists`
    );
    // まだマイグレーションを流していない DB は、記録が無い（すべて未適用）として扱う
    const { rows } = table[0]?.exists
      ? await client.query<MigrationRecord>(MIGRATION_RECORDS_SQL)
      : { rows: [] as MigrationRecord[] };
    const decision = readonlyGrantDecision(summarizeMigrations(localMigrationNames(), rows));
    if (decision === 'diverged') throw new RoleSetupError('migration_history_diverged');
    if (decision === 'skip_older_build') {
      await client.query('ROLLBACK');
      console.log(
        `${TAG} DB に、このビルドより新しいマイグレーションが適用済みです。古い一覧で戻さないよう、付け直しません`
      );
      return;
    }
    if (!(await hasAppDefaultPrivileges(client))) {
      throw new RoleSetupError('app_default_privileges_missing');
    }

    const roles = [...new Set([role, ...(await markedReadonlyRoles(client))])];
    const results: ReadonlyGrantResult[] = [];
    for (const target of roles) {
      results.push(await applyReadonlyGrants(client, target, access, mode));
    }
    await client.query('COMMIT');
    // トランザクションの外の問い合わせにも、サーバー側の上限を付ける
    await client.query(`SET statement_timeout = '60s'`);

    // COMMIT の後に、読ませてはいけない表を読めないことをもう一度確かめる（content の表がまだ読めないのは、
    // 並行するビルドのマイグレーションで表が増えた直後にも起きるので問わない）
    for (const [i, target] of roles.entries()) {
      const after = await inspectReadonlyPrivileges(client, target, access);
      if (!readonlyPrivilegesSafe(after, results[i].hasMigrationsTable)) {
        throw new RoleSetupError('readonly_privileges_unsafe_after_commit');
      }
    }
    const first = results[0];
    console.log(
      `${TAG} ${label}: 読み取り用ロール ${roles.length} 個を付け直しました（読めるようにした表 ${first.granted} 個。一覧にあるが DB に無い表 ${first.missing} 個、分類されていない表 ${first.unclassified} 個は読ませない）`
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    // メッセージにはロールの名前が入ることがあるので、決まった理由かエラーコードだけを出す
    console.error(
      `${TAG} ${label}: 権限を付け直せませんでした（理由: ${errorReason(error)}）。ビルドを止めます`
    );
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(`${TAG} 失敗しました（理由: ${errorReason(error)}）。ビルドを止めます`);
  process.exitCode = 1;
});
