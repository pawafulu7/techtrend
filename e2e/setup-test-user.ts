import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
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
 * PrismaClientを使用してデータベースに直接接続
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
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: TEST_DATABASE_URL,
      },
    },
  });

  try {
    // Hash the password (use hashSync for bcryptjs)
    const hashedPassword = bcrypt.hashSync(TEST_USER.password, 10);

    // Upsert test user (create or update)
    await prisma.user.upsert({
      where: {
        email: TEST_USER.email,
      },
      update: {
        name: TEST_USER.name,
        password: hashedPassword,
        emailVerified: new Date(),
      },
      create: {
        id: TEST_USER.id,
        email: TEST_USER.email,
        name: TEST_USER.name,
        password: hashedPassword,
        emailVerified: new Date(),
      },
    });

    console.log('Test user created/updated successfully');
    return true;
  } catch (error) {
    console.error('Failed to create/update test user:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * E2Eテスト用の管理者ユーザーをセットアップする
 * PrismaClientを使用してデータベースに直接接続
 */
export async function setupAdminUser() {
  const TEST_DATABASE_URL = resolveTestDbUrl();

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: TEST_DATABASE_URL,
      },
    },
  });

  try {
    const hashedPassword = bcrypt.hashSync(ADMIN_TEST_USER.password, 10);

    await prisma.user.upsert({
      where: {
        email: ADMIN_TEST_USER.email,
      },
      update: {
        name: ADMIN_TEST_USER.name,
        password: hashedPassword,
        emailVerified: new Date(),
        role: 'admin',
      },
      create: {
        id: ADMIN_TEST_USER.id,
        email: ADMIN_TEST_USER.email,
        name: ADMIN_TEST_USER.name,
        password: hashedPassword,
        emailVerified: new Date(),
        role: 'admin',
      },
    });

    console.log('Admin user created/updated successfully');
    return true;
  } catch (error) {
    console.error('Failed to create/update admin user:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * テストユーザーのクリーンアップ
 */
export async function cleanupTestUser() {
  // テスト用データベースURLを明示的に指定
  const TEST_DATABASE_URL = resolveTestDbUrl();
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: TEST_DATABASE_URL,
      },
    },
  });

  try {
    // Delete test user if exists
    await prisma.user.deleteMany({
      where: {
        email: TEST_USER.email,
      },
    });

    console.log('Test user cleaned up successfully');
    return true;
  } catch (error) {
    console.error('Failed to cleanup test user:', error);
    return false;
  } finally {
    await prisma.$disconnect();
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