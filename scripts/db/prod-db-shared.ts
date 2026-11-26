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
export const PUBLIC_RELATIONS = `SELECT c.oid, c.relname, c.relowner, c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`;

/** 引用符付きの識別子で並べる（public."Article", ...） */
export function qualified(client: RoleQueryable, tables: string[]): string {
  return tables.map((t) => `public.${client.escapeIdentifier(t)}`).join(', ');
}

export async function publicRelations(client: RoleQueryable): Promise<Set<string>> {
  const { rows } = await client.query<{ relname: string }>(PUBLIC_RELATIONS);
  return new Set(rows.map((r) => r.relname));
}
