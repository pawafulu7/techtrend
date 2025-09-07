import { FullConfig } from '@playwright/test';
import { setupTestUser } from './setup-test-user';

/**
 * Playwrightのグローバルセットアップ
 * テスト実行前に一度だけ実行される
 */
async function globalSetup(_config: FullConfig) {
  console.log('🚀 Starting global setup...');
  
  // テストユーザーを作成（リトライ付き）
  console.log('📦 Creating test user...');
  const attempts = Number(process.env.E2E_SETUP_RETRIES ?? 5);
  const baseDelayMs = 500;
  let userCreated = false;
  
  for (let i = 0; i < attempts; i++) {
    userCreated = await setupTestUser();
    if (userCreated) break;
    
    // Add jitter to prevent collision in parallel CI runs
    const jitter = Math.floor(Math.random() * 100);
    const delay = baseDelayMs * 2 ** i + jitter;
    console.warn(`⚠️ setupTestUser failed; retrying in ${delay}ms (${i + 1}/${attempts})`);
    await new Promise((r) => setTimeout(r, delay));
  }
  
  if (!userCreated) {
    throw new Error(`Failed to create test user after ${attempts} retries`);
  }
  console.log('✅ Test user created successfully');
  
  console.log('✅ Global setup completed');
}

export default globalSetup;