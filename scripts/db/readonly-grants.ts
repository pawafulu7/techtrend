/**
 * 手元（ローカル・AI）の読み取り用ロールの権限。scripts/db/prod-table-access.json の content の表と、マイグレーションの
 * 記録の一部の列（READONLY_MIGRATION_COLUMNS）を読むだけにし、personal（個人情報）の表と分類していない表は読ませない。
 *
 * 一度でも personal に分類した表は、読み取り用ロールのコメントに記録する。記録にある表を content に入れた一覧
 * （古い commit の Redeploy など）では、権限を変えずに失敗する（個人情報の表を読めるように戻さないため）。
 * personal から content に戻すときは、Neon のコンソールの SQL Editor で記録から外す（docs/operations/deployment.md）
 */
import {
  publicRelations,
  PUBLIC_RELATIONS,
  qualified,
  READONLY_MIGRATION_COLUMNS,
  RoleSetupError,
  type RoleQueryable,
  type TableAccess,
} from './prod-db-shared';

/** 読み取り用ロールのコメントのうち、personal に分類した表の記録の印 */
export const PERSONAL_RECORD_PREFIX = 'techtrend:personal-tables:';

/**
 * 読み取り用ロールにしてよいロールかを確かめる。管理者やアプリ用のロールを指定してしまうと、
 * applyReadonlyGrants の REVOKE でその権限を消してしまうため。ほかのロールに属していると、そこから
 * 読める表が増える（pg_read_all_data など）ので、それも止める
 */
export async function assertReadonlyCandidate(
  client: RoleQueryable,
  role: string
): Promise<void> {
  const { rows } = await client.query<{ reason: string | null }>(
    `SELECT CASE
       WHEN r.oid IS NULL THEN 'role_missing'
       WHEN NOT r.rolcanlogin THEN 'role_cannot_login'
       WHEN r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication THEN 'role_privileged'
       WHEN r.rolname = current_user THEN 'role_is_current_user'
       WHEN EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid) THEN 'role_is_member_of_other_roles'
       WHEN EXISTS (SELECT 1 FROM (${PUBLIC_RELATIONS}) t WHERE t.relowner = r.oid) THEN 'role_owns_tables'
       WHEN EXISTS (
         SELECT 1 FROM (${PUBLIC_RELATIONS}) t
         WHERE has_table_privilege(r.oid, t.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
       ) THEN 'role_can_write'
     END AS reason
     FROM (SELECT $1::name AS name) q LEFT JOIN pg_roles r ON r.rolname = q.name`,
    [role]
  );
  const reason = rows[0]?.reason;
  if (reason) throw new RoleSetupError(reason);
}

export interface ReadonlyPrivileges {
  /** content の表のうち、読めるもの */
  readableContent: number;
  /** content の表のうち、DB にあるのに読めないもの */
  unreadableContent: number;
  /** content 以外（personal・分類していない表・マイグレーションの記録の表全体）で読めるもの */
  unexpectedReadable: number;
  /** 変更できる（書き込み・TRUNCATE など）表の数 */
  writable: number;
  /** public スキーマか DB に、表やスキーマを作れる */
  canCreateObjects: boolean;
  /** マイグレーションの記録の、状態の確認に使う列（READONLY_MIGRATION_COLUMNS）をすべて読める */
  canReadMigrationColumns: boolean;
  /** マイグレーションの記録の失敗のログの列を読める */
  canReadMigrationLogs: boolean;
}

/** 読み取り用ロールが実際に読める・書ける表を数える（直接の権限だけでなく、PUBLIC やロールの所属を通したものも含む） */
export async function inspectReadonlyPrivileges(
  client: RoleQueryable,
  role: string,
  access: TableAccess
): Promise<ReadonlyPrivileges> {
  const { rows } = await client.query<{
    relname: string;
    can_select: boolean;
    can_select_any_column: boolean;
    can_change: boolean;
  }>(
    `SELECT t.relname,
            has_table_privilege($1::name, t.oid, 'SELECT') AS can_select,
            has_any_column_privilege($1::name, t.oid, 'SELECT') AS can_select_any_column,
            (has_table_privilege($1::name, t.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
              OR has_any_column_privilege($1::name, t.oid, 'INSERT, UPDATE, REFERENCES')) AS can_change
     FROM (${PUBLIC_RELATIONS}) t`,
    [role]
  );
  const { rows: create } = await client.query<{ can_create: boolean }>(
    `SELECT (has_schema_privilege($1::name, 'public', 'CREATE')
              OR has_database_privilege($1::name, current_database(), 'CREATE')) AS can_create`,
    [role]
  );
  let migrationColumns = { all_columns: false, logs: false };
  if (rows.some((r) => r.relname === '_prisma_migrations')) {
    const { rows: cols } = await client.query<{ all_columns: boolean; logs: boolean }>(
      `SELECT bool_and(has_column_privilege($1::name, 'public."_prisma_migrations"', c, 'SELECT')) AS all_columns,
              has_column_privilege($1::name, 'public."_prisma_migrations"', 'logs', 'SELECT') AS logs
       FROM unnest($2::text[]) c`,
      [role, READONLY_MIGRATION_COLUMNS]
    );
    migrationColumns = cols[0] ?? migrationColumns;
  }
  const content = new Set(access.content);
  return {
    readableContent: rows.filter((r) => content.has(r.relname) && r.can_select).length,
    unreadableContent: rows.filter((r) => content.has(r.relname) && !r.can_select).length,
    // マイグレーションの記録は一部の列だけ読ませるので、表全体（SELECT * ができる）かどうかで見る
    unexpectedReadable: rows.filter(
      (r) =>
        !content.has(r.relname) &&
        (r.relname === '_prisma_migrations' ? r.can_select : r.can_select_any_column)
    ).length,
    writable: rows.filter((r) => r.can_change).length,
    canCreateObjects: create[0]?.can_create !== false,
    canReadMigrationColumns: migrationColumns.all_columns,
    canReadMigrationLogs: migrationColumns.logs,
  };
}

/** 一覧どおりの権限か（content はすべて読め、それ以外は読めず、どれも書けず、何も作れず、マイグレーションの記録は状態の列だけ読める） */
export function readonlyPrivilegesMatch(
  p: ReadonlyPrivileges,
  hasMigrationsTable: boolean
): boolean {
  return (
    p.unreadableContent === 0 &&
    p.unexpectedReadable === 0 &&
    p.writable === 0 &&
    !p.canCreateObjects &&
    !p.canReadMigrationLogs &&
    p.canReadMigrationColumns === hasMigrationsTable
  );
}

/** 読み取り用ロールのコメントに記録した、personal に分類したことのある表 */
export async function recordedPersonalTables(
  client: RoleQueryable,
  role: string
): Promise<string[]> {
  const { rows } = await client.query<{ comment: string | null }>(
    `SELECT shobj_description(oid, 'pg_authid') AS comment FROM pg_roles WHERE rolname = $1::name`,
    [role]
  );
  const comment = rows[0]?.comment;
  if (!comment) return [];
  if (!comment.startsWith(PERSONAL_RECORD_PREFIX)) {
    throw new RoleSetupError('personal_record_unreadable');
  }
  try {
    const tables: unknown = JSON.parse(comment.slice(PERSONAL_RECORD_PREFIX.length));
    if (Array.isArray(tables) && tables.every((t) => typeof t === 'string')) return tables;
  } catch {
    // 下で止める
  }
  throw new RoleSetupError('personal_record_unreadable');
}

export interface ReadonlyGrantResult {
  /** 読めるようにした表の数（content の表と、マイグレーションの記録の表） */
  granted: number;
  /** content にあるが DB に無い表の数 */
  missing: number;
  /** DB にあるが一覧のどこにも無い表の数（読ませない） */
  unclassified: number;
  /** マイグレーションの記録の表があるか */
  hasMigrationsTable: boolean;
}

/**
 * 読み取り用ロールの権限を、一覧どおりに付け直す。public の表の権限をいったん全部外し（列の権限も一緒に外れる）、
 * content の表に SELECT を、マイグレーションの記録には READONLY_MIGRATION_COLUMNS の列だけ SELECT を付ける
 * （一覧から外した表や personal に移した表は読めなくなる）。シーケンスは値を読めるだけにする
 * （pg_dump の --data-only がシーケンスの値を読むため。個人情報は持たない）。
 * 付け直した後に実際の権限を確かめ、一覧と違えば RoleSetupError を投げる（PUBLIC への GRANT などは REVOKE で消えないため）。
 * 呼び出し元がトランザクションで包む（失敗したら戻し、途中の状態を同期や AI の問い合わせに見せないため）
 */
export async function applyReadonlyGrants(
  client: RoleQueryable,
  role: string,
  access: TableAccess
): Promise<ReadonlyGrantResult> {
  for (const table of access.metadata) {
    if (table !== '_prisma_migrations') throw new RoleSetupError('unknown_metadata_table');
  }
  await assertReadonlyCandidate(client, role);
  const personal = new Set([...(await recordedPersonalTables(client, role)), ...access.personal]);
  if (access.content.some((t) => personal.has(t))) {
    throw new RoleSetupError('content_table_recorded_as_personal');
  }
  const existing = await publicRelations(client);
  const known = new Set([...access.personal, ...access.content, ...access.metadata]);
  const targets = access.content.filter((t) => existing.has(t));
  const hasMigrations = existing.has('_prisma_migrations');
  const r = client.escapeIdentifier(role);

  await client.query(`GRANT USAGE ON SCHEMA public TO ${r}`);
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${r}`);
  if (targets.length > 0) {
    await client.query(`GRANT SELECT ON ${qualified(client, targets)} TO ${r}`);
  }
  if (hasMigrations) {
    const columns = READONLY_MIGRATION_COLUMNS.map((c) => client.escapeIdentifier(c)).join(', ');
    await client.query(`GRANT SELECT (${columns}) ON public."_prisma_migrations" TO ${r}`);
  }
  await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${r}`);
  await client.query(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r}`);
  const record = `${PERSONAL_RECORD_PREFIX}${JSON.stringify([...personal].sort())}`;
  await client.query(`COMMENT ON ROLE ${r} IS ${client.escapeLiteral(record)}`);

  const privileges = await inspectReadonlyPrivileges(client, role, access);
  if (!readonlyPrivilegesMatch(privileges, hasMigrations)) {
    throw new RoleSetupError('readonly_privileges_mismatch');
  }

  return {
    granted: targets.length + (hasMigrations ? 1 : 0),
    missing: access.content.length - targets.length,
    unclassified: [...existing].filter((t) => !known.has(t)).length,
    hasMigrationsTable: hasMigrations,
  };
}
