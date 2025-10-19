import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const ACTIVE_MODEL = 'text-embedding-004';
const ACTIVE_VERSION = 1;
const BATCH_SIZE = 500; // Create jobs in batches to avoid long transactions

async function backfillEmbeddings() {
  console.log('='.repeat(60));
  console.log('Embedding Backfill Script');
  console.log('='.repeat(60));
  console.log();

  // Find articles without embeddings
  console.log('Searching for articles without embeddings...');

  const articlesWithoutEmbeddings = await prisma.article.findMany({
    where: {
      AND: [
        { summary: { not: null } }, // Has summary
        {
          NOT: {
            embeddings: {
              some: {
                embeddingKey: 'summary',
                model: ACTIVE_MODEL,
                version: ACTIVE_VERSION,
              },
            },
          },
        },
      ],
    },
    select: { id: true, title: true, createdAt: true },
    orderBy: { createdAt: 'desc' }, // Newest first
  });

  console.log(`Found ${articlesWithoutEmbeddings.length} articles without embeddings`);
  console.log();

  if (articlesWithoutEmbeddings.length === 0) {
    console.log('No articles to backfill. Exiting.');
    return;
  }

  // Create jobs in batches
  let totalCreated = 0;
  let totalSkipped = 0;

  for (let i = 0; i < articlesWithoutEmbeddings.length; i += BATCH_SIZE) {
    const batch = articlesWithoutEmbeddings.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(articlesWithoutEmbeddings.length / BATCH_SIZE);

    console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} articles)...`);

    let batchCreated = 0;
    let batchSkipped = 0;

    for (const article of batch) {
      try {
        await prisma.embeddingJob.create({
          data: {
            articleId: article.id,
            status: 'PENDING',
          },
        });
        batchCreated++;
      } catch (error: any) {
        // Skip duplicates (already has job)
        if (error.code === 'P2002') {
          batchSkipped++;
          continue;
        }
        throw error;
      }
    }

    totalCreated += batchCreated;
    totalSkipped += batchSkipped;

    console.log(
      `  Batch ${batchNumber}: Created ${batchCreated}, Skipped ${batchSkipped}`
    );

    // Small delay between batches to avoid overwhelming database
    if (i + BATCH_SIZE < articlesWithoutEmbeddings.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  logger.info(
    {
      total: articlesWithoutEmbeddings.length,
      created: totalCreated,
      skipped: totalSkipped,
    },
    'Backfill jobs created'
  );

  // Calculate estimated completion time
  const estimatedMinutes = Math.ceil(totalCreated / 300) * 5;

  console.log();
  console.log('='.repeat(60));
  console.log('Backfill Summary');
  console.log('='.repeat(60));
  console.log(`Total articles without embeddings: ${articlesWithoutEmbeddings.length}`);
  console.log(`Jobs created: ${totalCreated}`);
  console.log(`Jobs skipped (already exists): ${totalSkipped}`);
  console.log();
  console.log('The worker (/api/workers/embedding) will process these jobs automatically.');
  console.log(`Estimated completion time: ${estimatedMinutes} minutes (300 jobs per 5 min)`);
  console.log();
  console.log('Monitor progress:');
  console.log('1. Vercel Dashboard: https://vercel.com/your-project/logs');
  console.log('2. Database query:');
  console.log('   SELECT status, COUNT(*) FROM embedding_jobs GROUP BY status;');
  console.log();
  console.log('Verify completion:');
  console.log('   SELECT COUNT(*) FROM embedding_jobs WHERE status = \'COMPLETED\';');
  console.log('='.repeat(60));
}

backfillEmbeddings()
  .then(() => {
    console.log();
    console.log('Backfill script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error();
    console.error('Backfill failed:', error);
    process.exit(1);
  });
