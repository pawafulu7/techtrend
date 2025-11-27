import { getAppDependencies } from '@/lib/di/bootstrap';
import { SUMMARY_VERSION } from '@/types/article';

console.log('🔍 Testing DI Container initialization...');

try {
  const { service, adapter, transport, config } = getAppDependencies();
  
  console.log('✅ DI Container initialized successfully');
  console.log('✅ Service:', service.constructor.name);
  console.log('✅ Adapter:', adapter.constructor.name);
  console.log('✅ Transport:', transport.constructor.name);
  console.log('✅ Config:', {
    model: config.gemini.model,
    temperature: config.gemini.temperature,
    maxRetries: config.gemini.maxRetries,
  });
  
  console.log('\n🔍 Testing SUMMARY_VERSION constant...');
  console.log('✅ SUMMARY_VERSION.CURRENT:', SUMMARY_VERSION.CURRENT);
  
  console.log('\n✅ All DI checks passed!');
  process.exit(0);
} catch (error) {
  console.error('❌ DI Container initialization failed:', error);
  process.exit(1);
}
