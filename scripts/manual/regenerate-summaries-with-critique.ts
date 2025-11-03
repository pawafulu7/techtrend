import { getPrismaClient } from '@/lib/cli/utils/database';
import { SummaryManager } from '@/lib/services/summary-manager';

interface RegenerateOptions {
  limit?: number;
  dryRun?: boolean;
  verbose?: boolean;
  qualityThreshold?: number;
}

async function regenerateSummariesWithCritique(options: RegenerateOptions = {}) {
  const { limit = 500, dryRun = false, verbose = true, qualityThreshold = 50 } = options;

  console.log('='.repeat(60));
  console.log('Regenerate Summaries with AI Critique');
  console.log('='.repeat(60));
  console.log(`Limit: ${limit}`);
  console.log(`Quality Score Threshold: ${qualityThreshold}`);
  console.log(`Dry Run: ${dryRun}`);
  console.log(`Verbose: ${verbose}`);
  console.log('='.repeat(60));
  console.log();

  const prisma = getPrismaClient();

  try {
    // Find articles without critique that have summary and content
    const articles = await prisma.article.findMany({
      where: {
        AND: [
          { critiqueVersion: null },
          { summary: { not: null } },
          { detailedSummary: { not: null } },
          { content: { not: null } },
          { qualityScore: { gte: qualityThreshold } },
        ],
      },
      orderBy: { qualityScore: 'desc' },
      take: limit,
    });

    console.log(`Found ${articles.length} articles to regenerate`);
    console.log();

    if (dryRun) {
      console.log('DRY RUN MODE: No regeneration will occur');
      console.log();
      console.log('Sample articles (top 10):');
      articles.slice(0, 10).forEach((article, index) => {
        console.log(`${index + 1}. ${article.title}`);
        console.log(`   Score: ${article.qualityScore}, ID: ${article.id}`);
      });
      return;
    }

    const summaryManager = new SummaryManager(prisma);
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const article of articles) {
      try {
        if (verbose) {
          console.log(`\nProcessing ${processed + 1}/${articles.length}: ${article.title.substring(0, 60)}...`);
        } else {
          process.stdout.write('.');
        }

        // Regenerate summary (critique will be generated automatically)
        const result = await summaryManager['generateSummaryAndTags'](
          article.title,
          article.content!,
          article.id
        );

        // Update article
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            translatedTitle: result.translatedTitle,
            summaryComputedAt: new Date(),
            critique: result.critique as any,
            critiqueVersion: result.critiqueVersion,
          },
        });

        // Update tags
        if (result.tags?.length > 0) {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                set: [],
                connectOrCreate: result.tags.map((name) => ({
                  where: { name },
                  create: { name },
                })),
              },
            },
          });
        }

        processed++;
        succeeded++;

        if (verbose && result.critique) {
          console.log('  Critique generated:');
          console.log(`    Trend: ${result.critique.contextComparison.substring(0, 80)}...`);
          console.log(`    Audience: ${result.critique.recommendedAudience.substring(0, 80)}...`);
          console.log(`    Value: ${result.critique.valueAssessment.substring(0, 80)}...`);
        }

        if (processed % 10 === 0) {
          console.log(`\nProgress: ${processed}/${articles.length}...`);
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        console.error(`\nFailed to regenerate article ${article.id}:`, error);
        failed++;
      }
    }

    if (!verbose) {
      console.log();
    }

    console.log();
    console.log('='.repeat(60));
    console.log('Regeneration Summary');
    console.log('='.repeat(60));
    console.log(`Processed: ${processed}`);
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Failed: ${failed}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Regeneration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI execution
const args = process.argv.slice(2);
const limit = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : 500;
const dryRun = args.includes('--dry-run');
const verbose = !args.includes('--quiet');
const qualityThreshold = args.includes('--quality')
  ? parseInt(args[args.indexOf('--quality') + 1], 10)
  : 50;

regenerateSummariesWithCritique({ limit, dryRun, verbose, qualityThreshold })
  .then(() => {
    console.log('\nRegeneration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nRegeneration failed:', error);
    process.exit(1);
  });
