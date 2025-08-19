import { setupTestDatabase } from './utils/test-database';

/**
 * Playwright グローバルセットアップ
 * テスト実行前に一度だけ実行される
 */
async function globalSetup() {
  console.log('\n========================================');
  console.log('Playwright Global Setup Starting...');
  console.log('========================================\n');
  
  try {
    // Setup test database with test data
    await setupTestDatabase();
    
    console.log('\n========================================');
    console.log('Global Setup Completed Successfully!');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n========================================');
    console.error('Global Setup Failed!');
    console.error('========================================\n');
    console.error(error);
    process.exit(1);
  }
}

export default globalSetup;