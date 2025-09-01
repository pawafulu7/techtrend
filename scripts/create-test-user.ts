import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// セキュリティ: パスワードハッシュの生成状況をログに出力しない

async function createTestUser() {
  try {
    // ブラウザ別のテストユーザー情報
    const testUsers = [
      { id: 'test-user-chromium', email: 'test-chromium@example.com', name: 'Test User Chromium' },
      { id: 'test-user-firefox', email: 'test-firefox@example.com', name: 'Test User Firefox' },
      { id: 'test-user-webkit', email: 'test-webkit@example.com', name: 'Test User WebKit' },
      // 後方互換性のため既存のユーザーも作成
      { id: 'test-user-e2e', email: 'test@example.com', name: 'Test User' },
      // パスワード変更テスト専用ユーザー
      { id: 'test-user-password-change', email: 'test-password-change@example.com', name: 'Test User Password Change' },
    ];

    // パスワードをハッシュ化（全ユーザー同じパスワード）
    const hashedPassword = await bcrypt.hash('TestPassword123', 10);

    // 既存のテストユーザーを全て削除
    await prisma.user.deleteMany({
      where: {
        email: {
          in: testUsers.map(u => u.email)
        }
      }
    });

    // 各ブラウザ用のテストユーザーを作成
    for (const userData of testUsers) {
      const user = await prisma.user.create({
        data: {
          ...userData,
          password: hashedPassword,
          emailVerified: new Date()
        }
      });
      console.log('Test user created:', user.email);
    }

    console.log('All test users created successfully');
  } catch (error) {
    console.error('Failed to create test users:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();