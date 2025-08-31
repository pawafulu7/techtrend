import { FullConfig } from '@playwright/test';
import { deleteTestUser } from './test-helpers';

/**
 * Playwrightのグローバルティアダウン
 * すべてのテスト実行後に一度だけ実行される
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global teardown...');
  
  // テストユーザーを削除
  console.log('🗑️ Deleting test user...');
  const userDeleted = await deleteTestUser();
  if (!userDeleted) {
    console.error('⚠️ Failed to delete test user in global teardown');
  } else {
    console.log('✅ Test user deleted successfully');
  }
  
  console.log('✅ Global teardown completed');
}

export default globalTeardown;