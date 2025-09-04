import { FullConfig } from '@playwright/test';
import { cleanupTestUser } from './setup-test-user';

/**
 * Playwrightのグローバルティアダウン
 * すべてのテスト実行後に一度だけ実行される
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global teardown...');
  
  // テストユーザーを削除
  console.log('🗑️ Deleting test user...');
  const userDeleted = await cleanupTestUser();
  if (!userDeleted) {
    console.error('⚠️ Failed to delete test user in global teardown');
  } else {
    console.log('✅ Test user deleted successfully');
  }
  
  console.log('✅ Global teardown completed');
}

export default globalTeardown;