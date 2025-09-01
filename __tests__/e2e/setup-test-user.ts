import { execSync } from 'child_process';

// 環境変数からコンテナ名を取得（デフォルト値を設定）
const POSTGRES_CONTAINER = process.env.POSTGRES_CONTAINER || 'techtrend-postgres';
const POSTGRES_DB = process.env.POSTGRES_DB || 'techtrend_dev';
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres';

/**
 * E2Eテスト用のユーザーをセットアップする
 * Prismaコマンドラインツールを使用してテストDBに直接接続
 */
export async function setupTestUser() {
  try {
    // SQLインジェクション対策：パラメータ化されたクエリを使用
    // ただし、psqlコマンドは直接パラメータ化をサポートしないため、
    // ここではエスケープ処理を行う
    const testEmail = 'test@example.com';
    const testId = 'test-user-id';
    const testName = 'Test User';
    const testPasswordHash = '$2a$10$3RXlx0pvlAYMNSOgkQ6Mn.vqxhkbzOs4loaPljQcIWOzha7KAqq7O';
    
    // SQLクエリをパラメータ化風に構築（シングルクォートのエスケープ）
    const escapeSql = (str: string) => str.replace(/'/g, "''");
    
    const sql = `
      -- 既存のテストユーザーを削除
      DELETE FROM "User" WHERE email = '${escapeSql(testEmail)}';
      
      -- テストユーザーを作成（パスワード: TestPassword123）
      INSERT INTO "User" (id, email, name, password, "emailVerified", "createdAt", "updatedAt")
      VALUES (
        '${escapeSql(testId)}',
        '${escapeSql(testEmail)}',
        '${escapeSql(testName)}',
        -- bcrypt hash of 'TestPassword123' (10 rounds)
        '${escapeSql(testPasswordHash)}',
        NOW(),
        NOW(),
        NOW()
      );
    `;
    
    // Docker経由でPostgreSQLに直接SQLを実行
    // Note: Using development database as the dev server connects to it
    execSync(
      `echo "${sql}" | docker exec -i ${POSTGRES_CONTAINER} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}`,
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
    const testEmail = 'test@example.com';
    const escapeSql = (str: string) => str.replace(/'/g, "''");
    
    const sql = `DELETE FROM "User" WHERE email = '${escapeSql(testEmail)}';`;
    
    execSync(
      `echo '${sql}' | docker exec -i ${POSTGRES_CONTAINER} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}`,
      { stdio: 'pipe' }
    );
    
    console.log('Test user cleaned up successfully');
    return true;
  } catch (error) {
    console.error('Failed to cleanup test user:', error);
    return false;
  }
}