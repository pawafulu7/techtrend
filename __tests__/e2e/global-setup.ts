import { FullConfig } from '@playwright/test';
import { setupTestUser } from './setup-test-user';

/**
 * Playwrightのグローバルセットアップ
 * テスト実行前に一度だけ実行される
 */
async function globalSetup(_config: FullConfig) {
  console.log('🚀 Starting global setup...');
  
  // テストユーザーを作成
  console.log('📦 Creating test user...');
  const userCreated = await setupTestUser();
  if (!userCreated) {
    throw new Error('Failed to create test user in global setup');
  }
  console.log('✅ Test user created successfully');
  
  console.log('✅ Global setup completed');
}

export default globalSetup;