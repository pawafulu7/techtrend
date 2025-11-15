import { DatabaseCompanySourceProvider } from '@/lib/providers/company-source/database-provider';

async function test() {
  const provider = new DatabaseCompanySourceProvider();

  console.log('Testing getSources()...');
  const all = await provider.getSources();
  console.log(`  Total: ${all.length} sources`);
  console.log(`  Sample:`, all.slice(0, 3).map(s => ({ name: s.name, categoryId: s.categoryId })));

  console.log('\nTesting getSourcesByCategory(group_company_japan)...');
  const japan = await provider.getSourcesByCategory('group_company_japan');
  console.log(`  Japan companies: ${japan.length} sources`);

  console.log('\nTesting getSourcesByCategory(group_company_global)...');
  const global = await provider.getSourcesByCategory('group_company_global');
  console.log(`  Global companies: ${global.length} sources`);

  console.log('\nTesting getSourcesByTag(tag_topic_ai)...');
  const ai = await provider.getSourcesByTag!('tag_topic_ai');
  console.log(`  AI sources: ${ai.length} sources`);
  console.log(`  Sample:`, ai.slice(0, 3).map(s => s.name));

  console.log('\nAll tests passed!');
}

test().catch(console.error).finally(() => process.exit(0));
