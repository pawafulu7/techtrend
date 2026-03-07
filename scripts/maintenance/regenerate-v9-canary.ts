import { PrismaClient } from '@prisma/client';
import { SummaryManager } from '@/lib/services/summary/summary-manager';

const prisma = new PrismaClient();

const CANARY_ARTICLE_IDS = [
  'cmiguke0n001atem7owtd3gej', // Shortest: 263 chars
  'cmigujfoo000etem7nc6i3bza', // Median: 605 chars
  'cmigsdyeo000dtetpo6fmeqve', // Longest: 890 chars
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== V9 Canary Regeneration Start ===');
  console.log(`Target articles: ${CANARY_ARTICLE_IDS.length}`);
  console.log('');

  const manager = new SummaryManager(prisma);
  const results = [];

  for (const id of CANARY_ARTICLE_IDS) {
    try {
      // Get article before regeneration
      const before = await prisma.article.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          content: true,
          summary: true,
          detailedSummary: true,
          summaryVersion: true,
        },
      });

      if (!before) {
        console.error(`[${id}] ERROR: Article not found`);
        results.push({ id, status: 'error', message: 'Article not found' });
        continue;
      }

      if (!before.content) {
        console.error(`[${id}] ERROR: No content`);
        results.push({ id, status: 'error', message: 'No content' });
        continue;
      }

      const beforeLen = before.detailedSummary?.length ?? 0;
      console.log(`[${id}] Processing...`);
      console.log(`  Before: ${beforeLen} chars (version: ${before.summaryVersion})`);
      console.log(`  Title: ${before.title.substring(0, 50)}...`);

      // Regenerate summary
      const startTime = Date.now();
      const result = await manager.regenerateSummaries({
        articleIds: [id],
        batch: 1,
        force: true,
      });
      const duration = Date.now() - startTime;

      // Get article after regeneration
      const after = await prisma.article.findUnique({
        where: { id },
        select: {
          detailedSummary: true,
          summaryVersion: true,
          summaryComputedAt: true,
        },
      });

      const afterLen = after?.detailedSummary?.length ?? 0;
      const improvement = afterLen - beforeLen;
      const meetsTarget = afterLen >= 900;

      console.log(`  After: ${afterLen} chars (version: ${after?.summaryVersion})`);
      console.log(`  Improvement: ${improvement >= 0 ? '+' : ''}${improvement} chars`);
      console.log(`  Meets target (>=900): ${meetsTarget ? 'YES' : 'NO'}`);
      console.log(`  Duration: ${duration}ms`);

      if (result.errors && result.errors.length > 0) {
        console.error(`  Errors: ${JSON.stringify(result.errors)}`);
      }

      results.push({
        id,
        beforeLen,
        afterLen,
        improvement,
        meetsTarget,
        version: after?.summaryVersion,
        status: result.errors && result.errors.length > 0 ? 'error' : 'success',
        duration,
      });

      console.log('');

      // 2-second delay between articles
      if (id !== CANARY_ARTICLE_IDS[CANARY_ARTICLE_IDS.length - 1]) {
        await delay(2000);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${id}] EXCEPTION: ${errorMessage}`);
      results.push({ id, status: 'exception', message: errorMessage });
      console.log('');
    }
  }

  // Summary statistics
  console.log('=== Canary Regeneration Summary ===');
  console.log(`Total processed: ${results.length}/${CANARY_ARTICLE_IDS.length}`);
  console.log(`Success: ${results.filter((r) => r.status === 'success').length}`);
  console.log(`Errors: ${results.filter((r) => r.status === 'error' || r.status === 'exception').length}`);
  console.log(`Meeting target (>=900): ${results.filter((r) => r.meetsTarget).length}`);
  console.log('');
  console.log('Results:');
  console.table(results);

  await prisma.$disconnect();
}

main();
