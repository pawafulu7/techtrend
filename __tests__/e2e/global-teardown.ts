import { teardownTestDatabase } from './utils/test-database';

/**
 * Playwright グローバルティアダウン
 * 全テスト終了後に一度だけ実行される
 */
async function globalTeardown() {
  console.error('\n========================================');
  console.error('Playwright Global Teardown Starting...');
  console.error('========================================\n');
  
  try {
    // Cleanup test database
    await teardownTestDatabase();
    
    console.error('\n========================================');
    console.error('Global Teardown Completed!');
    console.error('========================================\n');
  } catch (error) {
    console.error('\n========================================');
    console.error('Global Teardown Failed!');
    console.error('========================================\n');
    console.error(error);
    // Don't exit with error to avoid masking test failures
  }
}

export default globalTeardown;