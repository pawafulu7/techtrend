/**
 * 手元（ローカル・AI）の読み取り用ロールの権限を調べる。
 *
 * 権限はマイグレーションでだけ付け外しする（prisma/migrations/20261127000000_add_readonly_content_role）。付ける先は
 * ログインできないグループのロール techtrend_readonly で、手元用のログインのロールはそのメンバーにするだけ
 * （create-prod-roles.ts。ログインのロールの名前は本番の接続先の情報なので、リポジトリに書かない）。
 * 読めるのは scripts/db/prod-table-access.json の content の表と、マイグレーションの記録の状態の列だけで、
 * personal（個人情報）の表と分類していない表は読めない。一覧どおりかは、マイグレーション済みのテスト DB で
 * __tests__/scripts/db/prod-table-access.db.test.ts が確かめる
 */
import {
  PUBLIC_RELATIONS,
  READONLY_CANDIDATE_REASONS,
  READONLY_MIGRATION_COLUMNS,
  RoleSetupError,
  type RoleQueryable,
  type TableAccess,
} from './prod-db-shared';

/** 読み取りの権限を持つ、ログインできないグループのロール（マイグレーションで作る） */
export const READONLY_GROUP_ROLE = 'techtrend_readonly';

type CandidateReason = (typeof READONLY_CANDIDATE_REASONS)[number];

function isCandidateReason(value: unknown): value is CandidateReason {
  return (READONLY_CANDIDATE_REASONS as readonly unknown[]).includes(value);
}

/**
 * 手元用のログインのロールにしてよいかを確かめる。ログインでき、特権を持たず、属するロールが techtrend_readonly だけで
 * （ほかのロールに属すると、そこから読める表が増えるため）、public の表・列・スキーマへの権限を直接持たず（マイグレーション
 * での付け外しが届かないため。以前の版のスクリプトで作ったロールが当たる）、何も所有せず、書き込めないこと。
 * techtrend_readonly 自身も、ログインできず、特権を持たず、ほかのロールに属さないこと（メンバーは SET ROLE で
 * techtrend_readonly になれ、そこから属するロールにも SET ROLE できる。INHERIT FALSE で属していると、権限を数えても
 * 現れない）
 */
export async function assertReadonlyCandidate(
  client: RoleQueryable,
  role: string,
  /** 繋いだロール自身を調べるとき（状態の確認）は true。管理者が自分を手元用に指定する誤りを止める条件を外す */
  options: { self?: boolean } = {}
): Promise<void> {
  const { rows } = await client.query<{ reason: string | null }>(
    `SELECT CASE
       WHEN r.oid IS NULL THEN 'role_missing'
       WHEN NOT r.rolcanlogin THEN 'role_cannot_login'
       WHEN r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication THEN 'role_privileged'
       WHEN r.rolname = current_user AND NOT $3 THEN 'role_is_current_user'
       WHEN EXISTS (
         SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
         WHERE m.member = r.oid AND g.rolname <> $2
       ) OR NOT EXISTS (
         SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
         WHERE m.member = r.oid AND g.rolname = $2
       ) THEN 'role_not_only_in_readonly_group'
       WHEN EXISTS (
         SELECT 1 FROM pg_roles g WHERE g.rolname = $2
           AND (g.rolcanlogin OR g.rolsuper OR g.rolcreaterole OR g.rolcreatedb OR g.rolbypassrls OR g.rolreplication)
       ) OR EXISTS (
         SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.member WHERE g.rolname = $2
       ) THEN 'readonly_group_unsafe'
       -- 表を所有すると、所有者の権限も表の ACL に直接載るので、所有を先に見る
       WHEN EXISTS (SELECT 1 FROM (${PUBLIC_RELATIONS}) t WHERE t.relowner = r.oid) THEN 'role_owns_tables'
       WHEN EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(c.relacl) a
         WHERE n.nspname = 'public' AND a.grantee = r.oid
       ) OR EXISTS (
         SELECT 1 FROM pg_attribute att JOIN pg_class c ON c.oid = att.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(att.attacl) a
         WHERE n.nspname = 'public' AND a.grantee = r.oid
       ) OR EXISTS (
         SELECT 1 FROM pg_namespace n, aclexplode(n.nspacl) a WHERE n.nspname = 'public' AND a.grantee = r.oid
       ) THEN 'role_has_direct_grants'
       WHEN EXISTS (
         SELECT 1 FROM (${PUBLIC_RELATIONS}) t
         WHERE has_table_privilege(r.oid, t.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
       ) THEN 'role_can_write'
     END AS reason
     FROM (SELECT $1::name AS name) q LEFT JOIN pg_roles r ON r.rolname = q.name`,
    [role, READONLY_GROUP_ROLE, options.self === true]
  );
  const reason = rows[0]?.reason;
  if (reason === null || reason === undefined) return;
  // SQL の CASE が決まった文字列以外を返したら、それも止める（理由をそのまま出さない）
  throw new RoleSetupError(isCandidateReason(reason) ? reason : 'readonly_privileges_mismatch');
}

export interface ReadonlyPrivileges {
  /** content の表のうち、読めるもの */
  readableContent: number;
  /** content の表のうち、DB にあるのに読めないもの */
  unreadableContent: number;
  /** content 以外（personal・分類していない表・マイグレーションの記録の表全体）で読めるもの */
  unexpectedReadable: number;
  /** content の表が持つシーケンスのうち、読めないもの（本番からの同期の pg_dump がシーケンスの値を読むため） */
  unreadableContentSequences: number;
  /** content の表のもの以外（personal・分類していない表のもの、どの表のものでもないもの）で読めるシーケンス */
  unexpectedReadableSequences: number;
  /** 変更できる（書き込み・TRUNCATE など）表とシーケンスの数 */
  writable: number;
  /** public スキーマか DB に、永続の表やスキーマを作れる（一時表はセッションの中だけで消え、ほかの表を読めないので見ない） */
  canCreateObjects: boolean;
  /** マイグレーションの記録の、状態の確認に使う列（READONLY_MIGRATION_COLUMNS）をすべて読める */
  canReadMigrationColumns: boolean;
  /** マイグレーションの記録の失敗のログの列を読める */
  canReadMigrationLogs: boolean;
}

/** role が実際に読める・書ける表を数える（直接の権限だけでなく、PUBLIC やロールの所属を通したものも含む） */
export async function inspectReadonlyPrivileges(
  client: RoleQueryable,
  role: string,
  access: TableAccess
): Promise<ReadonlyPrivileges> {
  // PostgreSQL 17 からある MAINTAIN（VACUUM・REINDEX・LOCK TABLE など）も、変更できる権限に含める（16 以前は指定できない）
  const { rows: version } = await client.query<{ pg17: boolean }>(
    `SELECT current_setting('server_version_num')::int >= 170000 AS pg17`
  );
  const changes = `INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER${version[0]?.pg17 ? ', MAINTAIN' : ''}`;
  const { rows } = await client.query<{
    relname: string;
    can_select: boolean;
    can_select_any_column: boolean;
    can_change: boolean;
  }>(
    `SELECT t.relname,
            has_table_privilege($1::name, t.oid, 'SELECT') AS can_select,
            has_any_column_privilege($1::name, t.oid, 'SELECT') AS can_select_any_column,
            (has_table_privilege($1::name, t.oid, $2)
              OR has_any_column_privilege($1::name, t.oid, 'INSERT, UPDATE, REFERENCES')) AS can_change
     FROM (${PUBLIC_RELATIONS}) t`,
    [role, changes]
  );
  const { rows: other } = await client.query<{ can_create: boolean; writable_sequences: number }>(
    `SELECT (has_schema_privilege($1::name, 'public', 'CREATE')
              OR has_database_privilege($1::name, current_database(), 'CREATE')) AS can_create,
            (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             -- has_sequence_privilege はシーケンスでないものに渡すと失敗する。WHERE の条件の評価の順番は決まって
             -- いないので、CASE の中でシーケンスのときだけ呼ぶ
             WHERE n.nspname = 'public'
               AND CASE WHEN c.relkind = 'S'
                     THEN has_sequence_privilege($1::name, c.oid, 'USAGE, UPDATE') ELSE false END
            ) AS writable_sequences`,
    [role]
  );
  // シーケンスと、それを持つ表（serial・identity の列のシーケンスは、表に依存する。持たないものは owner が NULL）
  const { rows: sequences } = await client.query<{ owner: string | null; can_select: boolean }>(
    `SELECT o.relname AS owner,
            CASE WHEN s.relkind = 'S' THEN has_sequence_privilege($1::name, s.oid, 'SELECT') ELSE false END AS can_select
     FROM pg_class s JOIN pg_namespace n ON n.oid = s.relnamespace
     LEFT JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = s.oid
       AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
     LEFT JOIN pg_class o ON o.oid = d.refobjid
     WHERE n.nspname = 'public' AND s.relkind = 'S'`,
    [role]
  );
  let migrationColumns = { all_columns: false, logs: false };
  if (rows.some((r) => r.relname === '_prisma_migrations')) {
    const { rows: cols } = await client.query<{ all_columns: boolean; logs: boolean }>(
      `SELECT coalesce(bool_and(has_column_privilege($1::name, 'public."_prisma_migrations"', c, 'SELECT')), false) AS all_columns,
              has_column_privilege($1::name, 'public."_prisma_migrations"', 'logs', 'SELECT') AS logs
       FROM unnest($2::text[]) c`,
      [role, [...READONLY_MIGRATION_COLUMNS]]
    );
    migrationColumns = cols[0] ?? migrationColumns;
  }
  const content = new Set(access.content);
  const contentSequence = (owner: string | null) => owner !== null && content.has(owner);
  return {
    readableContent: rows.filter((r) => content.has(r.relname) && r.can_select).length,
    unreadableContent: rows.filter((r) => content.has(r.relname) && !r.can_select).length,
    // マイグレーションの記録は一部の列だけ読ませるので、表全体（SELECT * ができる）かどうかで見る
    unexpectedReadable: rows.filter(
      (r) =>
        !content.has(r.relname) &&
        (r.relname === '_prisma_migrations' ? r.can_select : r.can_select_any_column)
    ).length,
    unreadableContentSequences: sequences.filter((s) => contentSequence(s.owner) && !s.can_select).length,
    unexpectedReadableSequences: sequences.filter((s) => !contentSequence(s.owner) && s.can_select).length,
    writable: rows.filter((r) => r.can_change).length + (other[0]?.writable_sequences ?? 0),
    canCreateObjects: other[0]?.can_create !== false,
    canReadMigrationColumns: migrationColumns.all_columns,
    canReadMigrationLogs: migrationColumns.logs,
  };
}

/**
 * 一覧どおりの権限か（content の表とそのシーケンスはすべて読め、それ以外は読めず、どれも書けず、何も作れず、
 * マイグレーションの記録は状態の列だけ読める）
 */
export function readonlyPrivilegesMatch(
  p: ReadonlyPrivileges,
  hasMigrationsTable: boolean
): boolean {
  return (
    p.unreadableContent === 0 &&
    p.unexpectedReadable === 0 &&
    p.unreadableContentSequences === 0 &&
    p.unexpectedReadableSequences === 0 &&
    p.writable === 0 &&
    !p.canCreateObjects &&
    !p.canReadMigrationLogs &&
    p.canReadMigrationColumns === hasMigrationsTable
  );
}
