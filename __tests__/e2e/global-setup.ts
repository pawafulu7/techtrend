import { chromium, FullConfig } from '@playwright/test';
import { createTestUser } from './test-helpers';

/**
 * Playwrightのグローバルセットアップ
 * テスト実行前に一度だけ実行される
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global setup...');
  
  // テストユーザーを作成
  console.log('📦 Creating test user...');
  const userCreated = await createTestUser();
  if (!userCreated) {
    throw new Error('Failed to create test user in global setup');
  }
  console.log('✅ Test user created successfully');
  
  // サーバーが起動しているか確認
  console.log('🔍 Checking if server is running...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    await page.goto(config.projects[0].use?.baseURL || 'http://localhost:3000', {
      timeout: 10000
    });
    console.log('✅ Server is running');
  } catch (error) {
    console.error('❌ Server is not running. Please start the development server.');
    throw new Error('Server is not running');
  } finally {
    await browser.close();
  }
  
  console.log('✅ Global setup completed');
}

export default globalSetup;