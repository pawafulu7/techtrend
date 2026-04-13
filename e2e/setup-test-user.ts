import pg from 'pg';
import { hashPassword } from '@better-auth/utils/password';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TEST_USER, ADMIN_TEST_USER } from './utils/e2e-helpers';

// TEST_DATABASE_URL が未設定のときのみ .env.test を読み込む
if (!process.env.TEST_DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
}

// テスト用DB URL解決ヘルパー
const resolveTestDbUrl = () => {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL か DATABASE_URL を設定してください（ハードコード禁止）');
  }
  return url;
};

// 接続文字列をマスクしてセキュアにログ出力するヘルパー
const maskConnectionString = (url: string): string => {
  try {
    const parsed = new URL(url);
    const maskedPassword = parsed.password ? '***' : '';
    return `${parsed.protocol}//${parsed.username}:${maskedPassword}@${parsed.hostname}:${parsed.port}${parsed.pathname}`;
  } catch {
    return 'Invalid URL format';
  }
};

/**
 * E2Eテスト用のユーザーをセットアップする
 * pg.Pool を使用してデータベースに直接接続
 */
export async function setupTestUser() {
  // テスト用データベースURLを明示的に指定
  const TEST_DATABASE_URL = resolveTestDbUrl();

  // セキュアなデバッグ出力（パスワードをマスク）
  if (process.env.DEBUG_E2E) {
    console.log('🔍 Database connection info (DEBUG mode):');
    console.log('  TEST_DATABASE_URL from env:', process.env.TEST_DATABASE_URL ? maskConnectionString(process.env.TEST_DATABASE_URL) : 'Not set');
    console.log('  Using connection string:', maskConnectionString(TEST_DATABASE_URL));
    console.log('  DATABASE_URL from env:', process.env.DATABASE_URL ? maskConnectionString(process.env.DATABASE_URL) : 'Not set');
  }

  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

  try {
    // Hash the password (Better Auth uses scrypt via @better-auth/utils)
    const hashedPassword = await hashPassword(TEST_USER.password);

    // Upsert test user (Better Auth schema: password in Account table)
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO "User" (id, email, name, "emailVerified")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         "emailVerified" = EXCLUDED."emailVerified"
       RETURNING id`,
      [TEST_USER.id, TEST_USER.email, TEST_USER.name, true]
    );
    const userId = rows[0].id;

    // Upsert credential account with password
    await pool.query(
      `INSERT INTO "Account" ("userId", "providerId", "accountId", password)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("providerId", "accountId") DO UPDATE SET
         password = EXCLUDED.password`,
      [userId, 'credential', userId, hashedPassword]
    );

    console.log('Test user created/updated successfully');
    return true;
  } catch (error) {
    console.error('Failed to create/update test user:', error);
    return false;
  } finally {
    await pool.end();
  }
}

/**
 * E2Eテスト用の管理者ユーザーをセットアップする
 * pg.Pool を使用してデータベースに直接接続
 */
export async function setupAdminUser() {
  const TEST_DATABASE_URL = resolveTestDbUrl();

  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

  try {
    const hashedPassword = await hashPassword(ADMIN_TEST_USER.password);

    // Upsert admin user (Better Auth schema: password in Account table)
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO "User" (id, email, name, "emailVerified", role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         "emailVerified" = EXCLUDED."emailVerified",
         role = EXCLUDED.role
       RETURNING id`,
      [ADMIN_TEST_USER.id, ADMIN_TEST_USER.email, ADMIN_TEST_USER.name, true, 'admin']
    );
    const userId = rows[0].id;

    // Upsert credential account with password
    await pool.query(
      `INSERT INTO "Account" ("userId", "providerId", "accountId", password)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("providerId", "accountId") DO UPDATE SET
         password = EXCLUDED.password`,
      [userId, 'credential', userId, hashedPassword]
    );

    console.log('Admin user created/updated successfully');
    return true;
  } catch (error) {
    console.error('Failed to create/update admin user:', error);
    return false;
  } finally {
    await pool.end();
  }
}

/**
 * テストユーザーのクリーンアップ
 */
export async function cleanupTestUser() {
  // テスト用データベースURLを明示的に指定
  const TEST_DATABASE_URL = resolveTestDbUrl();

  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

  try {
    // Delete test user if exists
    await pool.query(
      `DELETE FROM "User" WHERE email = $1`,
      [TEST_USER.email]
    );

    console.log('Test user cleaned up successfully');
    return true;
  } catch (error) {
    console.error('Failed to cleanup test user:', error);
    return false;
  } finally {
    await pool.end();
  }
}

/**
 * 管理者ユーザーのクリーンアップ
 */
export async function cleanupAdminUser() {
  const TEST_DATABASE_URL = resolveTestDbUrl();

  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

  try {
    await pool.query(
      `DELETE FROM "User" WHERE email = $1`,
      [ADMIN_TEST_USER.email]
    );

    console.log('Admin user cleaned up successfully');
    return true;
  } catch (error) {
    console.error('Failed to cleanup admin user:', error);
    return false;
  } finally {
    await pool.end();
  }
}

// CLIから直接実行された場合の処理
if (require.main === module) {
  setupTestUser()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}
