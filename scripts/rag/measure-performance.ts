import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local FIRST (override any existing env vars)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

/**
 * Performance Measurement Script for RAG Vector Search
 *
 * Measures:
 * - Vector search latency (EXPLAIN ANALYZE)
 * - JOIN performance
 * - Index effectiveness (IVFFLAT vs Sequential Scan)
 *
 * Usage:
 *   npx tsx scripts/rag/measure-performance.ts
 */

interface PerformanceMetrics {
  queryType: string;
  executionTime: number;
  planningTime: number;
  totalTime: number;
  indexUsed: boolean;
  rowsScanned: number;
  rowsReturned: number;
}

async function main() {
  const { prisma } = await import('@/lib/prisma');
  const { VectorSearchService } = await import('@/lib/rag/vector-search-service');

  console.log('========================================');
  console.log('RAG Performance Measurement');
  console.log('========================================\n');

  const searchService = new VectorSearchService(prisma);

  // Get sample embedding from database
  const sampleEmbedding = await prisma.$queryRaw<
    Array<{ embedding: string }>
  >`
    SELECT embedding::text as embedding
    FROM "ArticleEmbedding"
    WHERE "embeddingKey" = 'summary'
    LIMIT 1
  `;

  if (sampleEmbedding.length === 0) {
    console.error('ERROR: No embeddings found in database.');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  const vectorString = sampleEmbedding[0].embedding;

  console.log('Configuration:');
  console.log(`  Total embeddings: ${await getEmbeddingCount(prisma)}`);
  console.log(`  Test queries: 3`);
  console.log('');

  const metrics: PerformanceMetrics[] = [];

  // Test 1: Basic vector search (no filters)
  console.log('Test 1: Basic vector search (no filters)');
  console.log('-'.repeat(60));
  const metric1 = await measureQuery(
    prisma,
    'Basic Search',
    `
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT
      a.id as "articleId",
      a.title,
      e."embeddingKey",
      1 - (e.embedding <=> $1::vector) as similarity
    FROM "ArticleEmbedding" e
    INNER JOIN "Article" a ON a.id = e."articleId"
    WHERE e.model = 'text-embedding-3-small'
      AND e.version = 1
      AND e."embeddingKey" = 'summary'
      AND 1 - (e.embedding <=> $2::vector) >= 0.1
    ORDER BY similarity DESC
    LIMIT 5
  `,
    [vectorString, vectorString]
  );
  metrics.push(metric1);
  console.log('');

  // Test 2: Application-level timing
  console.log('Test 2: Application-level timing (VectorSearchService)');
  console.log('-'.repeat(60));

  const appMetrics: number[] = [];

  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await searchService.search('React hooks and state management', {
      topK: 5,
      similarityThreshold: 0.1,
      embeddingKey: 'summary',
    });
    const end = performance.now();
    const latency = end - start;
    appMetrics.push(latency);
    console.log(`  Run ${i + 1}/10: ${latency.toFixed(2)}ms`);
  }

  const avgLatency = appMetrics.reduce((a, b) => a + b, 0) / appMetrics.length;
  const p50 = appMetrics.sort((a, b) => a - b)[Math.floor(appMetrics.length / 2)];
  const p95 = appMetrics.sort((a, b) => a - b)[Math.floor(appMetrics.length * 0.95)];
  const p99 = appMetrics.sort((a, b) => a - b)[Math.floor(appMetrics.length * 0.99)];

  console.log('');
  console.log('Application-level metrics:');
  console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
  console.log(`  p50: ${p50.toFixed(2)}ms`);
  console.log(`  p95: ${p95.toFixed(2)}ms`);
  console.log(`  p99: ${p99.toFixed(2)}ms`);
  console.log('');

  // Test 3: Index effectiveness check
  console.log('Test 3: Index usage verification');
  console.log('-'.repeat(60));
  const metric3 = await measureQuery(
    prisma,
    'Index Check',
    `
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT
      e.id,
      1 - (e.embedding <=> $1::vector) as similarity
    FROM "ArticleEmbedding" e
    WHERE e."embeddingKey" = 'summary'
      AND 1 - (e.embedding <=> $2::vector) >= 0.1
    ORDER BY e.embedding <=> $3::vector
    LIMIT 5
  `,
    [vectorString, vectorString, vectorString]
  );
  metrics.push(metric3);
  console.log('');

  // Summary
  console.log('========================================');
  console.log('Performance Summary');
  console.log('========================================\n');

  metrics.forEach((m) => {
    console.log(`${m.queryType}:`);
    console.log(`  Planning Time: ${m.planningTime.toFixed(2)}ms`);
    console.log(`  Execution Time: ${m.executionTime.toFixed(2)}ms`);
    console.log(`  Total Time: ${m.totalTime.toFixed(2)}ms`);
    console.log(`  Index Used: ${m.indexUsed ? 'YES' : 'NO'}`);
    console.log(`  Rows Scanned: ${m.rowsScanned}`);
    console.log(`  Rows Returned: ${m.rowsReturned}`);
    console.log('');
  });

  console.log('Application-level (VectorSearchService):');
  console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
  console.log(`  p95: ${p95.toFixed(2)}ms (Target: < 200ms)`);
  console.log(`  Status: ${p95 < 200 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  await prisma.$disconnect();
}

async function getEmbeddingCount(prisma: any): Promise<number> {
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "ArticleEmbedding"
  `;
  return Number(result[0].count);
}

async function measureQuery(
  prisma: any,
  queryType: string,
  query: string,
  params: any[]
): Promise<PerformanceMetrics> {
  const result = await prisma.$queryRawUnsafe(query, ...params);

  const plan = result[0]['QUERY PLAN'][0];

  const executionTime = plan['Execution Time'];
  const planningTime = plan['Planning Time'];
  const totalTime = executionTime + planningTime;

  // Check if index was used
  const planStr = JSON.stringify(plan);
  const indexUsed =
    planStr.includes('Index Scan') ||
    planStr.includes('Bitmap Index Scan') ||
    planStr.includes('Index Only Scan');

  // Extract row counts
  let rowsScanned = 0;
  let rowsReturned = 0;

  function extractRows(node: any) {
    if (node['Actual Rows']) {
      rowsReturned = node['Actual Rows'];
    }
    if (node['Plan Rows']) {
      rowsScanned = Math.max(rowsScanned, node['Plan Rows']);
    }
    if (node['Plans']) {
      node['Plans'].forEach(extractRows);
    }
  }

  extractRows(plan['Plan']);

  console.log(`  Planning Time: ${planningTime.toFixed(2)}ms`);
  console.log(`  Execution Time: ${executionTime.toFixed(2)}ms`);
  console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
  console.log(`  Index Used: ${indexUsed ? 'YES' : 'NO'}`);
  console.log(`  Rows Scanned: ${rowsScanned}`);
  console.log(`  Rows Returned: ${rowsReturned}`);

  return {
    queryType,
    executionTime,
    planningTime,
    totalTime,
    indexUsed,
    rowsScanned,
    rowsReturned,
  };
}

main().catch((error) => {
  console.error('FATAL ERROR:', error);
  process.exitCode = 1;
});
