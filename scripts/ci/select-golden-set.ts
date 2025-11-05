import { PrismaClient } from '@prisma/client';
import { writeFile } from 'fs/promises';
import type { GoldenExample, GoldenSetMetadata } from '@/lib/ai/testing/types';

const prisma = new PrismaClient();

interface CategoryJudgment {
  category: 'general' | 'technical' | 'thin_content' | 'multilingual';
  confidence: number;
  reason: string;
  needsHumanReview: boolean;
}

const TECHNICAL_KEYWORDS = {
  infrastructure: [
    'kubernetes', 'k8s', 'docker', 'terraform', 'aws', 'gcp', 'azure',
    'cloud', 'serverless', 'lambda', 'vercel', 'netlify',
  ],
  dataAI: [
    'machine learning', 'ml', 'deep learning', 'llm', 'nlp',
    'data pipeline', 'bigquery', 'pytorch', 'tensorflow',
    'AI', 'Gemini', 'GPT', 'OpenAI', 'Hugging Face',
  ],
  securitySRE: [
    'observability', 'prometheus', 'grafana', 'zerotrust',
    'iac', 'セキュリティ', 'Security', 'CVE', 'ランサムウェア',
    'サイバー攻撃', 'VPN', 'EDR',
  ],
  programming: [
    'typescript', 'rust', 'go', 'golang', 'python', 'java',
    'react', 'next.js', 'vue', 'nuxt', 'angular',
    'rails', 'django', 'spring', 'node.js',
  ],
  database: [
    'postgres', 'postgresql', 'mysql', 'mongodb', 'redis',
    'prisma', 'データベース', 'Database', 'SQL', 'NoSQL',
  ],
};

const ALL_TECHNICAL_KEYWORDS = Object.values(TECHNICAL_KEYWORDS).flat();

function detectCategory(article: any): CategoryJudgment {
  const contentLength = article.enrichedContent?.length || article.content?.length || 0;
  const title = article.title;
  const content = article.enrichedContent || article.content || '';
  const tags = article.tags?.map((t: any) => t.name.toLowerCase()) || [];

  const isEnglishTitle = /^[a-zA-Z0-9\s\-:,\.()[\]]+$/.test(title);
  if (isEnglishTitle) {
    return {
      category: 'multilingual',
      confidence: 0.95,
      reason: 'English title detected',
      needsHumanReview: false,
    };
  }

  const technicalTagCount = tags.filter((tag: string) =>
    ALL_TECHNICAL_KEYWORDS.some(kw => tag.toLowerCase().includes(kw.toLowerCase()))
  ).length;

  const contentLowerCase = content.toLowerCase();
  const technicalKeywordDensity = ALL_TECHNICAL_KEYWORDS.filter(kw =>
    contentLowerCase.includes(kw.toLowerCase())
  ).length;

  if (technicalTagCount >= 1 && technicalKeywordDensity >= 3) {
    const matchedCategories = Object.entries(TECHNICAL_KEYWORDS)
      .filter(([_, keywords]) =>
        keywords.some(kw => tags.some((tag: string) => tag.toLowerCase().includes(kw.toLowerCase())))
      )
      .map(([category]) => category);

    return {
      category: 'technical',
      confidence: 0.85,
      reason: `${technicalTagCount} technical tag(s), ${technicalKeywordDensity} keyword density (${matchedCategories.join(', ')})`,
      needsHumanReview: false,
    };
  }

  if (contentLength < 500) {
    return {
      category: 'thin_content',
      confidence: 0.90,
      reason: `Content length < 500 (${contentLength} chars)`,
      needsHumanReview: contentLength < 300,
    };
  }

  const generalConfidence = technicalTagCount > 0 ? 0.60 : 0.80;

  return {
    category: 'general',
    confidence: generalConfidence,
    reason: technicalTagCount > 0
      ? `Some technical tags (${technicalTagCount}) but low keyword density (${technicalKeywordDensity})`
      : 'No technical tags, general content',
    needsHumanReview: generalConfidence < 0.70,
  };
}

function detectDifficulty(article: any): 'easy' | 'medium' | 'hard' {
  const contentLength = article.enrichedContent?.length || article.content?.length || 0;
  const tagCount = article.tags?.length || 0;

  if (contentLength < 500 || tagCount <= 3) return 'easy';
  if (contentLength < 2000 || tagCount <= 6) return 'medium';
  return 'hard';
}

async function selectGoldenSet(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Golden Set Selection');
  console.log('='.repeat(60));
  console.log('');

  const candidates = await prisma.article.findMany({
    where: {
      qualityScore: { gte: 90 },
      summary: { not: null },
      detailedSummary: { not: null },
    },
    include: {
      tags: { select: { name: true } },
    },
    orderBy: { qualityScore: 'desc' },
  });

  console.log(`Found ${candidates.length} high-quality articles (qualityScore >= 90)\n`);

  const categorized = {
    general: [] as any[],
    technical: [] as any[],
    thin_content: [] as any[],
    multilingual: [] as any[],
  };

  const needsReview: any[] = [];

  for (const article of candidates) {
    const judgment = detectCategory(article);

    if (judgment.needsHumanReview) {
      needsReview.push({ article, judgment });
    }

    categorized[judgment.category].push({
      article,
      judgment,
    });
  }

  console.log('Category distribution:');
  console.log(`  General: ${categorized.general.length}`);
  console.log(`  Technical: ${categorized.technical.length}`);
  console.log(`  Thin Content: ${categorized.thin_content.length}`);
  console.log(`  Multilingual: ${categorized.multilingual.length}`);
  console.log(`\nNeeds human review: ${needsReview.length}\n`);

  const targetDistribution = {
    general: 24,
    technical: 14,
    thin_content: 8,
    multilingual: 2,
  };

  const selected: GoldenExample[] = [];

  for (const [category, target] of Object.entries(targetDistribution)) {
    const available = categorized[category as keyof typeof categorized];
    const selectedCategoryExamples = available
      .slice(0, target)
      .map(({ article, judgment }) => ({
        id: `golden-${article.id}`,
        article: {
          title: article.title,
          content: article.enrichedContent || article.content || '',
          url: article.url,
        },
        expectedOutput: {
          summary: article.summary!,
          detailedSummary: article.detailedSummary!,
          tags: article.tags.map((t: any) => t.name),
        },
        metadata: {
          category: judgment.category,
          difficulty: detectDifficulty(article),
          categoryConfidence: judgment.confidence,
          needsHumanReview: judgment.needsHumanReview,
          categoryReason: judgment.reason,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        acceptanceThreshold: {
          semanticSimilarity: 0.95,
          minimumQuality: 0.90,
        },
        sourceArticleId: article.id,
      }));

    selected.push(...selectedCategoryExamples);

    console.log(`Selected ${selectedCategoryExamples.length}/${target} ${category} examples`);

    if (selectedCategoryExamples.length < target) {
      console.warn(`  WARNING: Only ${selectedCategoryExamples.length} available (target: ${target})`);
    }
  }

  const qualityScores = selected.map(ex => {
    const original = candidates.find(c => c.id === ex.sourceArticleId);
    return original?.qualityScore || 0;
  });

  const metadata: GoldenSetMetadata = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    totalExamples: selected.length,
    categoryDistribution: {
      general: selected.filter(ex => ex.metadata.category === 'general').length,
      technical: selected.filter(ex => ex.metadata.category === 'technical').length,
      thin_content: selected.filter(ex => ex.metadata.category === 'thin_content').length,
      multilingual: selected.filter(ex => ex.metadata.category === 'multilingual').length,
    },
    qualityScoreRange: {
      min: Math.min(...qualityScores),
      max: Math.max(...qualityScores),
      avg: qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length,
    },
    thresholdCalibration: {
      percentile95: 0.95,
      byCategory: {},
    },
  };

  const output = {
    metadata,
    examples: selected,
  };

  await writeFile(
    'lib/ai/testing/golden-set.json',
    JSON.stringify(output, null, 2)
  );

  console.log(`\nGolden Set created: ${selected.length} examples`);
  console.log(`Output: lib/ai/testing/golden-set.json\n`);

  console.log('Metadata summary:');
  console.log(`  Version: ${metadata.version}`);
  console.log(`  Total examples: ${metadata.totalExamples}`);
  console.log(`  Quality score range: ${metadata.qualityScoreRange.min}-${metadata.qualityScoreRange.max} (avg: ${metadata.qualityScoreRange.avg.toFixed(1)})`);
  console.log('');
  console.log('Category distribution:');
  for (const [category, count] of Object.entries(metadata.categoryDistribution)) {
    console.log(`  ${category}: ${count} (${((count / metadata.totalExamples) * 100).toFixed(1)}%)`);
  }

  if (needsReview.length > 0) {
    const reviewList = needsReview.map(({ article, judgment }) => ({
      id: article.id,
      title: article.title,
      category: judgment.category,
      confidence: judgment.confidence,
      reason: judgment.reason,
    }));

    await writeFile(
      'lib/ai/testing/golden-set-review-needed.json',
      JSON.stringify(reviewList, null, 2)
    );

    console.log(`\nHuman review needed: ${reviewList.length} examples`);
    console.log(`Output: lib/ai/testing/golden-set-review-needed.json`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Next step: Run threshold calibration');
  console.log('  npx tsx scripts/ci/calibrate-thresholds.ts');
  console.log('='.repeat(60));
}

selectGoldenSet()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
