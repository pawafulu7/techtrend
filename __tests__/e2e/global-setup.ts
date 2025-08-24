import { setupTestDatabase } from './utils/test-database';

/**
 * Playwright グローバルセットアップ
 * テスト実行前に一度だけ実行される
 */
async function globalSetup() {
  console.error('\n========================================');
  console.error('Playwright Global Setup Starting...');
  console.error('========================================\n');
  
  try {
    // Setup test database with test data
    await setupTestDatabase();
    
    console.error('\n========================================');
    console.error('Global Setup Completed Successfully!');
    console.error('========================================\n');
  } catch (error) {
    console.error('\n========================================');
    console.error('Global Setup Failed!');
    console.error('========================================\n');
    console.error(error);
    process.exit(1);
  }
}

export default globalSetup;