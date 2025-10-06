import { PrismaClient } from '@prisma/client';
import { INSTRUCTION_PATTERNS } from '@/lib/ai/constants';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function detectContaminatedSummaries() {
  console.log('=== Contaminated Summaries Detection ===\n');

  const contaminated = await prisma.article.findMany({
    where: {
      OR: [
        { summary: { contains: '【条件】' } },
        { summary: { contains: '【書き方】' } },
        { summary: { contains: '【文末】' } },
        { summary: { contains: '- 記事の核心的な' } },
        { summary: { contains: '- 技術的価値を' } },
        { summary: { contains: '- 冗長な表現' } },
        { summary: { contains: '[ここに' } },
      ],
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

  console.log(`Found ${contaminated.length} contaminated articles\n`);

  const report = contaminated.map((article, index) => ({
    index: index + 1,
    id: article.id,
    title: article.title,
    summaryPreview: article.summary.substring(0, 100),
    computedAt: article.summaryComputedAt?.toISOString(),
    matchedPatterns: INSTRUCTION_PATTERNS
      .filter(pattern => pattern.test(article.summary))
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
    console.log(`  ${item.index}. ${item.id} - ${item.title.substring(0, 60)}...`);
  });

  await prisma.$disconnect();
}

detectContaminatedSummaries().catch((error) => {
  console.error('Error detecting contaminated summaries:', error);
  process.exit(1);
});
