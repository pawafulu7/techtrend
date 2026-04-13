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

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    const hashedPassword = await hashPassword(TEST_USER.password);

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO "User" (id, email, name, "emailVerified", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         "emailVerified" = EXCLUDED."emailVerified",
         "updatedAt" = NOW()
       RETURNING id`,
      [TEST_USER.id, TEST_USER.email, TEST_USER.name, true]
    );
    const userId = rows[0].id;

    // Upsert credential account with password
    await client.query(
      `INSERT INTO "Account" ("userId", "providerId", "accountId", password, "updatedAt")
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT ("providerId", "accountId") DO UPDATE SET
         password = EXCLUDED.password,
         "updatedAt" = NOW()`,
      [userId, 'credential', userId, hashedPassword]
    );

    console.log('Test user created/updated successfully');
    return true;
  } catch (error) {
    console.error('Failed to create/update test user:', error);
    return false;
  } finally {
    await client.end();
  }
}

/**
 * E2Eテスト用の管理者ユーザーをセットアップする
 */
export async function setupAdminUser() {
  const TEST_DATABASE_URL = resolveTestDbUrl();

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    const hashedPassword = await hashPassword(ADMIN_TEST_USER.password);

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO "User" (id, email, name, "emailVerified", role, "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         "emailVerified" = EXCLUDED."emailVerified",
         role = EXCLUDED.role,
         "updatedAt" = NOW()
       RETURNING id`,
      [ADMIN_TEST_USER.id, ADMIN_TEST_USER.email, ADMIN_TEST_USER.name, true, 'admin']
    );
    const userId = rows[0].id;

    // Upsert credential account with password
    await client.query(
      `INSERT INTO "Account" ("userId", "providerId", "accountId", password, "updatedAt")
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT ("providerId", "accountId") DO UPDATE SET
         password = EXCLUDED.password,
         "updatedAt" = NOW()`,
      [userId, 'credential', userId, hashedPassword]
    );

    console.log('Admin user created/updated successfully');
    return true;
  } catch (error) {
    console.error('Failed to create/update admin user:', error);
    return false;
  } finally {
    await client.end();
  }
}

/**
 * テストユーザーのクリーンアップ
 */
export async function cleanupTestUser() {
  const TEST_DATABASE_URL = resolveTestDbUrl();

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    await client.query(
      `DELETE FROM "User" WHERE email = $1`,
      [TEST_USER.email]
    );

    console.log('Test user cleaned up successfully');
    return true;
  } catch (error) {
    console.error('Failed to cleanup test user:', error);
    return false;
  } finally {
    await client.end();
  }
}

/**
 * 管理者ユーザーのクリーンアップ
 */
export async function cleanupAdminUser() {
  const TEST_DATABASE_URL = resolveTestDbUrl();

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    await client.query(
      `DELETE FROM "User" WHERE email = $1`,
      [ADMIN_TEST_USER.email]
    );

    console.log('Admin user cleaned up successfully');
    return true;
  } catch (error) {
    console.error('Failed to cleanup admin user:', error);
    return false;
  } finally {
    await client.end();
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
