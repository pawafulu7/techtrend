import { PrismaClient } from '@prisma/client';
import { hashPassword } from '@better-auth/utils/password';

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

    // パスワードをハッシュ化（全ユーザー同じパスワード、Better Auth の scrypt を使用）
    const hashedPassword = await hashPassword('TestPassword123');

    // 各ブラウザ用のテストユーザーを作成（$transaction でアトミックに）
    for (const userData of testUsers) {
      await prisma.$transaction(async (tx) => {
        // 既存ユーザーを削除（Account は cascadeで削除されるか、明示的に先に削除）
        await tx.account.deleteMany({
          where: { userId: userData.id },
        });
        await tx.user.deleteMany({
          where: { email: userData.email },
        });

        // User を作成
        const user = await tx.user.create({
          data: {
            ...userData,
            emailVerified: true,
          },
        });

        // Account テーブルにパスワードを格納（Better Auth スキーマ）
        await tx.account.create({
          data: {
            userId: user.id,
            providerId: 'credential',
            accountId: user.id,
            password: hashedPassword,
          },
        });

        console.log('Test user created:', user.email);
      });
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