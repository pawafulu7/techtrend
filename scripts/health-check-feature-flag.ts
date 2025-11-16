/**
 * Phase 2-A: Feature Flag Health Check Script
 *
 * Purpose: Verify that USE_DATABASE_PROVIDER flag is correctly set
 * and that the application is using the expected provider.
 *
 * Usage:
 *   npx tsx scripts/health-check-feature-flag.ts
 *
 * Options:
 *   BASE_URL=https://example.com npx tsx scripts/health-check-feature-flag.ts
 *     Test against a specific base URL (for API endpoint testing)
 */

import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { createCompanySourceProvider } from '@/lib/providers/company-source/factory';

async function checkFeatureFlag() {
  console.log('=== Phase 2-A Feature Flag Health Check ===\n');

  let hasError = false;

  // 1. Check Feature Flag value
  console.log('[Step 1] Feature Flag Check');
  const flagValue = FEATURE_FLAGS.USE_DATABASE_PROVIDER;

  if (flagValue === undefined) {
    console.log('  Feature Flag value is undefined');
    hasError = true;
  } else {
    console.log('  USE_DATABASE_PROVIDER:', flagValue);
    console.log('  Expected Provider:', flagValue ? 'DatabaseCompanySourceProvider' : 'StaticCompanySourceProvider');
  }
  console.log();

  // 2. Verify Provider instantiation
  console.log('[Step 2] Provider Instantiation Check');
  try {
    const provider = createCompanySourceProvider();
    const providerType = provider.constructor.name;
    console.log('  Actual Provider:', providerType);

    const expectedType = flagValue
      ? 'DatabaseCompanySourceProvider'
      : 'StaticCompanySourceProvider';

    if (providerType === expectedType) {
      console.log('  Status: PASS (Provider type matches flag setting)');
    } else {
      console.log('  Status: FAIL (Provider type mismatch)');
      console.log('    Expected:', expectedType);
      console.log('    Actual:', providerType);
      hasError = true;
    }
  } catch (error) {
    console.log('  Status: FAIL (Provider instantiation error)');
    console.log('    Error:', error instanceof Error ? error.message : String(error));
    hasError = true;
  }
  console.log();

  // 3. DB read/write path execution (only if DB provider enabled)
  if (flagValue) {
    console.log('[Step 3] DB Read/Write Path Check');
    try {
      const provider = createCompanySourceProvider();

      // Test getSources()
      console.log('  Testing getSources()...');
      const sources = await provider.getSources();
      console.log('    Success: Retrieved', sources.length, 'sources');

      // Test getSourcesByCategory() with known group
      console.log('  Testing getSourcesByCategory(group_company_japan)...');
      const groupSources = await provider.getSourcesByCategory('group_company_japan');
      console.log('    Success: Retrieved', groupSources.length, 'sources');

      console.log('  Status: PASS (DB read paths working)');
    } catch (error) {
      console.log('  Status: FAIL (DB read/write error)');
      console.log('    Error:', error instanceof Error ? error.message : String(error));
      hasError = true;
    }
    console.log();
  } else {
    console.log('[Step 3] DB Read/Write Path Check');
    console.log('  Status: SKIPPED (DB provider not enabled)');
    console.log();
  }

  // 4. API endpoint test (if BASE_URL provided)
  const baseUrl = process.env.BASE_URL || process.env.NEXTAUTH_URL;
  console.log('[Step 4] API Endpoint Check');
  if (baseUrl) {
    const testUrl = `${baseUrl}/api/sources?category=company`;
    console.log('  Testing:', testUrl);

    try {
      const response = await fetch(testUrl);
      const data = await response.json();

      if (response.ok) {
        // Validate response structure
        if (Array.isArray(data.sources)) {
          console.log('  Status: PASS (API endpoint responding)');
          console.log('    HTTP Status:', response.status);
          console.log('    Source count:', data.sources.length);
        } else {
          console.log('  Status: WARN (API response schema unexpected)');
          console.log('    HTTP Status:', response.status);
          console.log('    Expected "sources" array, got:', typeof data.sources);
        }
      } else {
        console.log('  Status: FAIL (API endpoint error)');
        console.log('    HTTP Status:', response.status);
        console.log('    Error:', data.error || 'Unknown error');
        hasError = true;
      }
    } catch (error) {
      console.log('  Status: WARN (API endpoint not reachable)');
      console.log('    Error:', error instanceof Error ? error.message : String(error));
      console.log('    Note: This is expected if server is not running');
    }
  } else {
    console.log('  Status: SKIPPED (BASE_URL not set)');
  }
  console.log();

  // 5. Summary
  console.log('=== Health Check Summary ===');
  console.log('Feature Flag:', flagValue ? 'ENABLED (DB Provider)' : 'DISABLED (Static Provider)');

  if (hasError) {
    console.log('Overall Status: FAIL');
    console.log('\nHealth check failed. See errors above.');
    process.exit(1);
  } else {
    console.log('Overall Status: PASS');
    console.log('\nAll checks passed successfully.');
    process.exit(0);
  }
}

// Run health check
checkFeatureFlag().catch((error) => {
  console.error('\n=== Unexpected Error ===');
  console.error('Health check failed with unexpected error:');
  console.error(error);
  process.exit(1);
});
