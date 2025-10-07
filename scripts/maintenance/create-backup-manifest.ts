import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { CONTAMINATION_SEARCH_TERMS, INSTRUCTION_PATTERNS } from '@/lib/ai/constants';

const prisma = new PrismaClient();

interface BackupManifest {
  createdAt: string;
  totalArticles: number;
  contaminatedArticles: number;
  backupFiles: {
    full: string;
    fullSize: number;
  };
  contaminatedArticleIds: Array<{
    id: string;
    title: string;
    summaryPreview: string;
    summaryComputedAt: string | null;
  }>;
}

async function createBackupManifest() {
  console.log('=== Creating Backup Manifest ===\n');

  const timestamp = new Date().toISOString().split('T')[0];

  const totalCount = await prisma.article.count();

  const candidates = await prisma.article.findMany({
    where: {
      OR: CONTAMINATION_SEARCH_TERMS.map(term => ({ summary: { contains: term } })),
    },
    select: {
      id: true,
      title: true,
      summary: true,
      summaryComputedAt: true,
    },
    orderBy: {
      summaryComputedAt: 'desc',
    },
  });

  const contaminated = candidates.filter((article) =>
    (article.summary ?? '').split('\n').some((line) =>
      INSTRUCTION_PATTERNS.some((pattern) => pattern.test(line.trim()))
    )
  );

  const backupDir = path.join(process.cwd(), 'backups');
  const fullBackupPath = path.join(backupDir, `article-table-full-${timestamp}.sql`);

  let fullBackupSize = 0;
  try {
    const stats = fs.statSync(fullBackupPath);
    fullBackupSize = stats.size;
  } catch (error) {
    console.warn(`Warning: Could not stat backup file: ${fullBackupPath}`);
  }

  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    totalArticles: totalCount,
    contaminatedArticles: contaminated.length,
    backupFiles: {
      full: fullBackupPath,
      fullSize: fullBackupSize,
    },
    contaminatedArticleIds: contaminated.map(article => ({
      id: article.id,
      title: article.title ?? '',
      summaryPreview: article.summary?.substring(0, 100) ?? '',
      summaryComputedAt: article.summaryComputedAt?.toISOString() || null,
    })),
  };

  const manifestPath = path.join(backupDir, `manifest-${timestamp}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Total Articles: ${totalCount}`);
  console.log(`Contaminated Articles: ${contaminated.length}`);
  console.log(`Full Backup: ${fullBackupPath} (${(fullBackupSize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`\nManifest saved to: ${manifestPath}`);

  console.log(`\nContaminated Article IDs:`);
  contaminated.forEach((article, index) => {
    console.log(`  ${index + 1}. ${article.id} - ${article.title?.substring(0, 50) ?? '[No title]'}...`);
  });

  await prisma.$disconnect();
}

createBackupManifest().catch((error) => {
  console.error('Error creating backup manifest:', error);
  process.exit(1);
});
