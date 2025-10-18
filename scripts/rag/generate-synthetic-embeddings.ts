import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local FIRST (override any existing env vars)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

/**
 * Generate Synthetic Embeddings for Scale Testing
 *
 * Creates random unit vectors (1536 dimensions) for performance testing.
 * Avoids OpenAI API costs while testing database performance at scale.
 *
 * Usage:
 *   npx tsx scripts/rag/generate-synthetic-embeddings.ts [count]
 *
 * Example:
 *   npx tsx scripts/rag/generate-synthetic-embeddings.ts 1000
 */

async function main() {
  const { prisma } = await import('@/lib/prisma');

  const targetCount = parseInt(process.argv[2] || '1000', 10);

  console.log('========================================');
  console.log('Synthetic Embedding Generation');
  console.log('========================================\n');

  console.log('Configuration:');
  console.log(`  Target count: ${targetCount} embeddings`);
  console.log(`  Dimensions: 1536`);
  console.log(`  Strategy: Random unit vectors\n`);

  // Get existing articles for synthetic embeddings
  const articles = await prisma.article.findMany({
    where: {
      summary: { not: null },
      skipReason: null,
    },
    select: { id: true, title: true },
    take: Math.ceil(targetCount / 2), // 2 embeddings per article
  });

  console.log(`Found ${articles.length} articles for synthetic embeddings`);

  if (articles.length === 0) {
    console.error('ERROR: No articles found');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  let created = 0;
  const batchSize = 100;

  console.log(`\nGenerating ${targetCount} synthetic embeddings...`);

  for (let i = 0; i < articles.length && created < targetCount; i++) {
    const article = articles[i];

    // Generate 2 embeddings per article (title + summary)
    const embeddingTypes: Array<'title' | 'summary'> = ['title', 'summary'];

    for (const embeddingKey of embeddingTypes) {
      if (created >= targetCount) break;

      // Generate random unit vector (1536 dimensions, normalized)
      const vector = generateRandomUnitVector(1536);
      const vectorString = `[${vector.map((v) => v.toFixed(8)).join(',  ')}]`;

      await prisma.$executeRaw`
        INSERT INTO "ArticleEmbedding" (
          id,
          "articleId",
          "embeddingKey",
          embedding,
          model,
          version,
          "computedAt"
        )
        VALUES (
          gen_random_uuid()::text,
          ${article.id},
          ${embeddingKey}::"EmbeddingKey",
          ${vectorString}::vector,
          ${'synthetic-test'},
          ${999},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("articleId", "embeddingKey", model, version)
        DO UPDATE SET
          embedding = EXCLUDED.embedding,
          "computedAt" = CURRENT_TIMESTAMP
      `;

      created++;

      if (created % batchSize === 0) {
        console.log(`  Progress: ${created}/${targetCount} embeddings created`);
      }
    }
  }

  console.log(`\n✅ Generated ${created} synthetic embeddings`);

  // Verify
  const totalCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "ArticleEmbedding"
  `;

  console.log(`\nDatabase Status:`);
  console.log(`  Total embeddings: ${Number(totalCount[0].count)}`);
  console.log(`  Synthetic (model=synthetic-test): ${created}`);
  console.log(`  Real (model=text-embedding-3-small): ${Number(totalCount[0].count) - created}`);

  await prisma.$disconnect();
}

/**
 * Generate random unit vector (normalized to length 1)
 */
function generateRandomUnitVector(dimensions: number): number[] {
  // Generate random vector
  const vector: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    vector.push(Math.random() * 2 - 1); // Random value between -1 and 1
  }

  // Normalize to unit length
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / magnitude);
}

main().catch((error) => {
  console.error('FATAL ERROR:', error);
  process.exitCode = 1;
});
