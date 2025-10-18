import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ExtensionInfo {
  extname: string;
  extversion: string;
}

async function verifyPgVector() {
  console.log('='.repeat(70));
  console.log('pgvector Extension Verification');
  console.log('='.repeat(70));

  try {
    // Check if pgvector extension is installed
    const result = await prisma.$queryRaw<ExtensionInfo[]>`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname = 'vector';
    `;

    if (result.length === 0) {
      console.error('\n❌ FAILED: pgvector extension is NOT installed');
      console.log('\nTo install pgvector, run:');
      console.log('  CREATE EXTENSION IF NOT EXISTS vector;');
      process.exit(1);
    }

    const extension = result[0];
    console.log(`\n✅ SUCCESS: pgvector extension is installed`);
    console.log(`   Version: ${extension.extversion}`);

    // Test vector type creation
    console.log('\nTesting vector type...');

    await prisma.$executeRaw`
      CREATE TEMP TABLE IF NOT EXISTS test_vectors (
        id SERIAL PRIMARY KEY,
        embedding vector(1536)
      );
    `;

    console.log('✅ Vector type is functional');

    // Test vector operations
    console.log('\nTesting vector operations...');

    // Create test vector (all zeros)
    const testVector = '[' + Array(1536).fill(0).join(',') + ']';

    await prisma.$executeRawUnsafe(`
      INSERT INTO test_vectors (embedding)
      VALUES ('${testVector}'::vector);
    `);

    const testResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM test_vectors;
    `;

    console.log(`✅ Vector insert successful (${testResult[0].count} row)`);

    // Test cosine similarity
    console.log('\nTesting cosine similarity operator...');

    const similarityResult = await prisma.$queryRawUnsafe<Array<{ distance: number }>>(`
      SELECT embedding <=> '${testVector}'::vector as distance
      FROM test_vectors
      LIMIT 1;
    `);

    console.log(`✅ Cosine similarity operator works (distance: ${similarityResult[0].distance})`);

    // Clean up
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS test_vectors;`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ All pgvector tests PASSED');
    console.log('='.repeat(70));

    console.log('\nNext steps:');
    console.log('1. Run migrations: npx prisma migrate dev');
    console.log('2. Implement RAG embedding pipeline');
    console.log('3. Test semantic search');

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.log('\nPossible causes:');
    console.log('- pgvector extension not installed');
    console.log('- Database connection failed');
    console.log('- Insufficient permissions');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPgVector();
