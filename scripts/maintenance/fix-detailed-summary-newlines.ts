import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface FixOptions {
  dryRun?: boolean;
  backup?: boolean;
}

async function fixDetailedSummaryNewlines(options: FixOptions = {}) {
  const { dryRun = false, backup = true } = options;

  console.error('\n=== Detailed Summary Newline Fix Script ===');
  console.error(`Mode: ${dryRun ? 'Dry Run' : 'Production'}`);
  console.error(`Backup: ${backup ? 'Enabled' : 'Disabled'}\n`);

  // 1. Backup before making changes (optional)
  if (backup && !dryRun) {
    try {
      const backupData = await prisma.$queryRaw<Array<{ id: string; detailedSummary: string }>>`
        SELECT id, "detailedSummary"
        FROM "Article"
        WHERE "detailedSummary" IS NOT NULL
          AND "detailedSummary" ~ '・[^：\n]+：\s*\n(?!・)'
      `;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `backup_detailed_summary_${timestamp}.json`;
      fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
      console.error(`Backup created: ${backupPath}`);
      console.error(`Backed up ${backupData.length} articles\n`);
    } catch (error) {
      console.error('Backup creation failed. Aborting to prevent data loss.');
      console.error(error);
      throw error;
    }
  }

  // 2. Find articles with newline issues
  const articles = await prisma.$queryRaw<Array<{ id: string; detailedSummary: string }>>`
    SELECT id, "detailedSummary"
    FROM "Article"
    WHERE "detailedSummary" IS NOT NULL
      AND "detailedSummary" ~ '・[^：\n]+：\s*\n(?!・)'
  `;

  console.error(`Found ${articles.length} articles with newline issues\n`);

  if (articles.length === 0) {
    console.error('No articles to fix. Exiting.');
    return;
  }

  if (dryRun) {
    // Display samples
    console.error('=== Sample Preview (first 3 articles) ===\n');
    articles.slice(0, 3).forEach((article, index) => {
      console.error(`[${index + 1}] Article ID: ${article.id}`);
      console.error('Before:', article.detailedSummary.substring(0, 150).replace(/\n/g, '\\n'));
      const fixed = article.detailedSummary.replace(
        /^(・[^：\n]+：)\s*\n(?!・)/gm,
        '$1'
      );
      console.error('After:', fixed.substring(0, 150).replace(/\n/g, '\\n'));
      console.error('');
    });
    console.error('Dry Run complete. No actual changes were made.');
    return;
  }

  // 3. Apply fixes
  let successCount = 0;
  let failureCount = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const article of articles) {
        const fixed = article.detailedSummary.replace(
          /^(・[^：\n]+：)\s*\n(?!・)/gm,
          '$1'
        );

        await tx.article.update({
          where: { id: article.id },
          data: { detailedSummary: fixed }
        });

        successCount++;
        console.error(`  SUCCESS [${article.id}]`);
      }
    });
  } catch (error) {
    failureCount = articles.length - successCount;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  TRANSACTION FAILED: ${message}`);
    console.error('  All changes have been rolled back.');
  }

  console.error(`\n=== Fix Summary ===`);
  console.error(`  Success: ${successCount} articles`);
  console.error(`  Failure: ${failureCount} articles`);
  console.error(`  Total: ${articles.length} articles\n`);
}

// CLI execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noBackup = args.includes('--no-backup');

fixDetailedSummaryNewlines({
  dryRun,
  backup: !noBackup
})
  .catch(console.error)
  .finally(() => prisma.$disconnect());
