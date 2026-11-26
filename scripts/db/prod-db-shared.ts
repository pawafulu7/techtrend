/**
 * 本番 DB のロール分け（prod-db-roles.ts・readonly-grants.ts）と、それを使うスクリプトの共通の部品。
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

/** 手元用のログインのロールとして断る理由（readonly-grants.ts の SQL の CASE が返す値） */
export const READONLY_CANDIDATE_REASONS = [
  'role_missing',
  'role_cannot_login',
  'role_privileged',
  'role_is_current_user',
  'role_not_only_in_readonly_group',
  'role_has_direct_grants',
  'role_owns_tables',
  'role_can_write',
] as const;

/**
 * 失敗の理由。決まった文字列だけにする（画面に出すので、ロールの名前などを入れられないよう型で止める）。
 * 英小文字と _ だけなので、`名前=値` の出力の絞り込みを通る形で出せる
 */
export type RoleSetupReason =
  | (typeof READONLY_CANDIDATE_REASONS)[number]
  | 'readonly_group_missing'
  | 'readonly_group_not_grantable'
  | 'readonly_privileges_mismatch'
  | 'not_db_owner'
  | 'role_exists'
  | 'app_can_create_objects'
  | 'app_missing_table_privileges'
  | 'app_default_privileges_missing';

export class RoleSetupError extends Error {
  constructor(readonly reason: RoleSetupReason) {
    super(reason);
    this.name = 'RoleSetupError';
  }
}

/** pg の Client が code を付けないエラーのうち、決まった文のもの（接続先を含まないので、理由として出せる） */
const PG_MESSAGE_REASONS = new Map<string, string>([
  ['Query read timeout', 'query_timeout'],
  ['timeout expired', 'connect_timeout'],
  ['Connection terminated unexpectedly', 'connection_terminated'],
  ['Connection terminated', 'connection_terminated'],
]);

/**
 * 出力してよい失敗の理由。RoleSetupError の理由、PostgreSQL・Node のエラーコード、pg の決まった文のどれか。
 * どれでもなければ unknown（メッセージには接続先やロールの名前が入りうるので、そのまま出さない）
 */
export function errorReason(error: unknown): string {
  if (error instanceof RoleSetupError) return error.reason;
  if (typeof error !== 'object' || error === null) return 'unknown';
  const code = 'code' in error ? error.code : undefined;
  if (typeof code === 'string' && /^[A-Za-z0-9_]+$/.test(code)) return `code_${code}`;
  const message = 'message' in error ? error.message : undefined;
  return (typeof message === 'string' && PG_MESSAGE_REASONS.get(message)) || 'unknown';
}

/**
 * スクリプト用の接続。接続と問い合わせの待ち時間に上限を付ける（サーバーの statement_timeout は、通信が途絶えたときに
 * クライアントの待ちを止めないため、クライアント側にも付ける）。接続が途中で切れたときにプロセスごと落ちないよう
 * 'error' を受ける（受けないと pg が投げた 'error' で落ち、後始末が流れない）。失敗した query は reject される
 */
export function createScriptClient(connectionString: string): Client {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: 90_000,
  });
  client.on('error', () => undefined);
  return client;
}

/** prisma migrate が DB を排他する advisory lock の鍵（Prisma の schema engine の pg_advisory_lock(72707369)） */
export const PRISMA_MIGRATE_LOCK_KEY = 72707369;

/**
 * トランザクションの中で、ロックと文の待ち時間に上限を付け、prisma migrate と同じ鍵を取る（デプロイのマイグレーションと
 * 重ならないようにする。GRANT は public の表の pg_class の行を書き換えるので、並行する ALTER TABLE と衝突しうる）
 */
export async function beginRoleTransaction(client: RoleQueryable): Promise<void> {
  await client.query('BEGIN');
  await client.query(`SET LOCAL lock_timeout = '10s'`);
  await client.query(`SET LOCAL statement_timeout = '60s'`);
  await client.query('SELECT pg_advisory_xact_lock($1)', [PRISMA_MIGRATE_LOCK_KEY]);
}

export function loadTableAccess(): TableAccess {
  const { personal, content, metadata } = tableAccessJson;
  return { personal, content, metadata };
}

/** 読み取り用ロールが読める、マイグレーションの記録の列（失敗のログ logs は DB のエラーの値を含みうるので読ませない） */
export const READONLY_MIGRATION_COLUMNS: readonly string[] = [
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
export const PUBLIC_RELATIONS = `SELECT c.oid, c.relname, c.relowner, c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`;
