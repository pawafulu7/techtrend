import { PrismaClient } from '@prisma/client';
import { getAppDependencies } from '@/lib/di/bootstrap';

const prisma = new PrismaClient();

interface FixOptions {
  dryRun?: boolean;
  limit?: number;
  batchSize?: number;
}

async function fixMissingTranslations(options: FixOptions = {}) {
  const {
    dryRun = false,
    limit = 2557,
    batchSize = 10,
  } = options;

  console.error(`\n=== Translation Fix Script ===`);
  console.error(`Mode: ${dryRun ? 'Dry Run' : 'Production'}`);
  console.error(`Target: Up to ${limit} articles, Batch size: ${batchSize} articles/min\n`);

  // 1. Extract target articles
  const allArticles = await prisma.article.findMany({
    where: {
      translatedTitle: null,
      summary: { not: null }
    },
    orderBy: { publishedAt: 'desc' },
    take: limit * 2, // Fetch more to account for filtering
  });

  // Filter articles with English titles (10+ alphabetic characters)
  const articles = allArticles
    .filter(article => /[a-zA-Z]{10,}/.test(article.title))
    .slice(0, limit);

  console.error(`Target articles: ${articles.length}\n`);

  if (dryRun) {
    console.error('Dry Run complete. No actual processing was performed.');
    return;
  }

  const { translator: titleTranslator } = getAppDependencies();

  let successCount = 0;
  let failureCount = 0;
  let skipCount = 0;

  // 2. Batch processing
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    console.error(`\nProcessing: ${i + 1}-${Math.min(i + batchSize, articles.length)} articles`);

    await Promise.all(
      batch.map(async (article) => {
        try {
          // Skip if already translated
          const current = await prisma.article.findUnique({
            where: { id: article.id },
            select: { translatedTitle: true }
          });

          if (current?.translatedTitle?.trim()) {
            skipCount++;
            return;
          }

          // Execute translation
          const requestId = `fix-translation-${article.id}-${Date.now()}`;
          const translated = await titleTranslator.translateTitle({
            title: article.title,
            summary: article.summary ?? undefined,
            requestId,
          });

          const translatedTitle = translated?.trim() || undefined;

          if (translatedTitle !== undefined) {
            await prisma.article.update({
              where: { id: article.id },
              data: { translatedTitle }
            });

            successCount++;
            console.error(`  SUCCESS [${article.id}] ${translatedTitle.substring(0, 40)}...`);
          } else {
            failureCount++;
            console.error(`  FAILURE [${article.id}] Empty translation result`);
          }

        } catch (error) {
          failureCount++;
          console.error(`  ERROR [${article.id}] ${(error as Error).message}`);
        }
      })
    );

    // Rate limit mitigation: Wait 60 seconds
    if (i + batchSize < articles.length) {
      console.error(`\nWaiting 60 seconds to avoid API rate limits...`);
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }

  console.error(`\n\n=== Fix Summary ===`);
  console.error(`  Success: ${successCount} articles`);
  console.error(`  Failure: ${failureCount} articles`);
  console.error(`  Skipped: ${skipCount} articles`);
  console.error(`  Total: ${articles.length} articles\n`);
}

// CLI execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

fixMissingTranslations({ dryRun, limit })
  .catch(console.error)
  .finally(() => prisma.$disconnect());
