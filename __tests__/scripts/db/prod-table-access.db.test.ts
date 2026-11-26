/**
 * 本番 DB のロール分け（scripts/db/prod-db-roles.ts・readonly-grants.ts）を、テスト DB で確かめる。
 * テスト DB は、TCP の接続をパスワードで認証する（postgres の公式イメージの既定。docker-compose.test.yml・CI のサービス）
 * ことを前提に、作ったロールのパスワードでログインできるかも確かめる
 */
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import {
  applyReadonlyGrants,
  assertReadonlyCandidate,
  createProdRoles,
  generateRolePassword,
  hasAppDefaultPrivileges,
  inspectReadonlyPrivileges,
  loadTableAccess,
  markedReadonlyRoles,
  PERSONAL_RECORD_PREFIX,
  READONLY_ROLE_MARK,
  readonlyPrivilegesMatch,
  recordedPersonalTables,
} from '@/scripts/db/prod-db-roles';
import {
  connectAs,
  describeTestDb,
  dropRoles,
  inRolledBackTransaction,
  privilegesOf,
  testDatabaseUrl,
} from '@/__tests__/helpers/prod-db-roles';

describeTestDb('prod-table-access.json against the migrated test DB', () => {
  it('classifies every public table and view, and lists none that does not exist', async () => {
    const admin = new Client({ connectionString: testDatabaseUrl });
    await admin.connect();
    try {
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
    } finally {
      await admin.end();
    }
  });
});

describeTestDb('createProdRoles and applyReadonlyGrants (real test DB)', () => {
  const access = loadTableAccess();
  const suffix = randomBytes(4).toString('hex');
  const appRole = `test_app_${suffix}`;
  const readonlyRole = `test_readonly_${suffix}`;
  const appPassword = generateRolePassword();
  const readonlyPassword = generateRolePassword();
  let admin: Client;
  const ro = () => admin.escapeIdentifier(readonlyRole);
  /** 新しい一覧で Tag を personal に移したビルドが、DB に記録を残した後の状態にする */
  const recordTagAsPersonal = async () => {
    const record = `${PERSONAL_RECORD_PREFIX}${JSON.stringify([...access.personal, 'Tag'].sort())}`;
    await admin.query(`COMMENT ON DATABASE techtrend_test IS ${admin.escapeLiteral(record)}`);
  };

  beforeAll(async () => {
    admin = new Client({ connectionString: testDatabaseUrl });
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
      await dropRoles(admin, [appRole, readonlyRole]);
      // 記録は DB に残るので、ほかの実行（personal から content に戻した一覧など）の邪魔にならないよう消す
      await admin.query('COMMENT ON DATABASE techtrend_test IS NULL');
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

  it('lets the readonly role read only the content tables and the migration status, and marks and records it', async () => {
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
      canReadMigrationColumns: true,
      canReadMigrationLogs: false,
      canCreateObjects: false,
    });
    expect(readonlyPrivilegesMatch(inspected, true)).toBe(true);
    await expect(recordedPersonalTables(admin)).resolves.toEqual([...access.personal].sort());
    await expect(markedReadonlyRoles(admin)).resolves.toContain(readonlyRole);
    const { rows } = await admin.query<{ comment: string }>(
      `SELECT shobj_description(oid, 'pg_authid') AS comment FROM pg_roles WHERE rolname = $1::name`,
      [readonlyRole]
    );
    expect(rows[0].comment).toBe(READONLY_ROLE_MARK);
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

    await expect(connectAs(appRole, 'wrong-password')).rejects.toMatchObject({ code: '28P01' });
  });

  it('revokes readonly grants that the list no longer allows', async () => {
    await inRolledBackTransaction(admin, async () => {
      await admin.query(`GRANT SELECT ON public."User" TO ${ro()}`);
      await admin.query(`GRANT SELECT (logs) ON public."_prisma_migrations" TO ${ro()}`);
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

  it('keeps every table already in the record when it writes the record back', async () => {
    await inRolledBackTransaction(admin, async () => {
      // 表ごと消した後も、記録には残す（一覧から消えても、同じ名前の表を content で作り直したときに止めるため）
      const record = `${PERSONAL_RECORD_PREFIX}${JSON.stringify([...access.personal, 'DroppedTable'].sort())}`;
      await admin.query(`COMMENT ON DATABASE techtrend_test IS ${admin.escapeLiteral(record)}`);
      await applyReadonlyGrants(admin, readonlyRole, access);
      await expect(recordedPersonalTables(admin)).resolves.toContain('DroppedTable');
    });
  });

  it('only revokes before migrations: it takes away personal tables but makes nothing newly readable', async () => {
    await inRolledBackTransaction(admin, async () => {
      await admin.query(`GRANT SELECT ON public."User" TO ${ro()}`);
      await admin.query(`REVOKE SELECT ON public."Tag" FROM ${ro()}`);
      const result = await applyReadonlyGrants(admin, readonlyRole, access, 'revoke');
      expect(result.granted).toBe(0);
      const privileges = await privilegesOf(admin, readonlyRole);
      expect(privileges.get('User')?.can_select_any_column).toBe(false);
      expect(privileges.get('Tag')?.can_select).toBe(false);
      expect(privileges.get('Article')?.can_select).toBe(true);
    });
  });

  it('refuses an older list that puts a recorded personal table back into content, even for a re-created role', async () => {
    const newRole = `test_readonly4_${suffix}`;
    await inRolledBackTransaction(admin, async () => {
      await recordTagAsPersonal();
      await admin.query(`REVOKE SELECT ON public."Tag" FROM ${ro()}`);
      // Tag を content に置いたままの古い一覧。権限は変えずに止まる
      await expect(applyReadonlyGrants(admin, readonlyRole, access)).rejects.toMatchObject({
        reason: 'content_table_recorded_as_personal',
      });
      expect((await privilegesOf(admin, readonlyRole)).get('Tag')?.can_select_any_column).toBe(false);
      // 古い作業環境でロールを作り直しても、記録は DB にあるので止まる
      await admin.query(`CREATE ROLE ${admin.escapeIdentifier(newRole)} LOGIN`);
      await expect(applyReadonlyGrants(admin, newRole, access)).rejects.toMatchObject({
        reason: 'content_table_recorded_as_personal',
      });
    });
  });

  it('fails when a personal table stays readable through PUBLIC, or objects can be created', async () => {
    for (const grant of [
      `GRANT SELECT ON public."User" TO PUBLIC`,
      `GRANT CREATE ON SCHEMA public TO PUBLIC`,
      `GRANT CREATE ON DATABASE techtrend_test TO PUBLIC`,
    ]) {
      await inRolledBackTransaction(admin, async () => {
        await admin.query(grant);
        await expect(applyReadonlyGrants(admin, readonlyRole, access)).rejects.toMatchObject({
          reason: 'readonly_privileges_mismatch',
        });
      });
    }
    await inRolledBackTransaction(admin, async () => {
      await admin.query(`REVOKE SELECT (finished_at) ON public."_prisma_migrations" FROM ${ro()}`);
      const inspected = await inspectReadonlyPrivileges(admin, readonlyRole, access);
      expect(inspected.canReadMigrationColumns).toBe(false);
      expect(readonlyPrivilegesMatch(inspected, true)).toBe(false);
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
      for (const [kind, reason] of [
        ['nologin', 'role_cannot_login'],
        ['member', 'role_is_member_of_other_roles'],
        ['owner', 'role_owns_tables'],
      ]) {
        await expect(assertReadonlyCandidate(admin, name(kind))).rejects.toMatchObject({ reason });
      }
    });
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
      await admin.query(`GRANT CREATE ON DATABASE techtrend_test TO PUBLIC`);
      await expect(createProdRoles(admin, input)).rejects.toMatchObject({
        reason: 'app_can_create_objects',
      });
    });
  });
});
