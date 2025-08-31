import { execSync } from 'child_process';

/**
 * E2Eテスト用のユーザーをセットアップする
 * Prismaコマンドラインツールを使用してテストDBに直接接続
 */
export async function setupTestUser() {
  try {
    // テストDBでSQLを実行してユーザーを作成
    const sql = `
      -- 既存のテストユーザーを削除
      DELETE FROM "User" WHERE email = 'test@example.com';
      
      -- テストユーザーを作成（パスワード: TestPassword123）
      INSERT INTO "User" (id, email, name, password, "emailVerified", "createdAt", "updatedAt")
      VALUES (
        'test-user-id',
        'test@example.com',
        'Test User',
        -- bcrypt hash of 'TestPassword123' (10 rounds)
        '$2a$10$K7L1OGQvgBqNw2K8HZbJnOXxJ5VZJaE7ePWPQhYpYc.bY.dNZKWze',
        NOW(),
        NOW(),
        NOW()
      );
    `;
    
    // Docker経由でPostgreSQLに直接SQLを実行
    execSync(
      `echo "${sql}" | docker exec -i techtrend-postgres-test psql -U postgres -d techtrend_test`,
      { stdio: 'pipe' }
    );
    
    console.log('Test user created successfully');
    return true;
  } catch (error) {
    console.error('Failed to create test user:', error);
    return false;
  }
}

/**
 * テストユーザーのクリーンアップ
 */
export async function cleanupTestUser() {
  try {
    const sql = `DELETE FROM "User" WHERE email = 'test@example.com';`;
    
    execSync(
      `echo '${sql}' | docker exec -i techtrend-postgres-test psql -U postgres -d techtrend_test`,
      { stdio: 'pipe' }
    );
    
    console.log('Test user cleaned up successfully');
    return true;
  } catch (error) {
    console.error('Failed to cleanup test user:', error);
    return false;
  }
}