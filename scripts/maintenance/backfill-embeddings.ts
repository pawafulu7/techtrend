import { PrismaClient } from '@prisma/client';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';

const prisma = new PrismaClient();
const embeddingScheduler = new EmbeddingScheduler(prisma);

interface BackfillResult {
  total: number;
  enqueued: number;
  skipped: number;
  errors: number;
}

async function backfillEmbeddings(options: { dryRun?: boolean; batchSize?: number } = {}): Promise<BackfillResult> {
  const dryRun = options.dryRun ?? false;
  const batchSize = options.batchSize ?? 500;

  console.error('==================================================');
  console.error('Embedding Jobs Backfill');
  console.error('==================================================');
  console.error('Mode:', dryRun ? 'DRY RUN (no changes)' : 'LIVE (creating jobs)');
  console.error('Batch size:', batchSize);
  console.error('');

  try {
    // Find articles with summary but without embeddings
    const articlesWithoutEmbeddings = await prisma.article.findMany({
      where: {
        AND: [
          {
            AND: [
              { summary: { not: null } },
              { summary: { not: '' } }
            ]
          },
          {
            NOT: {
              embeddings: {
                some: {}
              }
            }
          }
        ]
      },
      select: {
        id: true,
        title: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    const total = articlesWithoutEmbeddings.length;
    console.error(`Found ${total} articles with summary but no embeddings`);

    if (total === 0) {
      console.error('No articles to process. Exiting.');
      return { total: 0, enqueued: 0, skipped: 0, errors: 0 };
    }

    if (dryRun) {
      console.error('');
      console.error('DRY RUN - Would create jobs for:');
      articlesWithoutEmbeddings.slice(0, 10).forEach((article, i) => {
        console.error(`  ${i + 1}. ${article.title.substring(0, 60)}...`);
      });
      if (total > 10) {
        console.error(`  ... and ${total - 10} more articles`);
      }
      console.error('');
      console.error('Run without --dry-run to actually create jobs.');
      return { total, enqueued: 0, skipped: 0, errors: 0 };
    }

    // Process in batches
    let enqueued = 0;
    let errors = 0;

    for (let i = 0; i < total; i += batchSize) {
      const batch = articlesWithoutEmbeddings.slice(i, i + batchSize);
      console.error(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(total / batchSize)} (${batch.length} articles)...`);

      for (const article of batch) {
        try {
          // Enqueue embedding job (UPSERT handles existing jobs)
          await embeddingScheduler.enqueue(article.id);
          enqueued++;

          if (enqueued % 100 === 0) {
            console.error(`  Progress: ${enqueued}/${total} jobs created...`);
          }
        } catch (error) {
          console.error(`  Error enqueueing job for ${article.id}:`, error instanceof Error ? error.message : String(error));
          errors++;
        }
      }

      // Rate limiting between batches
      if (i + batchSize < total) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.error('');
    console.error('==================================================');
    console.error('Backfill Complete');
    console.error('==================================================');
    console.error(`Total articles: ${total}`);
    console.error(`Jobs created/updated: ${enqueued}`);
    console.error(`Errors: ${errors}`);
    console.error('==================================================');

    return { total, enqueued, skipped: 0, errors };

  } catch (error) {
    console.error('Fatal error in backfill:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI execution
const isDryRun = process.argv.includes('--dry-run');
const batchSizeArg = process.argv.find(arg => arg.startsWith('--batch-size='));
const parsedBatchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : NaN;
const batchSize = !isNaN(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : undefined;

backfillEmbeddings({ dryRun: isDryRun, batchSize })
  .then(result => {
    if (!isDryRun) {
      console.error('');
      console.error('Next steps:');
      console.error('1. Run embedding worker: npm run worker:embedding');
      console.error('2. Monitor job processing');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
