import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { TEST_USER } from './utils/e2e-helpers';

/**
 * E2Eテスト用のユーザーをセットアップする
 * PrismaClientを使用してデータベースに直接接続
 */
export async function setupTestUser() {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
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
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
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