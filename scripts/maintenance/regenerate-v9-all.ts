import { createPrismaClient } from '@/lib/prisma/create-client';
import { SummaryManager } from '@/lib/services/summary/summary-manager';
import * as fs from 'fs';

const prisma = createPrismaClient();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== V9 Full Regeneration Start ===');

  // Load article IDs from queue file
  const queueFile = '.claude/data/regeneration-queue-v9.json';
  const articleIds: string[] = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));

  console.log(`Total articles to process: ${articleIds.length}`);
  console.log('');

  const manager = new SummaryManager(prisma);
  const results: any[] = [];
  const failures: any[] = [];

  for (let i = 0; i < articleIds.length; i++) {
    const id = articleIds[i];
    const progress = `[${i + 1}/${articleIds.length}]`;

    try {
      const before = await prisma.article.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          content: true,
          detailedSummary: true,
        },
      });

      if (!before?.content) {
        console.log(`${progress} [${id}] SKIP: No content`);
        failures.push({ id, reason: 'no_content', index: i + 1 });
        continue;
      }

      const beforeLen = before.detailedSummary?.length ?? 0;
      console.log(`${progress} [${id}] Processing...`);
      console.log(`  Title: ${before.title.substring(0, 60)}...`);
      console.log(`  Before: ${beforeLen} chars`);

      const startTime = Date.now();

      // Regenerate with error handling
      let result;
      try {
        result = await manager.regenerateSummaries({
          articleIds: [id],
          batch: 1,
          force: true,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`  ERROR: ${errorMsg}`);
        failures.push({ id, reason: 'regeneration_failed', error: errorMsg, index: i + 1 });
        continue;
      }

      const duration = Date.now() - startTime;

      const after = await prisma.article.findUnique({
        where: { id },
        select: { detailedSummary: true },
      });

      const afterLen = after?.detailedSummary?.length ?? 0;
      const improvement = afterLen - beforeLen;
      const meetsTarget = afterLen >= 600;

      console.log(`  After: ${afterLen} chars`);
      console.log(`  Improvement: ${improvement >= 0 ? '+' : ''}${improvement} chars`);
      console.log(`  Meets 600+ target: ${meetsTarget ? 'YES' : 'NO'}`);
      console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);

      if (result.errors && result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.length}`);
        failures.push({ id, reason: 'quality_failed', errors: result.errors, index: i + 1 });
      }

      results.push({
        id,
        beforeLen,
        afterLen,
        improvement,
        meetsTarget,
        status: result.errors && result.errors.length > 0 ? 'error' : 'success',
        duration: Math.round(duration / 1000),
      });

      console.log('');

      // 2-second delay between requests (rate limit mitigation)
      if (i < articleIds.length - 1) {
        await delay(2000);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${progress} [${id}] EXCEPTION: ${errorMessage}`);
      failures.push({ id, reason: 'exception', message: errorMessage, index: i + 1 });
      console.log('');
    }
  }

  // Summary statistics
  console.log('');
  console.log('=== Regeneration Summary ===');
  console.log(`Total processed: ${results.length}/${articleIds.length}`);
  console.log(`Success: ${results.filter((r) => r.status === 'success').length}`);
  console.log(`Errors/Failures: ${failures.length}`);
  console.log(`Meeting 600+ target: ${results.filter((r) => r.meetsTarget).length}`);
  console.log('');

  if (failures.length > 0) {
    console.log('Failed articles:');
    failures.forEach((f) => {
      console.log(`  [${f.index}] ${f.id}: ${f.reason}`);
    });
    console.log('');
  }

  console.log('Results summary:');
  console.table(results);

  // Save failure log
  if (failures.length > 0) {
    const failureLog = '.claude/data/regeneration-failures.json';
    fs.writeFileSync(failureLog, JSON.stringify(failures, null, 2));
    console.log(`Failure log saved to: ${failureLog}`);
  }

  await prisma.$disconnect();
}

main();
