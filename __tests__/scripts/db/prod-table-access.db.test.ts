/**
 * 本番 DB のロール分け（prisma/migrations の techtrend_readonly、scripts/db/prod-db-roles.ts・readonly-grants.ts）を、
 * マイグレーション済みのテスト DB で確かめる。テスト DB は、TCP の接続をパスワードで認証する（postgres の公式イメージの
 * 既定。docker-compose.test.yml・CI のサービス）ことを前提に、作ったロールのパスワードでログインできるかも確かめる
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import {
  assertReadonlyCandidate,
  beginRoleTransaction,
  createProdRoles,
  generateRolePassword,
  hasAppDefaultPrivileges,
  inspectReadonlyPrivileges,
  loadTableAccess,
  READONLY_GROUP_ROLE,
  readonlyPrivilegesMatch,
} from '@/scripts/db/prod-db-roles';
import {
  connectAs,
  describeTestDb,
  dropRoles,
  inRolledBackTransaction,
  privilegesOf,
  testDatabaseUrl,
} from '@/__tests__/helpers/prod-db-roles';

const access = loadTableAccess();

describeTestDb('prod-table-access.json and techtrend_readonly against the migrated test DB', () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: testDatabaseUrl });
    await admin.connect();
  });

  afterAll(async () => {
    await admin.end();
  });

  it('classifies every public table and view, and lists none that does not exist', async () => {
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

  it('gives techtrend_readonly exactly the content tables and the migration status, through migrations', async () => {
    const { rows } = await admin.query<{ login: boolean; privileged: boolean }>(
      `SELECT rolcanlogin AS login,
              (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication) AS privileged
       FROM pg_roles WHERE rolname = $1`,
      [READONLY_GROUP_ROLE]
    );
    expect(rows).toEqual([{ login: false, privileged: false }]);
    const privileges = await privilegesOf(admin, READONLY_GROUP_ROLE);
    const content = new Set(access.content);
    // content の表を足したマイグレーションでは GRANT SELECT ... TO techtrend_readonly を書き、personal に移すときは REVOKE する
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
    const inspected = await inspectReadonlyPrivileges(admin, READONLY_GROUP_ROLE, access);
    expect(inspected).toMatchObject({
      canReadMigrationColumns: true,
      canReadMigrationLogs: false,
      canCreateObjects: false,
      unexpectedReadable: 0,
      unreadableContentSequences: 0,
      unexpectedReadableSequences: 0,
      writable: 0,
      executableSecurityDefiner: 0,
    });
    expect(readonlyPrivilegesMatch(inspected, true)).toBe(true);
  });

  it('detects extra reads, writes, creating objects, and missing migration columns', async () => {
    const group = admin.escapeIdentifier(READONLY_GROUP_ROLE);
    const { rows } = await admin.query<{ db: string }>('SELECT current_database() AS db');
    const missed: string[] = [];
    for (const grant of [
      `GRANT SELECT ON public."User" TO ${group}`,
      `GRANT SELECT ON public."User" TO PUBLIC`,
      `GRANT SELECT (email) ON public."User" TO ${group}`,
      `GRANT TRIGGER ON public."Article" TO ${group}`,
      `GRANT UPDATE (title) ON public."Article" TO ${group}`,
      // 所有者の権限で動く関数（新しい関数は既定で PUBLIC が呼べる）
      `CREATE FUNCTION public.tmp_definer() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS 'SELECT count(*) FROM "User"'`,
      `GRANT CREATE ON SCHEMA public TO PUBLIC`,
      `GRANT CREATE ON DATABASE ${admin.escapeIdentifier(rows[0].db)} TO PUBLIC`,
      `GRANT SELECT (logs) ON public."_prisma_migrations" TO ${group}`,
      `REVOKE SELECT (finished_at) ON public."_prisma_migrations" FROM ${group}`,
      `REVOKE SELECT ON public."Tag" FROM ${group}`,
    ]) {
      await inRolledBackTransaction(admin, async () => {
        await admin.query(grant);
        const inspected = await inspectReadonlyPrivileges(admin, READONLY_GROUP_ROLE, access);
        if (readonlyPrivilegesMatch(inspected, true)) missed.push(grant);
      });
    }
    // 見逃したものを、まとめて出す
    expect(missed).toEqual([]);
  });

  it('requires the sequences of content tables to be readable, and no other sequence', async () => {
    const group = admin.escapeIdentifier(READONLY_GROUP_ROLE);
    // content の表にシーケンスを足したのに、マイグレーションで GRANT SELECT ON SEQUENCE を書き忘れたもの
    await inRolledBackTransaction(admin, async () => {
      await admin.query(`CREATE SEQUENCE public."tmp_content_seq" OWNED BY public."Tag"."id"`);
      const missing = await inspectReadonlyPrivileges(admin, READONLY_GROUP_ROLE, access);
      expect(missing).toMatchObject({ unreadableContentSequences: 1, unexpectedReadableSequences: 0 });
      expect(readonlyPrivilegesMatch(missing, true)).toBe(false);
      await admin.query(`GRANT SELECT ON SEQUENCE public."tmp_content_seq" TO ${group}`);
      expect(
        readonlyPrivilegesMatch(await inspectReadonlyPrivileges(admin, READONLY_GROUP_ROLE, access), true)
      ).toBe(true);
      // 値を進められる（nextval）と、書き込めるものに数える
      await admin.query(`GRANT USAGE ON SEQUENCE public."tmp_content_seq" TO ${group}`);
      const writable = await inspectReadonlyPrivileges(admin, READONLY_GROUP_ROLE, access);
      expect(writable).toMatchObject({ writable: 1 });
      expect(readonlyPrivilegesMatch(writable, true)).toBe(false);
    });
    for (const owned of [' OWNED BY public."User"."id"', '']) {
      await inRolledBackTransaction(admin, async () => {
        await admin.query(`CREATE SEQUENCE public."tmp_other_seq"${owned}`);
        await admin.query(`GRANT SELECT ON SEQUENCE public."tmp_other_seq" TO ${group}`);
        const extra = await inspectReadonlyPrivileges(admin, READONLY_GROUP_ROLE, access);
        expect({ owned, ...extra }).toMatchObject({ owned, unexpectedReadableSequences: 1 });
        expect(readonlyPrivilegesMatch(extra, true)).toBe(false);
      });
    }
  });
});

describeTestDb('createProdRoles (real test DB)', () => {
  const suffix = randomBytes(4).toString('hex');
  const appRole = `test_app_${suffix}`;
  const readonlyRole = `test_readonly_${suffix}`;
  const appPassword = generateRolePassword();
  const readonlyPassword = generateRolePassword();
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: testDatabaseUrl });
    await admin.connect();
    await beginRoleTransaction(admin);
    const result = await createProdRoles(admin, {
      appRole,
      appPassword,
      readonlyRole,
      readonlyPassword,
      access,
    });
    await admin.query('COMMIT');
    expect(result.readonlyTables).toBe(access.content.length);
  });

  afterAll(async () => {
    try {
      await dropRoles(admin, [appRole, readonlyRole]);
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
      `SELECT (has_schema_privilege($1::name, 'public', 'CREATE')
                OR has_database_privilege($1::name, current_database(), 'CREATE')) AS can_create,
              (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication) AS privileged,
              EXISTS (SELECT 1 FROM pg_tables WHERE tableowner = $1::name) AS owns_tables
       FROM pg_roles WHERE rolname = $1::name`,
      [appRole]
    );
    expect(rows[0]).toEqual({ can_create: false, privileged: false, owns_tables: false });
    await expect(hasAppDefaultPrivileges(admin, appRole)).resolves.toBe(true);
    await expect(hasAppDefaultPrivileges(admin, readonlyRole)).resolves.toBe(false);
  });

  it('runs the app writes that fire triggers, as the app role', async () => {
    const app = await connectAs(appRole, appPassword);
    try {
      await inRolledBackTransaction(app, async () => {
        const [sourceId, articleId] = [`test-src-${suffix}`, `test-art-${suffix}`];
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

  it('makes the readonly role a member of techtrend_readonly only, with nothing of its own', async () => {
    await expect(assertReadonlyCandidate(admin, readonlyRole)).resolves.toBeUndefined();
    const inspected = await inspectReadonlyPrivileges(admin, readonlyRole, access);
    expect(readonlyPrivilegesMatch(inspected, true)).toBe(true);
    const { rows } = await admin.query<{ direct: number }>(
      `SELECT count(*)::int AS direct FROM information_schema.role_table_grants WHERE grantee = $1`,
      [readonlyRole]
    );
    expect(rows[0].direct).toBe(0);
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
      // 手元用のロール自身で調べる（npm run migrate:production:check と同じ）
      await expect(
        assertReadonlyCandidate(readonly, readonlyRole, { self: true })
      ).resolves.toBeUndefined();
      await expect(assertReadonlyCandidate(readonly, readonlyRole)).rejects.toMatchObject({
        reason: 'role_is_current_user',
      });
      const own = await inspectReadonlyPrivileges(readonly, readonlyRole, access);
      expect(readonlyPrivilegesMatch(own, true)).toBe(true);
      // 書き込めない既定（25006）で止まり、既定を外しても権限（42501）で止まる
      await expect(
        readonly.query(`UPDATE "Article" SET title = title WHERE false`)
      ).rejects.toMatchObject({ code: '25006' });
      await readonly.query('SET default_transaction_read_only = off');
      await expect(
        readonly.query(`UPDATE "Article" SET title = title WHERE false`)
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await readonly.end();
    }

    await expect(connectAs(appRole, 'wrong-password')).rejects.toMatchObject({ code: '28P01' });
  });

  it('refuses roles that are not plain members of techtrend_readonly as the readonly role', async () => {
    await expect(assertReadonlyCandidate(admin, appRole)).rejects.toMatchObject({
      reason: 'role_not_only_in_readonly_group',
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
      const group = admin.escapeIdentifier(READONLY_GROUP_ROLE);
      const table = `public.${admin.escapeIdentifier(`tmp_owned_${suffix}`)}`;
      await admin.query(`CREATE ROLE ${ident('nologin')} NOLOGIN IN ROLE ${group}`);
      await admin.query(`CREATE ROLE ${ident('member')} LOGIN IN ROLE ${group}`);
      await admin.query(`GRANT pg_read_all_data TO ${ident('member')}`);
      await admin.query(`CREATE ROLE ${ident('owner')} LOGIN IN ROLE ${group}`);
      await admin.query(`CREATE TABLE ${table} (id int)`);
      await admin.query(`ALTER TABLE ${table} OWNER TO ${ident('owner')}`);
      // 以前の版のスクリプトで作ったロールのように、表への権限を直接持つもの
      await admin.query(`CREATE ROLE ${ident('direct')} LOGIN IN ROLE ${group}`);
      await admin.query(`GRANT SELECT ON public."Article" TO ${ident('direct')}`);
      await admin.query(`CREATE ROLE ${ident('column')} LOGIN IN ROLE ${group}`);
      await admin.query(`GRANT SELECT (migration_name) ON public."_prisma_migrations" TO ${ident('column')}`);
      await admin.query(`CREATE ROLE ${ident('schema')} LOGIN IN ROLE ${group}`);
      await admin.query(`GRANT USAGE ON SCHEMA public TO ${ident('schema')}`);
      for (const [kind, reason] of [
        ['nologin', 'role_cannot_login'],
        ['member', 'role_not_only_in_readonly_group'],
        ['direct', 'role_has_direct_grants'],
        ['column', 'role_has_direct_grants'],
        ['schema', 'role_has_direct_grants'],
        ['owner', 'role_owns_tables'],
      ]) {
        await expect(assertReadonlyCandidate(admin, name(kind))).rejects.toMatchObject({ reason });
      }
      // PUBLIC への GRANT で書けるようになったもの
      await admin.query(`CREATE ROLE ${ident('writer')} LOGIN IN ROLE ${group}`);
      await admin.query(`GRANT INSERT ON public."Article" TO PUBLIC`);
      for (const [kind, reason] of [['writer', 'role_can_write']]) {
        await expect(assertReadonlyCandidate(admin, name(kind))).rejects.toMatchObject({ reason });
      }
    });
    // techtrend_readonly 自身が特権を持つ・ほかのロールに属すると、メンバーが SET ROLE で辿れる（権限を数えても現れない）
    const group = admin.escapeIdentifier(READONLY_GROUP_ROLE);
    const { rows: version } = await admin.query<{ pg16: boolean }>(
      `SELECT current_setting('server_version_num')::int >= 160000 AS pg16`
    );
    // 属しても権限を受け継がない形（PostgreSQL 16 からは GRANT の INHERIT FALSE、15 以前はロールの NOINHERIT）
    const memberWithoutInherit = version[0]?.pg16
      ? [`GRANT pg_read_all_data TO ${group} WITH INHERIT FALSE, SET TRUE`]
      : [`ALTER ROLE ${group} NOINHERIT`, `GRANT pg_read_all_data TO ${group}`];
    for (const changes of [
      memberWithoutInherit,
      [`ALTER ROLE ${group} CREATEDB`],
      [`ALTER ROLE ${group} LOGIN`],
    ]) {
      await inRolledBackTransaction(admin, async () => {
        for (const sql of changes) await admin.query(sql);
        await expect(assertReadonlyCandidate(admin, readonlyRole)).rejects.toMatchObject({
          reason: 'readonly_group_unsafe',
        });
        const privileges = await inspectReadonlyPrivileges(admin, readonlyRole, access);
        expect({ changes, ok: readonlyPrivilegesMatch(privileges, true) }).toEqual({ changes, ok: true });
      });
    }
  });

  it('refuses to create roles unless connected as the database owner, or when a role exists', async () => {
    const input = {
      appRole: `test_app2_${suffix}`,
      appPassword,
      readonlyRole: `test_readonly2_${suffix}`,
      readonlyPassword,
      access,
    };
    const app = await connectAs(appRole, appPassword);
    try {
      await expect(createProdRoles(app, input)).rejects.toMatchObject({ reason: 'not_db_owner' });
    } finally {
      await app.end();
    }
    await inRolledBackTransaction(admin, async () => {
      await expect(createProdRoles(admin, { ...input, appRole })).rejects.toMatchObject({
        reason: 'role_exists',
      });
    });
    await inRolledBackTransaction(admin, async () => {
      const { rows } = await admin.query<{ db: string }>('SELECT current_database() AS db');
      await admin.query(`GRANT CREATE ON DATABASE ${admin.escapeIdentifier(rows[0].db)} TO PUBLIC`);
      await expect(createProdRoles(admin, input)).rejects.toMatchObject({
        reason: 'app_can_create_objects',
      });
    });
    // マイグレーションの外で techtrend_readonly に個人情報の表の権限が付いていたら、作ったロールの確認で止まる
    await inRolledBackTransaction(admin, async () => {
      await admin.query(`GRANT SELECT ON public."User" TO ${admin.escapeIdentifier(READONLY_GROUP_ROLE)}`);
      await expect(createProdRoles(admin, input)).rejects.toMatchObject({
        reason: 'readonly_privileges_mismatch',
      });
    });
  });
});
