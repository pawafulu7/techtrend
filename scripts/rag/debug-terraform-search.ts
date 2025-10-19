import 'dotenv/config';
import { EmbeddingService } from '@/lib/rag/embedding-service';
import { prisma } from '@/lib/prisma';

async function main() {
  const embeddingService = new EmbeddingService();

  console.log('='.repeat(60));
  console.log(' Debugging Terraform Search Issue');
  console.log('='.repeat(60));
  console.log('');

  // Generate embedding for "terraform"
  console.log('1. Generating embedding for "terraform"...');
  const queryEmbedding = await embeddingService.embedText('terraform');
  const vectorString = `[${queryEmbedding.map(v => v.toFixed(8)).join(',')}]`;
  console.log('   ✅ Embedding generated');
  console.log('');

  // Test with different thresholds
  const thresholds = [0.3, 0.4, 0.5];

  for (const threshold of thresholds) {
    const results = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        a.title,
        a.summary,
        1 - (e.embedding <=> '${vectorString}'::vector) as similarity
      FROM "ArticleEmbedding" e
      INNER JOIN "Article" a ON a.id = e."articleId"
      WHERE e.model = 'text-embedding-3-small'
        AND e.version = 1
        AND e."embeddingKey" = 'summary'
        AND (a.title ILIKE '%terraform%' OR a.summary ILIKE '%terraform%')
        AND 1 - (e.embedding <=> '${vectorString}'::vector) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT 5
    `);

    console.log(`Threshold ${threshold}: ${results.length} results`);
    if (results.length > 0) {
      results.forEach((r, idx) => {
        console.log(`  ${idx + 1}. Similarity: ${(r.similarity * 100).toFixed(2)}%`);
        console.log(`     Title: ${r.title.substring(0, 80)}`);
      });
    } else {
      console.log('  (No results)');
    }
    console.log('');
  }

  // Also test without title/summary filter to see all terraform similarities
  console.log('All terraform articles (no threshold filter):');
  const allResults = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      a.title,
      1 - (e.embedding <=> '${vectorString}'::vector) as similarity
    FROM "ArticleEmbedding" e
    INNER JOIN "Article" a ON a.id = e."articleId"
    WHERE e.model = 'text-embedding-3-small'
      AND e.version = 1
      AND e."embeddingKey" = 'summary'
      AND (a.title ILIKE '%terraform%' OR a.summary ILIKE '%terraform%')
    ORDER BY similarity DESC
    LIMIT 10
  `);

  allResults.forEach((r, idx) => {
    console.log(`  ${idx + 1}. ${(r.similarity * 100).toFixed(2)}% - ${r.title.substring(0, 60)}`);
  });
}

main().then(() => process.exit(0)).catch(console.error);
