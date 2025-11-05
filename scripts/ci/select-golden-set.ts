import { PrismaClient } from '@prisma/client';
import { writeFile } from 'fs/promises';
import type { GoldenExample, GoldenSetMetadata } from '@/lib/ai/testing/types';

const prisma = new PrismaClient();

type Category = 'general' | 'technical' | 'thin_content' | 'multilingual';
type TargetSize = 48 | 50 | 75 | 100;
type CliTarget = Exclude<TargetSize, 48>;

interface CategoryJudgment {
  category: Category;
  confidence: number;
  reason: string;
  needsHumanReview: boolean;
}

interface CliOptions {
  target?: CliTarget;
  minQuality?: 80 | 90;
}

interface CandidateArticle {
  id: string | number;
  title: string;
  content: string | null;
  enrichedContent: string | null;
  url: string | null;
  summary: string | null;
  detailedSummary: string | null;
  qualityScore: number;
  publishedAt: Date | string | null;
  tags: { name: string }[];
}

interface CandidateWithJudgment {
  article: CandidateArticle;
  judgment: CategoryJudgment;
}

type CategoryBuckets = Record<Category, CandidateWithJudgment[]>;
type TargetDistribution = Record<Category, number>;

class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

const TECHNICAL_KEYWORDS: Record<string, string[]> = {
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

const TARGET_DISTRIBUTIONS: Record<TargetSize, TargetDistribution> = {
  48: { general: 24, technical: 14, thin_content: 8, multilingual: 2 },
  50: { general: 20, technical: 13, thin_content: 12, multilingual: 5 },
  75: { general: 37, technical: 22, thin_content: 13, multilingual: 3 },
  100: { general: 50, technical: 30, thin_content: 15, multilingual: 5 },
};

function parseCliOptions(argv: string[]): { options: CliOptions; showHelp: boolean } {
  const options: CliOptions = {};
  let showHelp = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--help':
      case '-h':
        showHelp = true;
        break;
      case '--target':
      case '-t': {
        const value = argv[++i];
        if (!value) {
          throw new CliError('Missing value for --target.');
        }
        const parsed = Number(value);
        const allowedTargets: CliTarget[] = [50, 75, 100];
        if (!allowedTargets.includes(parsed as CliTarget)) {
          throw new CliError('Invalid target size. Allowed values: 50, 75, 100.');
        }
        options.target = parsed as CliTarget;
        break;
      }
      case '--min-quality':
      case '--minQuality':
      case '-q': {
        const value = argv[++i];
        if (!value) {
          throw new CliError('Missing value for --min-quality.');
        }
        const parsed = Number(value);
        if (![80, 90].includes(parsed)) {
          throw new CliError('Invalid minimum quality. Allowed values: 80, 90.');
        }
        options.minQuality = parsed as 80 | 90;
        break;
      }
      default:
        if (arg.startsWith('-')) {
          throw new CliError(`Unknown option: ${arg}`);
        }
        throw new CliError(`Unexpected argument: ${arg}`);
    }
  }

  return { options, showHelp };
}

function printHelp(): void {
  console.log('Usage: tsx scripts/ci/select-golden-set.ts [options]');
  console.log('');
  console.log('Options:');
  console.log('  -t, --target <50|75|100>   Override target golden set size (default: 48)');
  console.log('  -q, --min-quality <80|90>  Minimum qualityScore threshold (default: 90)');
  console.log('  -h, --help                 Show this help message');
}

function toPublishedAtTime(value: CandidateArticle['publishedAt']): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function selectFromCategory(candidates: CandidateWithJudgment[], target: number): CandidateWithJudgment[] {
  return [...candidates]
    .sort((a, b) => {
      if (b.article.qualityScore !== a.article.qualityScore) {
        return b.article.qualityScore - a.article.qualityScore;
      }
      if (b.judgment.confidence !== a.judgment.confidence) {
        return b.judgment.confidence - a.judgment.confidence;
      }
      return toPublishedAtTime(a.article.publishedAt) - toPublishedAtTime(b.article.publishedAt);
    })
    .slice(0, target);
}

function detectCategory(article: CandidateArticle): CategoryJudgment {
  const contentLength = article.enrichedContent?.length || article.content?.length || 0;
  const title = article.title;
  const content = article.enrichedContent || article.content || '';
  const tags = article.tags?.map((t: { name: string }) => t.name.toLowerCase()) || [];

  const isEnglishTitle = /^[a-zA-Z0-9\s\-:,.()[\]]+$/.test(title);
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

function detectDifficulty(article: CandidateArticle): 'easy' | 'medium' | 'hard' {
  const contentLength = article.enrichedContent?.length || article.content?.length || 0;
  const tagCount = article.tags?.length || 0;

  if (contentLength < 500 || tagCount <= 3) return 'easy';
  if (contentLength < 2000 || tagCount <= 6) return 'medium';
  return 'hard';
}

async function selectGoldenSet(options: CliOptions): Promise<void> {
  console.log('='.repeat(60));
  console.log('Golden Set Selection');
  console.log('='.repeat(60));
  console.log('');

  const targetSize: TargetSize = options.target ?? 48;
  const targetDistribution = TARGET_DISTRIBUTIONS[targetSize];

  if (!targetDistribution) {
    throw new Error(`Unsupported target size: ${targetSize}. Allowed values: ${Object.keys(TARGET_DISTRIBUTIONS).join(', ')}.`);
  }

  const minQuality = options.minQuality ?? 90;

  console.log(`Target size: ${targetSize} (min quality >= ${minQuality})`);
  console.log('');

  const candidates = await prisma.article.findMany({
    where: {
      qualityScore: { gte: minQuality },
      summary: { not: null },
      detailedSummary: { not: null },
    },
    select: {
      id: true,
      title: true,
      content: true,
      enrichedContent: true,
      url: true,
      summary: true,
      detailedSummary: true,
      qualityScore: true,
      publishedAt: true,
      tags: { select: { name: true } },
    },
  });

  console.log(`Found ${candidates.length} high-quality articles (qualityScore >= ${minQuality})\n`);

  const categorized: CategoryBuckets = {
    general: [],
    technical: [],
    thin_content: [],
    multilingual: [],
  };

  const needsReview: CandidateWithJudgment[] = [];

  for (const article of candidates) {
    const judgment = detectCategory(article);
    const candidate: CandidateWithJudgment = { article, judgment };

    if (judgment.needsHumanReview) {
      needsReview.push(candidate);
    }

    categorized[judgment.category].push(candidate);
  }

  console.log('Category distribution:');
  (Object.keys(categorized) as Category[]).forEach(category => {
    console.log(`  ${category}: ${categorized[category].length}`);
  });
  console.log(`\nNeeds human review: ${needsReview.length}\n`);

  const selected: GoldenExample[] = [];
  const qualityScoreMap = new Map<string, number>();
  candidates.forEach(article => {
    qualityScoreMap.set(String(article.id), article.qualityScore);
  });

  (Object.entries(targetDistribution) as [Category, number][]).forEach(([category, target]) => {
    const available = categorized[category];
    const selectedCandidates = selectFromCategory(available, target);
    const selectedExamples = selectedCandidates.map(({ article, judgment }): GoldenExample => {
      const content = article.enrichedContent ?? article.content ?? '';

      return {
        id: `golden-${article.id}`,
        article: {
          title: article.title,
          content,
          url: article.url,
        },
        expectedOutput: {
          summary: article.summary!,
          detailedSummary: article.detailedSummary!,
          tags: article.tags.map(tag => tag.name),
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
      };
    });

    selected.push(...selectedExamples);

    console.log(`Selected ${selectedExamples.length}/${target} ${category} examples`);

    if (selectedExamples.length < target) {
      console.warn(`  WARNING: Only ${selectedExamples.length} available (target: ${target})`);
    }
  });

  const qualityScores = selected.map(example => qualityScoreMap.get(String(example.sourceArticleId)) ?? 0);
  const qualityMin = qualityScores.length ? Math.min(...qualityScores) : 0;
  const qualityMax = qualityScores.length ? Math.max(...qualityScores) : 0;
  const qualityAvg = qualityScores.length
    ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length
    : 0;

  const metadata: GoldenSetMetadata = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    totalExamples: selected.length,
    categoryDistribution: {
      general: selected.filter(example => example.metadata.category === 'general').length,
      technical: selected.filter(example => example.metadata.category === 'technical').length,
      thin_content: selected.filter(example => example.metadata.category === 'thin_content').length,
      multilingual: selected.filter(example => example.metadata.category === 'multilingual').length,
    },
    qualityScoreRange: {
      min: qualityMin,
      max: qualityMax,
      avg: qualityAvg,
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
  console.log('Output: lib/ai/testing/golden-set.json\n');

  console.log('Metadata summary:');
  console.log(`  Version: ${metadata.version}`);
  console.log(`  Total examples: ${metadata.totalExamples}`);
  console.log(`  Quality score range: ${metadata.qualityScoreRange.min}-${metadata.qualityScoreRange.max} (avg: ${metadata.qualityScoreRange.avg.toFixed(1)})`);
  console.log('');
  console.log('Category distribution:');
  Object.entries(metadata.categoryDistribution).forEach(([category, count]) => {
    const percentage = metadata.totalExamples > 0
      ? ((count / metadata.totalExamples) * 100).toFixed(1)
      : '0.0';
    console.log(`  ${category}: ${count} (${percentage}%)`);
  });

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
    console.log('Output: lib/ai/testing/golden-set-review-needed.json');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Next step: Run threshold calibration');
  console.log('  npx tsx scripts/ci/calibrate-thresholds.ts');
  console.log('='.repeat(60));
}

async function run(): Promise<void> {
  try {
    const { options, showHelp } = parseCliOptions(process.argv.slice(2));

    if (showHelp) {
      printHelp();
      return;
    }

    await selectGoldenSet(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error:', message);

    if (error instanceof CliError) {
      console.log('');
      printHelp();
    }

    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
