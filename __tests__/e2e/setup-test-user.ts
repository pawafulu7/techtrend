import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TEST_USER } from './utils/e2e-helpers';

// .env.testを強制的に読み込む
dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true });

/**
 * E2Eテスト用のユーザーをセットアップする
 * PrismaClientを使用してデータベースに直接接続
 */
export async function setupTestUser() {
  // テスト用データベースURLを明示的に指定
  const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 
    'postgresql://postgres:postgres_dev_password@localhost:5432/techtrend_test';
  
  // デバッグ出力
  console.log('🔍 Database connection info:');
  console.log('  TEST_DATABASE_URL from env:', process.env.TEST_DATABASE_URL);
  console.log('  Using connection string:', TEST_DATABASE_URL);
  console.log('  DATABASE_URL from env:', process.env.DATABASE_URL);
  
  const prisma = new PrismaClient({
    datasourceUrl: TEST_DATABASE_URL,
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
 * テストユーザーのクリーンアップ
 */
export async function cleanupTestUser() {
  // テスト用データベースURLを明示的に指定
  const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 
    'postgresql://postgres:postgres_dev_password@localhost:5432/techtrend_test';
  
  const prisma = new PrismaClient({
    datasourceUrl: TEST_DATABASE_URL,
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