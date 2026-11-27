/**
 * 本番 DB（Neon）のロールを用途で分ける。
 *
 * - 管理者（DB と表の所有者）: マイグレーションと Neon のコンソールでの作業だけに使う。Vercel では Production の
 *   MIGRATION_DATABASE_URL にだけ置く（prisma.config.ts が本番のビルドのマイグレーションで使う）
 * - アプリ用: Vercel の関数と GitHub Actions が使う。表の読み書きだけで、表の作成・変更・削除やロールの作成はできない。
 *   マイグレーションの記録（_prisma_migrations）は触れない
 * - 手元用（読み取り用）: ローカルと AI が使う。グループのロール techtrend_readonly のメンバーで、権限はマイグレーション
 *   でだけ付け外しする（権限を調べる処理は readonly-grants.ts）
 *
 * ロールは SQL で作る（Neon のコンソール・API で作ると neon_superuser が付き、管理者と同じ権限になる）。
 * ログインのロールの名前は本番の接続先の情報なので、リポジトリには書かず、作るときに乱数で決める（create-prod-roles.ts）。
 * 共通の部品は prod-db-shared.ts（ここからも使えるように export し直す）
 */
import {
  PUBLIC_RELATIONS,
  RoleSetupError,
  type RoleQueryable,
  type TableAccess,
} from './prod-db-shared';
import {
  assertReadonlyCandidate,
  inspectReadonlyPrivileges,
  READONLY_GROUP_ROLE,
  readonlyPrivilegesMatch,
} from './readonly-grants';

export * from './prod-db-shared';
export * from './readonly-grants';

/**
 * 現在のロール（マイグレーションを流す管理者）が後で作る表に、appRole（アプリ用）が書き込める既定の権限があるか。
 * 無いと、マイグレーションで足した表をアプリが読み書きできない（ALTER DEFAULT PRIVILEGES は、それを流したロールが
 * 作る表にだけ効く）
 */
export async function hasAppDefaultPrivileges(
  client: RoleQueryable,
  appRole: string
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_default_acl d
       JOIN pg_namespace n ON n.oid = d.defaclnamespace
       CROSS JOIN LATERAL aclexplode(d.defaclacl) a
       JOIN pg_roles g ON g.oid = a.grantee
       WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
         AND n.nspname = 'public' AND d.defaclobjtype = 'r'
         AND a.privilege_type = 'INSERT' AND g.rolname = $1
     ) AS ok`,
    [appRole]
  );
  return rows[0]?.ok === true;
}

export interface CreateProdRolesInput {
  appRole: string;
  appPassword: string;
  readonlyRole: string;
  readonlyPassword: string;
  access: TableAccess;
}

export interface CreateProdRolesResult {
  /** アプリ用ロールが読み書きできる表の数（マイグレーションの記録を除く public の表の数と同じになる） */
  appTables: number;
  /** 手元用ロールが読める content の表の数 */
  readonlyTables: number;
}

/**
 * アプリ用と手元用のログインロールを作り、権限を付ける。管理者（現在の DB の所有者）の接続で、トランザクションの中で呼ぶ
 * （beginRoleTransaction。デプロイのマイグレーションと重ならないよう prisma migrate と同じ鍵を取る）。
 * 手元用のロールは techtrend_readonly のメンバーにするだけなので、マイグレーションを流した後でないと作れない。
 * アプリ用の既定の権限（ALTER DEFAULT PRIVILEGES）は、これを流したロールが後で作る表にだけ効くので、
 * マイグレーションを流すロール（MIGRATION_DATABASE_URL）と同じ管理者で流す
 */
export async function createProdRoles(
  client: RoleQueryable,
  input: CreateProdRolesInput
): Promise<CreateProdRolesResult> {
  const { rows: owner } = await client.query<{
    owns_db: boolean;
    db: string;
    group_ok: boolean;
    grantable: boolean;
  }>(
    `SELECT d.datdba = (SELECT oid FROM pg_roles WHERE rolname = current_user) AS owns_db,
            current_database() AS db,
            EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1 AND NOT rolcanlogin) AS group_ok,
            -- グループのロールをメンバーに付けられるか（PostgreSQL 16 からは、作ったロールに付く ADMIN OPTION が要る。
            -- マイグレーションを流した管理者と同じ管理者で流せば付いている）
            (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
              -- pg_has_role は無いロールに渡すと失敗する。AND では評価の順番が決まらないので CASE で守る
              OR CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
                   THEN pg_has_role(current_user, $1, 'MEMBER WITH ADMIN OPTION') ELSE false END
              OR (current_setting('server_version_num')::int < 160000
                  AND (SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user)) AS grantable
     FROM pg_database d WHERE d.datname = current_database()`,
    [READONLY_GROUP_ROLE]
  );
  if (!owner[0]?.owns_db) throw new RoleSetupError('not_db_owner');
  if (!owner[0].group_ok) throw new RoleSetupError('readonly_group_missing');
  if (!owner[0].grantable) throw new RoleSetupError('readonly_group_not_grantable');
  const { rows: taken } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_roles WHERE rolname = ANY($1::name[])`,
    [[input.appRole, input.readonlyRole]]
  );
  if ((taken[0]?.n ?? 0) > 0) throw new RoleSetupError('role_exists');

  const app = client.escapeIdentifier(input.appRole);
  const ro = client.escapeIdentifier(input.readonlyRole);
  const db = client.escapeIdentifier(owner[0].db);

  await client.query(`CREATE ROLE ${app} LOGIN PASSWORD ${client.escapeLiteral(input.appPassword)}`);
  await client.query(
    `CREATE ROLE ${ro} LOGIN CONNECTION LIMIT 5 PASSWORD ${client.escapeLiteral(input.readonlyPassword)}`
  );
  // 手元用: 権限は techtrend_readonly から受け継ぐだけ。開いたままのトランザクションがマイグレーションの ALTER を
  // 待たせないよう、時間の上限を付け、書き込めない既定にする（pg_dump は開始時に statement_timeout などを 0 にする）
  await client.query(`GRANT ${client.escapeIdentifier(READONLY_GROUP_ROLE)} TO ${ro}`);
  await client.query(`ALTER ROLE ${ro} SET default_transaction_read_only = on`);
  await client.query(`ALTER ROLE ${ro} SET statement_timeout = '60s'`);
  await client.query(`ALTER ROLE ${ro} SET idle_in_transaction_session_timeout = '60s'`);
  await client.query(`GRANT CONNECT ON DATABASE ${db} TO ${app}, ${ro}`);

  // アプリ用: 表の読み書きだけ。マイグレーションの記録は触らせない
  await client.query(`GRANT USAGE ON SCHEMA public TO ${app}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${app}`);
  await client.query(`REVOKE ALL ON TABLE public."_prisma_migrations" FROM ${app}`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${app}`);
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${app}`
  );

  const { rows: check } = await client.query<{
    can_create: boolean;
    writable: number;
    tables: number;
  }>(
    `SELECT (has_schema_privilege($1::name, 'public', 'CREATE')
              OR has_database_privilege($1::name, current_database(), 'CREATE')) AS can_create,
            count(*) FILTER (WHERE has_table_privilege($1::name, t.oid, 'INSERT')
              AND has_table_privilege($1::name, t.oid, 'UPDATE')
              AND has_table_privilege($1::name, t.oid, 'DELETE'))::int AS writable,
            count(*)::int AS tables
     FROM (${PUBLIC_RELATIONS}) t
     WHERE t.relkind IN ('r', 'p') AND t.relname <> '_prisma_migrations'`,
    [input.appRole]
  );
  // PUBLIC が public スキーマや DB に作れる設定（PostgreSQL 14 以前の既定など）だと、アプリ用も作れてしまうので止める
  if (check[0]?.can_create !== false) throw new RoleSetupError('app_can_create_objects');
  // 管理者が所有していない表への GRANT は、エラーにならず警告で終わる。黙って抜けた表があれば止める
  if (!check[0] || check[0].writable !== check[0].tables) {
    throw new RoleSetupError('app_missing_table_privileges');
  }
  if (!(await hasAppDefaultPrivileges(client, input.appRole))) {
    throw new RoleSetupError('app_default_privileges_missing');
  }

  await assertReadonlyCandidate(client, input.readonlyRole);
  const readonly = await inspectReadonlyPrivileges(client, input.readonlyRole, input.access);
  if (!readonlyPrivilegesMatch(readonly, true)) {
    throw new RoleSetupError('readonly_privileges_mismatch');
  }
  return { appTables: check[0].writable, readonlyTables: readonly.readableContent };
}
