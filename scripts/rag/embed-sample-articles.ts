import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local FIRST (override any existing env vars)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

/**
 * Embedding Generation Script for Sample Articles
 *
 * Generates vector embeddings for articles without embeddings.
 * Uses ArticleEmbeddingPipeline for secure UPSERT operations.
 *
 * Usage:
 *   npx tsx scripts/rag/embed-sample-articles.ts
 *
 * Environment Variables Required:
 *   - OPENAI_API_KEY
 *   - DATABASE_URL
 *   - RAG_ACTIVE_MODEL (optional, default: text-embedding-3-small)
 *   - RAG_ACTIVE_VERSION (optional, default: 1)
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

async function main() {
  // Validate required environment variables
  assertEnv(['OPENAI_API_KEY', 'DATABASE_URL']);

  // Dynamic import after env is loaded (CodexMCP guidance)
  const { prisma } = await import('@/lib/prisma');
  const { ArticleEmbeddingPipeline } = await import('@/lib/rag/article-embedding-pipeline');
  const { logger } = await import('@/lib/logger');

  console.log('========================================');
  console.log('Embedding Generation for Sample Articles');
  console.log('========================================\n');

  console.log('Configuration:');
  console.log(`  Model: ${process.env.RAG_ACTIVE_MODEL || 'text-embedding-3-small'}`);
  console.log(`  Version: ${process.env.RAG_ACTIVE_VERSION || '1'}`);

  // Batch size for embedding generation
  const batchSize = 100;
  console.log(`  Batch Size: ${batchSize} articles\n`);

  const pipeline = new ArticleEmbeddingPipeline(prisma);

  console.log('Finding articles without embeddings...');

  // Process articles without embeddings
  const results = await pipeline.embedArticlesWithoutEmbeddings(batchSize);

  if (results.length === 0) {
    console.log('\nNo articles to embed. All articles already have embeddings.');
    await prisma.$disconnect();
    return;
  }

  // Calculate statistics
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  const successRate = ((successCount / results.length) * 100).toFixed(2);

  // Summary
  console.log('\n========================================');
  console.log('Embedding Generation Completed');
  console.log('========================================\n');

  console.log('Results:');
  console.log(`  Total articles: ${results.length}`);
  console.log(`  Success: ${successCount} (${successRate}%)`);
  console.log(`  Failure: ${failureCount}`);

  if (failureCount > 0) {
    console.log('\nFailed articles:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  - ${r.articleId}: ${r.error}`);
      });
  }

  // Cost estimation
  const avgTokensPerArticle = 500; // Average for title + summary
  const totalTokens = successCount * avgTokensPerArticle * 2; // title + summary embeddings
  const estimatedCost = (totalTokens / 1_000_000) * 0.02; // $0.02 per 1M tokens

  console.log('\nCost Estimation:');
  console.log(`  Estimated tokens: ${totalTokens.toLocaleString()}`);
  console.log(`  Estimated cost: $${estimatedCost.toFixed(4)}`);

  // Check database
  const embeddingCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "ArticleEmbedding"
  `;

  console.log('\nDatabase Status:');
  console.log(`  Total embeddings in DB: ${embeddingCount[0].count.toString()}`);

  console.log('\n========================================\n');

  logger.info('Embedding generation script completed', {
    total: results.length,
    success: successCount,
    failure: failureCount,
    successRate: `${successRate}%`,
  });

  // Set exit code based on results (do NOT use process.exit)
  if (failureCount > 0) {
    process.exitCode = 1;
  }

  // Ensure Prisma disconnects cleanly
  await prisma.$disconnect();
}

// Signal handlers for clean shutdown
process.on('SIGINT', async () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
  } catch {
    // Ignore if prisma not available
  }
  process.exit(130);
});

process.on('SIGTERM', async () => {
  console.log('\n\nReceived SIGTERM, shutting down gracefully...');
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
  } catch {
    // Ignore if prisma not available
  }
  process.exit(143);
});

// Execute main function
main().catch(async (error) => {
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
