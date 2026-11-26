/**
 * 手元（ローカル・AI）の読み取り用ロールの権限を、scripts/db/prod-table-access.json どおりに付け直す。
 * Vercel の本番ビルド（package.json の vercel-build）で、マイグレーションの前と後に毎回流す。前の 1 回で、personal に
 * 移した表を読めなくしてからマイグレーションを確定させる（後の付け直しが失敗しても、読めたまま残らないように）。
 * 後の 1 回で、マイグレーションで足した表を、content に入れていれば読めるようにする（personal に入れた表や分類し忘れた
 * 表は読めないまま）。
 *
 * 管理者の接続（MIGRATION_DATABASE_URL）と読み取り用ロールの名前（PROD_READONLY_ROLE）は、Vercel の Production にだけある。
 * 本番のビルドでなければ何もしない。本番のビルドで、どちらかが無い・付け直しに失敗した・付け直した後の権限が一覧と違う
 * ときは、ビルドを止める（表を content から personal に移したのに、読み取り用ロールが読めたまま残るのを防ぐため）。
 * DB に、このビルドに無いマイグレーションが適用済みなら、このビルドは古い（古い commit の Redeploy、重なったビルド）ので、
 * 古い一覧で付け直さずに終える。ロールの名前と接続先は出力しない
 */
import {
  applyReadonlyGrants,
  createScriptClient,
  errorReason,
  hasAppDefaultPrivileges,
  inspectReadonlyPrivileges,
  loadTableAccess,
  readonlyPrivilegesMatch,
  RoleSetupError,
  setLocalTimeouts,
} from './prod-db-roles';
import {
  localMigrationNames,
  MIGRATION_RECORDS_SQL,
  summarizeMigrations,
  type MigrationRecord,
} from './migration-status';

const TAG = '[readonly-grants]';

async function main(): Promise<void> {
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
    // 同時に走るビルドどうしで、古い一覧が新しい付け直しを上書きしないよう、順に流す
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('techtrend:readonly-grants'))`);

    const { rows } = await client.query<MigrationRecord>(MIGRATION_RECORDS_SQL);
    const status = summarizeMigrations(localMigrationNames(), rows);
    if (status.unknown.length > 0) {
      await client.query('ROLLBACK');
      console.log(
        `${TAG} DB に、このビルドより新しいマイグレーション ${status.unknown.length} 個が適用済みです。古い一覧で戻さないよう、付け直しません`
      );
      return;
    }
    if (!(await hasAppDefaultPrivileges(client))) {
      throw new RoleSetupError('app_default_privileges_missing');
    }

    const result = await applyReadonlyGrants(client, role, access);
    await client.query('COMMIT');

    // COMMIT の後に、実際の権限をもう一度確かめる
    const after = await inspectReadonlyPrivileges(client, role, access);
    if (!readonlyPrivilegesMatch(after, result.hasMigrationsTable)) {
      throw new RoleSetupError('readonly_privileges_mismatch_after_commit');
    }
    console.log(
      `${TAG} 読める表 ${after.readableContent} 個（とマイグレーションの記録の一部の列）。一覧にあるが DB に無い表 ${result.missing} 個、分類されていない表 ${result.unclassified} 個（読ませない）`
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    // メッセージにはロールの名前が入ることがあるので、決まった理由かエラーコードだけを出す
    console.error(`${TAG} 権限を付け直せませんでした（理由: ${errorReason(error)}）。ビルドを止めます`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(`${TAG} 失敗しました（理由: ${errorReason(error)}）。ビルドを止めます`);
  process.exitCode = 1;
});
