/**
 * 本番 DB のロール分け（scripts/db/prod-db-roles.ts）を、テスト DB で確かめるテストの補助
 */
import { Client } from 'pg';
import { buildRoleUrl } from '@/scripts/db/prod-db-roles';

export const testDatabaseUrl = process.env.DATABASE_URL;

/** テスト DB（名前が _test で終わる）のときだけ流す */
export const describeTestDb =
  testDatabaseUrl && /_test$/.test(new URL(testDatabaseUrl).pathname) ? describe : describe.skip;

export type TablePrivileges = {
  relname: string;
  can_select: boolean;
  can_select_any_column: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_truncate: boolean;
};

/** public の表・ビューごとの、role の実際の権限 */
export async function privilegesOf(
  client: Client,
  role: string
): Promise<Map<string, TablePrivileges>> {
  const { rows } = await client.query<TablePrivileges>(
    `SELECT c.relname,
            has_table_privilege($1::name, c.oid, 'SELECT') AS can_select,
            has_any_column_privilege($1::name, c.oid, 'SELECT') AS can_select_any_column,
            has_table_privilege($1::name, c.oid, 'INSERT') AS can_insert,
            has_table_privilege($1::name, c.oid, 'UPDATE') AS can_update,
            has_table_privilege($1::name, c.oid, 'DELETE') AS can_delete,
            has_table_privilege($1::name, c.oid, 'TRUNCATE') AS can_truncate
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`,
    [role]
  );
  return new Map(rows.map((r) => [r.relname, r]));
}

export async function connectAs(role: string, password: string): Promise<Client> {
  const client = new Client({
    connectionString: buildRoleUrl(testDatabaseUrl as string, role, password),
  });
  await client.connect();
  return client;
}

/** トランザクションの中で fn を流し、最後に必ず戻す */
export async function inRolledBackTransaction(
  client: Client,
  fn: () => Promise<void>
): Promise<void> {
  await client.query('BEGIN');
  try {
    await fn();
  } finally {
    // 戻しの失敗で、元のアサーションの失敗を隠さない
    await client.query('ROLLBACK').catch(() => undefined);
  }
}

/** ロールの権限と既定の権限を外して消す（後片付け。途中で失敗したトランザクションが残っていても通す） */
export async function dropRoles(client: Client, roles: string[]): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
  for (const role of roles) {
    const ident = client.escapeIdentifier(role);
    await client.query(`DROP OWNED BY ${ident}`).catch(() => undefined);
    await client.query(`DROP ROLE IF EXISTS ${ident}`);
  }
}
