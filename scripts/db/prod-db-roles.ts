/**
 * 本番 DB（Neon）のロールを用途で分けるための共通処理。
 *
 * - 管理者（DB と表の所有者）: マイグレーションと Neon のコンソールでの作業だけに使う。Vercel では Production の
 *   MIGRATION_DATABASE_URL にだけ置く（prisma.config.ts が本番のビルドのマイグレーションで使う）
 * - アプリ用: Vercel の関数と GitHub Actions が使う。表の読み書きだけで、表の作成・変更・削除やロールの作成はできない。
 *   マイグレーションの記録（_prisma_migrations）は触れない
 * - 手元用（読み取り用）: ローカルと AI が使う。scripts/db/prod-table-access.json の content の表と、マイグレーションの
 *   記録の一部の列を読むだけで、personal（個人情報）の表と、どこにも分類していない表は読めない
 *
 * ロールは SQL で作る（Neon のコンソール・API で作ると neon_superuser が付き、管理者と同じ権限になる）。
 * ロールの名前は本番の接続先の情報なので、リポジトリには書かず、作るときに乱数で決める（create-prod-roles.ts）。
 * 失敗の理由は RoleSetupError の決まった文字列で返し、ロールの名前や接続先をメッセージに入れない
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import tableAccessJson from './prod-table-access.json';

export interface TableAccess {
  personal: string[];
  content: string[];
  metadata: string[];
}

/** query と、識別子・リテラルのエスケープを持つ接続（pg の Client・PoolClient） */
export interface RoleQueryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: R[] }>;
  escapeIdentifier(value: string): string;
  escapeLiteral(value: string): string;
}

/** 失敗の理由（英小文字と _ の決まった文字列）。`名前=値` の出力の絞り込みを通る形で出せる */
export class RoleSetupError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'RoleSetupError';
  }
}

/** 出力してよい失敗の理由。RoleSetupError の理由か、PostgreSQL・Node のエラーコード。どちらでもなければ unknown */
export function errorReason(error: unknown): string {
  if (error instanceof RoleSetupError) return error.reason;
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^[A-Za-z0-9_]+$/.test(code) ? `code_${code}` : 'unknown';
}

/**
 * スクリプト用の接続。接続の待ち時間に上限を付け、接続が途中で切れたときにプロセスごと落ちないよう 'error' を受ける
 * （受けないと pg が投げた 'error' で落ち、後始末が流れない）。失敗した query は reject される
 */
export function createScriptClient(connectionString: string): Client {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  client.on('error', () => undefined);
  return client;
}

/** トランザクションの中で、ロックと文の待ち時間に上限を付ける（マイグレーションやアプリの問い合わせを長く止めない） */
export async function setLocalTimeouts(client: RoleQueryable): Promise<void> {
  await client.query(`SET LOCAL lock_timeout = '10s'`);
  await client.query(`SET LOCAL statement_timeout = '60s'`);
}

export function loadTableAccess(): TableAccess {
  const { personal, content, metadata } = tableAccessJson;
  return { personal, content, metadata };
}

/** 読み取り用ロールが読める、マイグレーションの記録の列（失敗のログ logs は DB のエラーの値を含みうるので読ませない） */
export const READONLY_MIGRATION_COLUMNS = [
  'id',
  'checksum',
  'finished_at',
  'migration_name',
  'started_at',
  'rolled_back_at',
  'applied_steps_count',
];

/**
 * ロールのパスワードを作る。32 バイトの乱数を base64url にした 43 文字（英大小文字・数字・記号が混ざり、URL に
 * そのまま書ける）。Neon は SQL で作るロールのパスワードに 60 ビット以上のエントロピーを求め、ハッシュにした
 * パスワードは受け付けない（平文で渡すと、保存のときに SCRAM で暗号化される）
 */
export function generateRolePassword(): string {
  return randomBytes(32).toString('base64url');
}

/** ロールの名前を作る（app_xxxxxxxx・readonly_xxxxxxxx）。名前は本番の接続先の情報なので、リポジトリに書かない */
export function generateRoleName(prefix: 'app' | 'readonly'): string {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

/**
 * 管理者の接続 URL のユーザー名とパスワードだけを入れ替える（ホスト・DB 名・sslmode などはそのまま）。
 * クエリの user・password は pg がユーザー部より優先するので消す（残すと管理者のまま繋がる）
 */
export function buildRoleUrl(adminUrl: string, role: string, password: string): string {
  const url = new URL(adminUrl);
  url.searchParams.delete('user');
  url.searchParams.delete('password');
  url.username = role;
  url.password = password;
  return url.toString();
}

/**
 * public の表・ビュー（pg_class）。権限を調べる関数には名前ではなく OID を渡す（WHERE の絞り込みより先に関数が
 * pg_catalog の表で評価されると、'public.pg_statistic' のような無い名前を引いて失敗するため）
 */
const PUBLIC_RELATIONS = `SELECT c.oid, c.relname, c.relowner, c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`;

/** 引用符付きの識別子で並べる（public."Article", ...） */
function qualified(client: RoleQueryable, tables: string[]): string {
  return tables.map((t) => `public.${client.escapeIdentifier(t)}`).join(', ');
}

async function publicRelations(client: RoleQueryable): Promise<Set<string>> {
  const { rows } = await client.query<{ relname: string }>(PUBLIC_RELATIONS);
  return new Set(rows.map((r) => r.relname));
}

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
  /** マイグレーションの記録の名前の列を読める */
  canReadMigrationNames: boolean;
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
  const content = new Set(access.content);
  let migrationColumns = { names: false, logs: false };
  if (rows.some((r) => r.relname === '_prisma_migrations')) {
    const { rows: cols } = await client.query<{ names: boolean; logs: boolean }>(
      `SELECT has_column_privilege($1::name, 'public."_prisma_migrations"', 'migration_name', 'SELECT') AS names,
              has_column_privilege($1::name, 'public."_prisma_migrations"', 'logs', 'SELECT') AS logs`,
      [role]
    );
    migrationColumns = cols[0] ?? migrationColumns;
  }
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
    canReadMigrationNames: migrationColumns.names,
    canReadMigrationLogs: migrationColumns.logs,
  };
}

/** 一覧どおりの権限か（content はすべて読め、それ以外は読めず、どれも書けず、マイグレーションの記録は名前だけ読める） */
export function readonlyPrivilegesMatch(
  p: ReadonlyPrivileges,
  hasMigrationsTable: boolean
): boolean {
  return (
    p.unreadableContent === 0 &&
    p.unexpectedReadable === 0 &&
    p.writable === 0 &&
    !p.canReadMigrationLogs &&
    p.canReadMigrationNames === hasMigrationsTable
  );
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

/**
 * 現在のロール（マイグレーションを流す管理者）が後で作る表に、ログインできる一般のロール（アプリ用）が
 * 書き込める既定の権限があるか。無いと、マイグレーションで足した表をアプリが読み書きできない
 * （ALTER DEFAULT PRIVILEGES は、それを流したロールが作る表にだけ効く）
 */
export async function hasAppDefaultPrivileges(client: RoleQueryable): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_default_acl d
       JOIN pg_namespace n ON n.oid = d.defaclnamespace
       CROSS JOIN LATERAL aclexplode(d.defaclacl) a
       JOIN pg_roles g ON g.oid = a.grantee
       WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
         AND n.nspname = 'public' AND d.defaclobjtype = 'r'
         AND a.privilege_type = 'INSERT' AND g.rolcanlogin AND NOT g.rolsuper
     ) AS ok`
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
  readonly: ReadonlyGrantResult;
}

/**
 * アプリ用と読み取り用のログインロールを作り、権限を付ける。管理者（現在の DB の所有者）の接続で、トランザクションの中で呼ぶ。
 * アプリ用の既定の権限（ALTER DEFAULT PRIVILEGES）は、これを流したロールが後で作る表にだけ効くので、
 * マイグレーションを流すロール（MIGRATION_DATABASE_URL）と同じ管理者で流す
 */
export async function createProdRoles(
  client: RoleQueryable,
  input: CreateProdRolesInput
): Promise<CreateProdRolesResult> {
  const { rows: owner } = await client.query<{ owns_db: boolean; db: string }>(
    `SELECT d.datdba = (SELECT oid FROM pg_roles WHERE rolname = current_user) AS owns_db, current_database() AS db
     FROM pg_database d WHERE d.datname = current_database()`
  );
  if (!owner[0]?.owns_db) throw new RoleSetupError('not_db_owner');
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
  // 読み取り用は手元の調べ物で使う。開いたままのトランザクションがマイグレーションの ALTER を待たせないよう、
  // 時間の上限を付け、書き込めない既定にする（pg_dump は開始時に statement_timeout などを 0 にするので、同期は止まらない）
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
    `SELECT has_schema_privilege($1::name, 'public', 'CREATE') AS can_create,
            count(*) FILTER (WHERE has_table_privilege($1::name, t.oid, 'INSERT')
              AND has_table_privilege($1::name, t.oid, 'UPDATE')
              AND has_table_privilege($1::name, t.oid, 'DELETE'))::int AS writable,
            count(*)::int AS tables
     FROM (${PUBLIC_RELATIONS}) t
     WHERE t.relkind IN ('r', 'p') AND t.relname <> '_prisma_migrations'`,
    [input.appRole]
  );
  // PostgreSQL 14 以前は PUBLIC が public スキーマに表を作れる。アプリ用に表を作らせないため、その DB では止める
  if (check[0]?.can_create) throw new RoleSetupError('app_can_create_in_public');
  // 管理者が所有していない表への GRANT は、エラーにならず警告で終わる。黙って抜けた表があれば止める
  if (!check[0] || check[0].writable !== check[0].tables) {
    throw new RoleSetupError('app_missing_table_privileges');
  }
  if (!(await hasAppDefaultPrivileges(client))) {
    throw new RoleSetupError('app_default_privileges_missing');
  }

  const readonly = await applyReadonlyGrants(client, input.readonlyRole, input.access);
  return { appTables: check[0].writable, readonly };
}
