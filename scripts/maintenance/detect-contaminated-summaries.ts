import { createPrismaClient } from '@/lib/prisma/create-client';
import { INSTRUCTION_PATTERNS, CONTAMINATION_SEARCH_TERMS } from '@/lib/ai/constants';
import * as fs from 'fs';
import * as path from 'path';

const prisma = createPrismaClient();

async function detectContaminatedSummaries() {
  console.log('=== Contaminated Summaries Detection ===\n');

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

  console.log(`Found ${contaminated.length} contaminated articles\n`);

  const report = contaminated.map((article, index) => ({
    index: index + 1,
    id: article.id,
    title: article.title ?? '',
    summaryPreview: article.summary?.substring(0, 100) ?? '',
    computedAt: article.summaryComputedAt?.toISOString(),
    matchedPatterns: INSTRUCTION_PATTERNS
      .filter(pattern => pattern.test(article.summary ?? ''))
      .map(p => p.toString()),
  }));

  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const outputPath = path.join(reportsDir, `contaminated-summaries-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`Report saved to: ${outputPath}`);
  console.log(`\nContaminated Article IDs:`);
  report.forEach(item => {
    console.log(`  ${item.index}. ${item.id} - ${item.title?.substring(0, 60) ?? '[No title]'}...`);
  });

  await prisma.$disconnect();
}

detectContaminatedSummaries().catch((error) => {
  console.error('Error detecting contaminated summaries:', error);
  process.exit(1);
});
