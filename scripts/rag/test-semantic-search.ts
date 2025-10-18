import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local FIRST (override any existing env vars)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

/**
 * Semantic Search Testing Script
 *
 * Tests RAG semantic search with predefined queries.
 * Displays results with similarity scores for manual relevance evaluation.
 *
 * Usage:
 *   npx tsx scripts/rag/test-semantic-search.ts
 *
 * Environment Variables Required:
 *   - OPENAI_API_KEY
 *   - DATABASE_URL
 */

function assertEnv(vars: string[]): void {
  const missing = vars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`ERROR: Missing required environment variables: ${missing.join(', ')}`);
    console.error('\nPlease set these variables in .env.local or environment.');
    process.exitCode = 1;
    throw new Error('Missing required environment variables');
  }
}

const testQueries = [
  'React hooks and state management',
  'Next.js server components and streaming',
  'TypeScript type safety and generics',
  'Database performance optimization',
  'Security best practices for web applications',
  'Frontend architecture patterns',
  'API design and RESTful principles',
  'Testing strategies for React applications',
];

async function main() {
  // Validate required environment variables
  assertEnv(['OPENAI_API_KEY', 'DATABASE_URL']);

  // Dynamic import after env is loaded (CodexMCP guidance)
  const { prisma } = await import('@/lib/prisma');
  const { VectorSearchService } = await import('@/lib/rag/vector-search-service');
  const { logger } = await import('@/lib/logger');

  console.log('========================================');
  console.log('Semantic Search Test');
  console.log('========================================\n');

  // Check if embeddings exist
  const embeddingCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "ArticleEmbedding"
  `;

  const count = Number(embeddingCount[0].count);

  if (count === 0) {
    console.log('ERROR: No embeddings found in database.');
    console.log('Please run: npx tsx scripts/rag/embed-sample-articles.ts\n');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  console.log(`Total embeddings in database: ${count.toLocaleString()}\n`);

  const searchService = new VectorSearchService(prisma);

  let totalQueries = 0;
  let totalResults = 0;

  for (const query of testQueries) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Query: "${query}"`);
      console.log('='.repeat(60));

      const results = await searchService.search(query, {
        topK: 5,
        similarityThreshold: 0.1,
        embeddingKey: 'summary',
      });

      totalQueries++;
      totalResults += results.length;

      if (results.length === 0) {
        console.log('\nNo results found (similarity < 0.1)\n');
        continue;
      }

      console.log(`\nFound ${results.length} results:\n`);

      results.forEach((result, index) => {
        console.log(`${index + 1}. [Similarity: ${result.similarity.toFixed(4)}]`);
        console.log(`   Title: ${result.title}`);
        console.log(`   Article ID: ${result.articleId}`);
        console.log(`   Source ID: ${result.sourceId}`);
        console.log(`   Published: ${result.publishedAt.toISOString().split('T')[0]}`);
        if (result.summary) {
          console.log(`   Summary: ${result.summary.substring(0, 120)}...`);
        }
        console.log('');
      });
    } catch (error) {
      console.error(`\nERROR for query "${query}":`, error instanceof Error ? error.message : error);
      logger.error('Test semantic search query failed', {
        query,
        error,
      });
      // Continue with next query (do not abort)
    }
  }

  // Summary statistics
  console.log('\n========================================');
  console.log('Test Summary');
  console.log('========================================\n');

  console.log(`Total queries tested: ${totalQueries}/${testQueries.length}`);
  console.log(`Total results found: ${totalResults}`);
  console.log(`Average results per query: ${(totalResults / totalQueries).toFixed(2)}`);

  logger.info('Semantic search test completed', {
    totalQueries,
    totalResults,
    avgResultsPerQuery: (totalResults / totalQueries).toFixed(2),
  });

  console.log('\n========================================\n');

  // Ensure Prisma disconnects cleanly
  await prisma.$disconnect();
}

// Execute main function
main()
  .catch(async error => {
    console.error('\nFATAL ERROR:', error instanceof Error ? error.message : error);

    // Try to disconnect prisma if available
    try {
      const { prisma } = await import('@/lib/prisma');
      await prisma.$disconnect();
    } catch {
      // Ignore if prisma not available
    }

    process.exitCode = 1;
  });
