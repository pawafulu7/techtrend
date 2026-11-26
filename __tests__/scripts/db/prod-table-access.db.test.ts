/**
 * 本番 DB のロール分け（scripts/db/prod-db-roles.ts）を、テスト DB で確かめる。
 * テスト DB は、TCP の接続をパスワードで認証する（postgres の公式イメージの既定。docker-compose.test.yml・CI のサービス）
 * ことを前提に、作ったロールのパスワードでログインできるかも確かめる
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import {
  applyReadonlyGrants,
  assertReadonlyCandidate,
  buildRoleUrl,
  createProdRoles,
  generateRolePassword,
  hasAppDefaultPrivileges,
  inspectReadonlyPrivileges,
  loadTableAccess,
  readonlyPrivilegesMatch,
} from '@/scripts/db/prod-db-roles';

const url = process.env.DATABASE_URL;
const describeDb =
  url && /_test$/.test(new URL(url).pathname) ? describe : describe.skip;

type Privileges = {
  relname: string;
  can_select: boolean;
  can_select_any_column: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_truncate: boolean;
};

async function privilegesOf(client: Client, role: string): Promise<Map<string, Privileges>> {
  const { rows } = await client.query<Privileges>(
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

async function connectAs(role: string, password: string): Promise<Client> {
  const client = new Client({ connectionString: buildRoleUrl(url as string, role, password) });
  await client.connect();
  return client;
}

/** トランザクションの中で fn を流し、最後に必ず戻す */
async function inRolledBackTransaction(client: Client, fn: () => Promise<void>): Promise<void> {
  await client.query('BEGIN');
  try {
    await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}

describeDb('prod-table-access.json against the migrated test DB', () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: url });
    await admin.connect();
  });

  afterAll(async () => {
    await admin.end();
  });

  it('classifies every public table and view, and lists none that does not exist', async () => {
    const access = loadTableAccess();
    const listed = [...access.personal, ...access.content, ...access.metadata];
    const { rows } = await admin.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') ORDER BY 1`
    );
    const tables = rows.map((r) => r.relname);

    // 表を足したら、scripts/db/prod-table-access.json の personal（個人情報）か content に入れる
    expect(tables.filter((t) => !listed.includes(t))).toEqual([]);
    expect(listed.filter((t) => !tables.includes(t))).toEqual([]);
  });
});

describeDb('createProdRoles and applyReadonlyGrants (real test DB)', () => {
  const access = loadTableAccess();
  const suffix = randomBytes(4).toString('hex');
  const appRole = `test_app_${suffix}`;
  const readonlyRole = `test_readonly_${suffix}`;
  const appPassword = generateRolePassword();
  const readonlyPassword = generateRolePassword();
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: url });
    await admin.connect();
    await admin.query('BEGIN');
    const result = await createProdRoles(admin, {
      appRole,
      appPassword,
      readonlyRole,
      readonlyPassword,
      access,
    });
    await admin.query('COMMIT');
    expect(result.readonly).toEqual({
      granted: access.content.length + 1,
      missing: 0,
      unclassified: 0,
      hasMigrationsTable: true,
    });
  });

  afterAll(async () => {
    try {
      // 途中で失敗したトランザクションが残っていると、後片付けの文が通らない
      await admin.query('ROLLBACK').catch(() => undefined);
      for (const role of [appRole, readonlyRole]) {
        const ident = admin.escapeIdentifier(role);
        await admin.query(`DROP OWNED BY ${ident}`).catch(() => undefined);
        await admin.query(`DROP ROLE IF EXISTS ${ident}`);
      }
    } finally {
      await admin.end();
    }
  });

  it('lets the app role read and write every table except the migration history', async () => {
    const privileges = await privilegesOf(admin, appRole);
    for (const [table, p] of privileges) {
      const expected =
        table === '_prisma_migrations'
          ? { can_select_any_column: false, can_insert: false, can_update: false, can_delete: false }
          : { can_select: true, can_insert: true, can_update: true, can_delete: true };
      expect({ table, ...p }).toMatchObject({ table, ...expected, can_truncate: false });
    }
  });

  it('does not let the app role change the schema or manage roles', async () => {
    const { rows } = await admin.query<{
      can_create: boolean;
      privileged: boolean;
      owns_tables: boolean;
    }>(
      `SELECT has_schema_privilege($1::name, 'public', 'CREATE') AS can_create,
              (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication) AS privileged,
              EXISTS (SELECT 1 FROM pg_tables WHERE tableowner = $1::name) AS owns_tables
       FROM pg_roles WHERE rolname = $1::name`,
      [appRole]
    );
    expect(rows[0]).toEqual({ can_create: false, privileged: false, owns_tables: false });
    await expect(hasAppDefaultPrivileges(admin)).resolves.toBe(true);
  });

  it('runs the app writes that fire triggers, as the app role', async () => {
    const app = await connectAs(appRole, appPassword);
    try {
      await inRolledBackTransaction(app, async () => {
        const sourceId = `test-src-${suffix}`;
        const articleId = `test-art-${suffix}`;
        await app.query(
          `INSERT INTO "Source" (id, name, type, url, "updatedAt") VALUES ($1, $2, 'RSS', $3, now())`,
          [sourceId, `Role test ${suffix}`, `https://example.test/${suffix}`]
        );
        await app.query(
          `INSERT INTO "Article" (id, title, url, "publishedAt", "sourceId", "updatedAt", summary, content)
           VALUES ($1, 'title', $2, now(), $3, now(), 'summary', 'content')`,
          [articleId, `https://example.test/${suffix}/a`, sourceId]
        );
        // 要約を消すと、トリガーが ArticleEmbedding の行を消す。本文を変えると、トリガーが本文の長さを書き直す
        await app.query(
          `UPDATE "Article" SET summary = NULL, content = 'longer content' WHERE id = $1`,
          [articleId]
        );
        const { rows } = await app.query<{ length: number }>(
          `SELECT "contentLength" AS length FROM "Article" WHERE id = $1`,
          [articleId]
        );
        expect(rows[0].length).toBe('longer content'.length);
        await app.query(`DELETE FROM "Article" WHERE id = $1`, [articleId]);
      });
    } finally {
      await app.end();
    }
  });

  it('lets the readonly role read only the content tables and the migration names', async () => {
    const privileges = await privilegesOf(admin, readonlyRole);
    const content = new Set(access.content);
    for (const [table, p] of privileges) {
      expect({ table, ...p }).toMatchObject({
        table,
        can_select: content.has(table),
        can_select_any_column: content.has(table) || table === '_prisma_migrations',
        can_insert: false,
        can_update: false,
        can_delete: false,
        can_truncate: false,
      });
    }
    const inspected = await inspectReadonlyPrivileges(admin, readonlyRole, access);
    expect(inspected).toMatchObject({
      canReadMigrationNames: true,
      canReadMigrationLogs: false,
      unexpectedReadable: 0,
      writable: 0,
    });
    expect(readonlyPrivilegesMatch(inspected, true)).toBe(true);
  });

  it('gives the app role, but not the readonly role, tables created later by the owner', async () => {
    const table = `tmp_default_acl_${suffix}`;
    await inRolledBackTransaction(admin, async () => {
      await admin.query(`CREATE TABLE public.${admin.escapeIdentifier(table)} (id int)`);
      const { rows } = await admin.query<{ app: boolean; readonly: boolean }>(
        `SELECT has_table_privilege($1::name, format('public.%I', $3::text), 'INSERT') AS app,
                has_table_privilege($2::name, format('public.%I', $3::text), 'SELECT') AS readonly`,
        [appRole, readonlyRole, table]
      );
      expect(rows[0]).toEqual({ app: true, readonly: false });
    });
  });

  it('logs in with the generated passwords, reads as the readonly role, and rejects a wrong password', async () => {
    const app = await connectAs(appRole, appPassword);
    try {
      const { rows } = await app.query<{ who: string }>('SELECT current_user AS who');
      expect(rows[0].who).toBe(appRole);
      await expect(
        app.query('SELECT migration_name FROM "_prisma_migrations" LIMIT 1')
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await app.end();
    }

    const readonly = await connectAs(readonlyRole, readonlyPassword);
    try {
      await expect(readonly.query('SELECT count(*) FROM "Article"')).resolves.toBeDefined();
      await expect(
        readonly.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"')
      ).resolves.toBeDefined();
      for (const sql of [
        'SELECT logs FROM "_prisma_migrations"',
        'SELECT count(*) FROM "User"',
        'SELECT count(*) FROM "SocialPost"',
      ]) {
        await expect(readonly.query(sql)).rejects.toMatchObject({ code: '42501' });
      }
      const { rows } = await readonly.query<{ read_only: string }>(
        `SELECT current_setting('default_transaction_read_only') AS read_only`
      );
      expect(rows[0].read_only).toBe('on');
      // 書き込めない既定（25006）か権限（42501）で止まる
      await expect(
        readonly.query(`UPDATE "Article" SET title = title WHERE false`)
      ).rejects.toMatchObject({ code: expect.stringMatching(/^(42501|25006)$/) });
    } finally {
      await readonly.end();
    }

    await expect(connectAs(appRole, 'wrong-password')).rejects.toMatchObject({
      code: '28P01',
    });
  });

  it('revokes readonly grants that the list no longer allows', async () => {
    const ro = admin.escapeIdentifier(readonlyRole);
    await inRolledBackTransaction(admin, async () => {
      await admin.query(`GRANT SELECT ON public."User" TO ${ro}`);
      await admin.query(`GRANT SELECT (logs) ON public."_prisma_migrations" TO ${ro}`);
      const result = await applyReadonlyGrants(admin, readonlyRole, {
        ...access,
        content: access.content.filter((t) => t !== 'Tag'),
      });
      expect(result.unclassified).toBe(1);
      const privileges = await privilegesOf(admin, readonlyRole);
      expect(privileges.get('User')?.can_select_any_column).toBe(false);
      expect(privileges.get('Tag')?.can_select_any_column).toBe(false);
      expect(privileges.get('Article')?.can_select).toBe(true);
      const inspected = await inspectReadonlyPrivileges(admin, readonlyRole, access);
      expect(inspected.canReadMigrationLogs).toBe(false);
    });
  });

  it('fails when a personal table stays readable through PUBLIC', async () => {
    await inRolledBackTransaction(admin, async () => {
      await admin.query(`GRANT SELECT ON public."User" TO PUBLIC`);
      await expect(applyReadonlyGrants(admin, readonlyRole, access)).rejects.toMatchObject({
        reason: 'readonly_privileges_mismatch',
      });
    });
  });

  it('refuses roles that are not plain, unprivileged login roles as the readonly role', async () => {
    await expect(assertReadonlyCandidate(admin, appRole)).rejects.toMatchObject({
      reason: 'role_can_write',
    });
    const { rows } = await admin.query<{ me: string }>('SELECT current_user AS me');
    await expect(assertReadonlyCandidate(admin, rows[0].me)).rejects.toMatchObject({
      reason: 'role_privileged',
    });
    await expect(assertReadonlyCandidate(admin, `missing_${suffix}`)).rejects.toMatchObject({
      reason: 'role_missing',
    });
    await inRolledBackTransaction(admin, async () => {
      const name = (kind: string) => `test_${kind}_${suffix}`;
      const ident = (kind: string) => admin.escapeIdentifier(name(kind));
      const table = `public.${admin.escapeIdentifier(`tmp_owned_${suffix}`)}`;
      await admin.query(`CREATE ROLE ${ident('nologin')} NOLOGIN`);
      await admin.query(`CREATE ROLE ${ident('member')} LOGIN`);
      await admin.query(`GRANT pg_read_all_data TO ${ident('member')}`);
      await admin.query(`CREATE ROLE ${ident('owner')} LOGIN`);
      await admin.query(`CREATE TABLE ${table} (id int)`);
      await admin.query(`ALTER TABLE ${table} OWNER TO ${ident('owner')}`);
      await expect(assertReadonlyCandidate(admin, name('nologin'))).rejects.toMatchObject({
        reason: 'role_cannot_login',
      });
      await expect(assertReadonlyCandidate(admin, name('member'))).rejects.toMatchObject({
        reason: 'role_is_member_of_other_roles',
      });
      await expect(assertReadonlyCandidate(admin, name('owner'))).rejects.toMatchObject({
        reason: 'role_owns_tables',
      });
    });
  });

  it('refuses to create roles unless connected as the database owner, or when a role exists', async () => {
    const app = await connectAs(appRole, appPassword);
    try {
      await expect(
        createProdRoles(app, {
          appRole: `test_app2_${suffix}`,
          appPassword,
          readonlyRole: `test_readonly2_${suffix}`,
          readonlyPassword,
          access,
        })
      ).rejects.toMatchObject({ reason: 'not_db_owner' });
    } finally {
      await app.end();
    }
    await inRolledBackTransaction(admin, async () => {
      await expect(
        createProdRoles(admin, {
          appRole,
          appPassword,
          readonlyRole: `test_readonly3_${suffix}`,
          readonlyPassword,
          access,
        })
      ).rejects.toMatchObject({ reason: 'role_exists' });
    });
  });
});
