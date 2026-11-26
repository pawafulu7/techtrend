/**
 * 本番 DB のロール分けの、DB を使わない部分（scripts/db/prod-db-roles.ts・migration-database-url.ts・prod-table-access.json）
 */
import { parse } from 'pg-connection-string';
import {
  buildRoleUrl,
  errorReason,
  generateRoleName,
  generateRolePassword,
  loadTableAccess,
  readonlyPrivilegesMatch,
  RoleSetupError,
} from '@/scripts/db/prod-db-roles';
import { migrationDatabaseUrl } from '@/scripts/db/migration-database-url';

describe('buildRoleUrl', () => {
  it('replaces only the user and password', () => {
    const url = buildRoleUrl(
      'postgresql://owner:old-secret@db.example.com:5432/appdb?sslmode=require&channel_binding=require',
      'app_0123abcd',
      'f'.repeat(64)
    );
    const parsed = new URL(url);
    expect(parsed.username).toBe('app_0123abcd');
    expect(parsed.password).toBe('f'.repeat(64));
    expect(parsed.host).toBe('db.example.com:5432');
    expect(parsed.pathname).toBe('/appdb');
    expect(parsed.searchParams.get('sslmode')).toBe('require');
    expect(parsed.searchParams.get('channel_binding')).toBe('require');
    expect(url).not.toContain('old-secret');
    expect(url).not.toContain('owner');
  });

  it('drops user and password given as query parameters, which pg would prefer', () => {
    const url = buildRoleUrl(
      'postgresql://db.example.com/appdb?user=owner&password=old-secret&sslmode=require',
      'readonly_0123abcd',
      'new-secret'
    );
    const config = parse(url);
    expect(config.user).toBe('readonly_0123abcd');
    expect(config.password).toBe('new-secret');
    expect(url).not.toContain('old-secret');
  });
});

describe('generateRolePassword / generateRoleName', () => {
  it('makes a 256-bit URL-safe password that survives the round trip through a connection URL', () => {
    const password = generateRolePassword();
    expect(password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateRolePassword()).not.toBe(password);
    const url = buildRoleUrl('postgresql://owner:x@db.example.com/appdb', 'app_0123abcd', password);
    expect(parse(url).password).toBe(password);
  });

  it('makes role names that need no quoting and differ each time', () => {
    expect(generateRoleName('app')).toMatch(/^app_[0-9a-f]{8}$/);
    expect(generateRoleName('readonly')).toMatch(/^readonly_[0-9a-f]{8}$/);
    expect(generateRoleName('app')).not.toBe(generateRoleName('app'));
  });
});

describe('errorReason', () => {
  it('returns fixed reasons and error codes only', () => {
    expect(errorReason(new RoleSetupError('not_db_owner'))).toBe('not_db_owner');
    expect(errorReason(Object.assign(new Error('role "app_x" does not exist'), { code: '42704' }))).toBe(
      'code_42704'
    );
    expect(errorReason(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe('code_ECONNREFUSED');
    expect(errorReason(Object.assign(new Error('x'), { code: 'bad code; drop' }))).toBe('unknown');
    expect(errorReason(new Error('postgresql://owner:secret@db.example.com/appdb'))).toBe('unknown');
    expect(errorReason('boom')).toBe('unknown');
  });
});

describe('readonlyPrivilegesMatch', () => {
  const ok = {
    readableContent: 20,
    unreadableContent: 0,
    unexpectedReadable: 0,
    writable: 0,
    canCreateObjects: false,
    canReadMigrationColumns: true,
    canReadMigrationLogs: false,
  };

  it('accepts exactly the listed privileges', () => {
    expect(readonlyPrivilegesMatch(ok, true)).toBe(true);
  });

  it('rejects any extra read, any write, creating objects, an unreadable content table, or wrong migration columns', () => {
    expect(readonlyPrivilegesMatch({ ...ok, unexpectedReadable: 1 }, true)).toBe(false);
    expect(readonlyPrivilegesMatch({ ...ok, writable: 1 }, true)).toBe(false);
    expect(readonlyPrivilegesMatch({ ...ok, canCreateObjects: true }, true)).toBe(false);
    expect(readonlyPrivilegesMatch({ ...ok, unreadableContent: 1 }, true)).toBe(false);
    expect(readonlyPrivilegesMatch({ ...ok, canReadMigrationLogs: true }, true)).toBe(false);
    expect(readonlyPrivilegesMatch({ ...ok, canReadMigrationColumns: false }, true)).toBe(false);
    expect(readonlyPrivilegesMatch({ ...ok, canReadMigrationColumns: false }, false)).toBe(true);
  });
});

describe('migrationDatabaseUrl', () => {
  const app = 'postgresql://app@db.example.com/appdb';
  const admin = 'postgresql://owner@db.example.com/appdb';
  const build = { USE_MIGRATION_DATABASE_URL: '1', VERCEL_ENV: 'production' };

  it('uses the admin URL only for the flagged command in a Vercel production build', () => {
    expect(migrationDatabaseUrl({ ...build, DATABASE_URL: app, MIGRATION_DATABASE_URL: admin })).toBe(
      admin
    );
  });

  it('ignores MIGRATION_DATABASE_URL without the flag or outside production builds', () => {
    expect(
      migrationDatabaseUrl({ VERCEL_ENV: 'production', DATABASE_URL: app, MIGRATION_DATABASE_URL: admin })
    ).toBe(app);
    expect(
      migrationDatabaseUrl({ ...build, VERCEL_ENV: 'preview', DATABASE_URL: app, MIGRATION_DATABASE_URL: admin })
    ).toBe(app);
    expect(
      migrationDatabaseUrl({ USE_MIGRATION_DATABASE_URL: '1', DATABASE_URL: app, MIGRATION_DATABASE_URL: admin })
    ).toBe(app);
  });

  it('stops before connecting when the admin URL is missing in a production build', () => {
    expect(() => migrationDatabaseUrl({ ...build, DATABASE_URL: app })).toThrow(
      /MIGRATION_DATABASE_URL is required/
    );
  });

  it('uses DATABASE_URL elsewhere, even when it is missing', () => {
    expect(migrationDatabaseUrl({ DATABASE_URL: app })).toBe(app);
    expect(migrationDatabaseUrl({})).toBeUndefined();
  });
});

describe('prod-table-access.json', () => {
  const access = loadTableAccess();

  it('lists each table once', () => {
    const all = [...access.personal, ...access.content, ...access.metadata];
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps the tables with personal data and per-user activity out of the readable list', () => {
    for (const table of [
      'User',
      'Account',
      'Session',
      'Verification',
      'GateAllowedEmail',
      'GateAccessRequest',
      'Inquiry',
      'UserDeletionLog',
      'SocialPost',
      'SocialPostAuditLog',
      'ArticleView',
      'Favorite',
      'Comment',
    ]) {
      expect(access.personal).toContain(table);
    }
    expect(access.metadata).toEqual(['_prisma_migrations']);
  });
});
