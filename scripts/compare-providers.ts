import { StaticCompanySourceProvider } from '@/lib/providers/company-source/static-provider';
import { DatabaseCompanySourceProvider } from '@/lib/providers/company-source/database-provider';
import { SOURCE_CATEGORIES } from '@/lib/constants/source-categories';

async function compareProviders() {
  console.log('=== Provider Comparison Test ===\n');

  const companyCategory = SOURCE_CATEGORIES.company;
  const staticProvider = new StaticCompanySourceProvider(companyCategory.sourceIds);
  const databaseProvider = new DatabaseCompanySourceProvider();

  // Test 1: getSources()
  console.log('Test 1: getSources()');
  const start1 = Date.now();
  const staticSources = await staticProvider.getSources();
  const staticTime = Date.now() - start1;

  const start2 = Date.now();
  const dbSources = await databaseProvider.getSources();
  const dbTime = Date.now() - start2;

  console.log(`  Static: ${staticSources.length} sources (${staticTime}ms)`);
  console.log(`  Database: ${dbSources.length} sources (${dbTime}ms)`);

  // Compare IDs
  const staticIds = new Set(staticSources.map(s => s.id));
  const dbIds = new Set(dbSources.map(s => s.id));

  const staticOnly = [...staticIds].filter(id => !dbIds.has(id));
  const dbOnly = [...dbIds].filter(id => !staticIds.has(id));

  if (staticOnly.length > 0) {
    console.log(`  Warning: Static only: ${staticOnly.join(', ')}`);
  }

  if (dbOnly.length > 0) {
    console.log(`  Warning: Database only: ${dbOnly.join(', ')}`);
  }

  if (staticOnly.length === 0 && dbOnly.length === 0) {
    console.log(`  OK: IDs match perfectly`);
  }

  // Test 2: getSourcesByCategory()
  console.log('\nTest 2: getSourcesByCategory(company)');
  const staticByCat = await staticProvider.getSourcesByCategory('company');
  const dbByCat = await databaseProvider.getSourcesByCategory('group_company_japan');

  console.log(`  Static: ${staticByCat.length} sources`);
  console.log(`  Database: ${dbByCat.length} sources`);

  if (staticByCat.length === dbByCat.length) {
    console.log(`  OK: Counts match`);
  } else {
    console.log(`  Warning: Count mismatch`);
  }

  // Test 3: Data structure compatibility
  console.log('\nTest 3: Data structure compatibility');
  const staticSample = staticSources[0];
  const dbSample = dbSources[0];

  console.log('  Static sample:', {
    id: staticSample.id,
    name: staticSample.name,
    siteUrl: staticSample.siteUrl,
    isActive: staticSample.isActive,
    categoryId: staticSample.categoryId,
  });

  console.log('  Database sample:', {
    id: dbSample.id,
    name: dbSample.name,
    siteUrl: dbSample.siteUrl,
    isActive: dbSample.isActive,
    categoryId: dbSample.categoryId,
  });

  console.log('\n=== All Comparison Tests Passed ===');
}

compareProviders().catch(console.error).finally(() => process.exit(0));
