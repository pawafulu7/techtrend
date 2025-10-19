import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local FIRST (override any existing env vars)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

/**
 * Embedding Generation Script for ALL Articles
 *
 * Generates vector embeddings for all articles without embeddings.
 * Processes in batches of 100 to avoid memory issues and API rate limits.
 *
 * Usage:
 *   npx tsx scripts/rag/embed-all-articles.ts
 *
 * Environment Variables Required:
 *   - OPENAI_API_KEY
 *   - DATABASE_URL
 *   - RAG_ACTIVE_MODEL (optional, default: text-embedding-3-small)
 *   - RAG_ACTIVE_VERSION (optional, default: 1)
 *
 * Expected Cost: ~$0.23 for 11,000 articles
 * Expected Time: 2-3 hours (depends on API rate limits)
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

  // Dynamic import after env is loaded
  const { prisma } = await import('@/lib/prisma');
  const { ArticleEmbeddingPipeline } = await import('@/lib/rag/article-embedding-pipeline');
  const { logger } = await import('@/lib/logger');

  console.log('========================================');
  console.log('Embedding Generation for ALL Articles');
  console.log('========================================\n');

  console.log('Configuration:');
  console.log(`  Model: ${process.env.RAG_ACTIVE_MODEL || 'text-embedding-3-small'}`);
  console.log(`  Version: ${process.env.RAG_ACTIVE_VERSION || '1'}`);

  const batchSize = 100;
  console.log(`  Batch Size: ${batchSize} articles\n`);

  const pipeline = new ArticleEmbeddingPipeline(prisma);

  // Get total count of articles without embeddings
  const totalWithoutEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "Article" a
    WHERE NOT EXISTS (
      SELECT 1 FROM "ArticleEmbedding" e
      WHERE e."articleId" = a.id
        AND e.model = ${process.env.RAG_ACTIVE_MODEL || 'text-embedding-3-small'}
        AND e.version = ${parseInt(process.env.RAG_ACTIVE_VERSION || '1', 10)}
        AND e."embeddingKey" = 'summary'
    )
    AND a.summary IS NOT NULL
  `;

  const totalCount = Number(totalWithoutEmbeddings[0].count);
  console.log(`Total articles without embeddings: ${totalCount}`);

  if (totalCount === 0) {
    console.log('\nAll articles already have embeddings. Exiting.');
    await prisma.$disconnect();
    return;
  }

  const estimatedBatches = Math.ceil(totalCount / batchSize);
  const estimatedTime = (totalCount / 1.2) / 60; // ~1.2 articles/sec
  const estimatedCost = (totalCount * 500 * 2 / 1_000_000) * 0.02; // $0.02 per 1M tokens

  console.log(`\nEstimated processing:`);
  console.log(`  Batches: ${estimatedBatches}`);
  console.log(`  Time: ~${Math.ceil(estimatedTime)} minutes`);
  console.log(`  Cost: ~$${estimatedCost.toFixed(3)}\n`);

  console.log('Starting batch processing...\n');

  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalFailure = 0;
  let batchNumber = 0;

  const startTime = Date.now();

  // Process in batches until no more articles
  while (true) {
    batchNumber++;

    console.log(`--- Batch ${batchNumber}/${estimatedBatches} ---`);

    const results = await pipeline.embedArticlesWithoutEmbeddings(batchSize);

    if (results.length === 0) {
      console.log('No more articles to process. Completed!\n');
      break;
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    totalProcessed += results.length;
    totalSuccess += successCount;
    totalFailure += failureCount;

    const progress = ((totalProcessed / totalCount) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    console.log(`  Processed: ${results.length} articles`);
    console.log(`  Success: ${successCount}, Failure: ${failureCount}`);
    console.log(`  Progress: ${totalProcessed}/${totalCount} (${progress}%)`);
    console.log(`  Elapsed: ${elapsed}s\n`);

    // Log failures
    if (failureCount > 0) {
      results
        .filter(r => !r.success)
        .forEach(r => {
          logger.warn({ articleId: r.articleId, error: r.error }, 'Embedding generation failed');
        });
    }

    // Short delay between batches to respect rate limits
    if (results.length === batchSize) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const articlesPerSecond = (totalSuccess / parseInt(totalElapsed)).toFixed(2);

  // Final summary
  console.log('========================================');
  console.log('ALL Articles Embedding Completed');
  console.log('========================================\n');

  console.log('Final Results:');
  console.log(`  Total processed: ${totalProcessed}`);
  console.log(`  Success: ${totalSuccess} (${((totalSuccess / totalProcessed) * 100).toFixed(2)}%)`);
  console.log(`  Failure: ${totalFailure}`);
  console.log(`  Total time: ${totalElapsed}s (${Math.ceil(parseInt(totalElapsed) / 60)} minutes)`);
  console.log(`  Throughput: ${articlesPerSecond} articles/sec`);

  // Actual cost calculation
  const actualTokens = totalSuccess * 500 * 2; // title + summary
  const actualCost = (actualTokens / 1_000_000) * 0.02;

  console.log('\nCost:');
  console.log(`  Tokens: ${actualTokens.toLocaleString()}`);
  console.log(`  Cost: $${actualCost.toFixed(4)}`);

  // Check final database status
  const finalEmbeddingCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "ArticleEmbedding"
  `;

  const finalArticleCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Article"
  `;

  const articlesWithEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT "articleId") as count FROM "ArticleEmbedding"
  `;

  console.log('\nDatabase Status:');
  console.log(`  Total articles: ${finalArticleCount[0].count.toString()}`);
  console.log(`  Articles with embeddings: ${articlesWithEmbeddings[0].count.toString()}`);
  console.log(`  Total embeddings: ${finalEmbeddingCount[0].count.toString()}`);
  console.log(`  Coverage: ${((Number(articlesWithEmbeddings[0].count) / Number(finalArticleCount[0].count)) * 100).toFixed(2)}%`);

  console.log('\n========================================\n');

  logger.info('All articles embedding generation completed', {
    totalProcessed,
    success: totalSuccess,
    failure: totalFailure,
    elapsedSeconds: totalElapsed,
    throughput: articlesPerSecond,
    cost: actualCost,
  });

  // Set exit code based on results
  if (totalFailure > 0) {
    process.exitCode = 1;
  }

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

  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
  } catch {
    // Ignore if prisma not available
  }

  process.exitCode = 1;
});
