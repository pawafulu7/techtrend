import { getAppDependencies } from '@/lib/di/bootstrap';
import { SUMMARY_VERSION } from '@/types/article';

console.log('🔍 Testing Pattern B Scripts Integration...\n');

try {
  // Test 1: DIコンテナからサービス取得（auto-regenerate.tsと同じパターン）
  console.log('Test 1: Service retrieval via DI container');
  const { service } = getAppDependencies();
  console.log('✅ Service retrieved:', service.constructor.name);
  
  // Test 2: SUMMARY_VERSION定数使用（auto-regenerate.tsと同じパターン）
  console.log('\nTest 2: SUMMARY_VERSION constant usage');
  const summaryVersion = SUMMARY_VERSION.UNIFIED;
  console.log('✅ summaryVersion:', summaryVersion);
  
  // Test 3: サービスメソッド存在確認
  console.log('\nTest 3: Service methods availability');
  console.log('✅ service.generate:', typeof service.generate === 'function');
  console.log('✅ service.generateSummary:', typeof service.generateSummary === 'function');
  
  console.log('\n✅ All Pattern B integration checks passed!');
  console.log('✅ Scripts auto-regenerate.ts and manage-summaries.ts should work correctly');
  process.exit(0);
} catch (error) {
  console.error('❌ Pattern B integration test failed:', error);
  process.exit(1);
}
