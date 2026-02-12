/**
 * Summary Quality Benchmark Script
 *
 * Usage:
 *   npx tsx scripts/manual/benchmark-summary-quality.ts --mode baseline
 *   npx tsx scripts/manual/benchmark-summary-quality.ts --mode compare
 *
 * baseline: Generate summaries with current prompts and save results + article IDs
 * compare:  Generate summaries with updated prompts and compare against baseline
 */

import { PrismaClient } from '@prisma/client';
import { PromptBuilder } from '@/lib/ai/adapter/prompt-builder';
import { GeminiSummaryAdapter } from '@/lib/ai/adapter/gemini-summary-adapter';
import { GeminiTransportImpl } from '@/lib/ai/transport/gemini-transport';
import { SummaryQualityChecker } from '@/lib/ai/service/quality-checker';
import * as fs from 'fs';

const prisma = new PrismaClient();

const CONTENT_LENGTH_BINS = [
  { label: '<400', min: 100, max: 399, count: 2 },
  { label: '400-999', min: 400, max: 999, count: 2 },
  { label: '1000-2999', min: 1000, max: 2999, count: 3 },
  { label: '3000-4999', min: 3000, max: 4999, count: 3 },
  { label: '5000-9999', min: 5000, max: 9999, count: 3 },
  { label: '10000+', min: 10000, max: 999999, count: 2 },
];

const BENCHMARK_ARTICLES_FILE = 'benchmark-articles.json';
const BASELINE_FILE = 'benchmark-baseline.json';
const COMPARE_FILE = 'benchmark-current.json';

interface BenchmarkResult {
  articleId: string;
  title: string;
  contentLength: number;
  bin: string;
  summary: string;
  detailedSummary: string;
  category: string;
  tags: string[];
  qualityScore: number;
  issues: Array<{ type: string; severity: string; message: string }>;
  generatedAt: string;
}

type ArticleRow = {
  id: string;
  title: string;
  content: string;
  content_len: number;
};

async function selectAndFixBenchmarkArticles(): Promise<
  Array<ArticleRow & { bin: string }>
> {
  if (fs.existsSync(BENCHMARK_ARTICLES_FILE)) {
    const savedIds = JSON.parse(
      fs.readFileSync(BENCHMARK_ARTICLES_FILE, 'utf-8')
    ) as Array<{ id: string; bin: string }>;
    const articles: Array<ArticleRow & { bin: string }> = [];
    for (const entry of savedIds) {
      const rows = (await prisma.$queryRaw`
        SELECT id, title, content, LENGTH(content)::int as content_len
        FROM "Article" WHERE id = ${entry.id}
      `) as ArticleRow[];
      if (rows.length > 0) {
        articles.push({ ...rows[0], bin: entry.bin });
      } else {
        console.error(
          `WARNING: Benchmark article ${entry.id} (bin: ${entry.bin}) no longer exists in database`
        );
      }
    }
    console.error(
      `Loaded ${articles.length} fixed benchmark articles from ${BENCHMARK_ARTICLES_FILE}`
    );
    return articles;
  }

  const articles: Array<ArticleRow & { bin: string }> = [];
  for (const bin of CONTENT_LENGTH_BINS) {
    const batch = (await prisma.$queryRaw`
      SELECT id, title, content, LENGTH(content)::int as content_len
      FROM "Article"
      WHERE summary IS NOT NULL
        AND content IS NOT NULL
        AND LENGTH(content) >= ${bin.min}
        AND LENGTH(content) <= ${bin.max}
        AND "qualityScore" >= 70
      ORDER BY "publishedAt" DESC
      LIMIT ${bin.count}
    `) as ArticleRow[];
    articles.push(
      ...batch.map((a) => ({
        ...a,
        bin: bin.label,
      }))
    );
  }

  fs.writeFileSync(
    BENCHMARK_ARTICLES_FILE,
    JSON.stringify(
      articles.map((a) => ({ id: a.id, bin: a.bin })),
      null,
      2
    )
  );
  console.error(
    `Fixed ${articles.length} benchmark article IDs to ${BENCHMARK_ARTICLES_FILE}`
  );

  return articles;
}

async function generateAndScore(
  articles: Array<ArticleRow & { bin: string }>
): Promise<BenchmarkResult[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  const transport = new GeminiTransportImpl(apiKey);
  const promptBuilder = new PromptBuilder();
  const adapter = new GeminiSummaryAdapter(
    transport,
    promptBuilder,
    undefined,
    { temperature: 0 }
  );
  const qualityChecker = new SummaryQualityChecker();
  const results: BenchmarkResult[] = [];

  for (const article of articles) {
    console.error(
      `Processing: ${article.title.substring(0, 60)}... (${article.content_len} chars)`
    );

    try {
      const output = await adapter.summarize({
        title: article.title,
        content: article.content,
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: `benchmark-${Date.now()}`,
      });

      const qualityResult = qualityChecker.checkQuality(
        output.headline,
        output.detailedSummary,
        {
          totalLength: article.content_len,
          contentLength: article.content_len,
          isThinContent: article.content_len < 400,
        }
      );

      results.push({
        articleId: article.id,
        title: article.title,
        contentLength: article.content_len,
        bin: article.bin,
        summary: output.headline,
        detailedSummary: output.detailedSummary,
        category: output.category || '',
        tags: output.tags || [],
        qualityScore: qualityResult.score,
        issues: qualityResult.issues.map((i) => ({
          type: i.type,
          severity: i.severity,
          message: i.message,
        })),
        generatedAt: new Date().toISOString(),
      });

      console.error(`  Score: ${qualityResult.score}`);

      // Rate limit: 500ms between requests
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`  Error: ${(error as Error).message}`);
      results.push({
        articleId: article.id,
        title: article.title,
        contentLength: article.content_len,
        bin: article.bin,
        summary: '',
        detailedSummary: '',
        category: '',
        tags: [],
        qualityScore: 0,
        issues: [{ type: 'error', severity: 'critical' as const, message: (error as Error).message }],
        generatedAt: new Date().toISOString(),
      });
    }
  }
  return results;
}

function compareResults(
  baseline: BenchmarkResult[],
  current: BenchmarkResult[]
): boolean {
  let hasFailed = false;
  console.log('\n=== Benchmark Comparison ===\n');

  const bins = [...new Set(baseline.map((r) => r.bin))];
  for (const bin of bins) {
    const baseArticles = baseline.filter((r) => r.bin === bin);
    const currArticles = current.filter((r) => r.bin === bin);

    const baseAvg =
      baseArticles.length > 0
        ? baseArticles.reduce((s, r) => s + r.qualityScore, 0) /
          baseArticles.length
        : 0;
    const currAvg =
      currArticles.length > 0
        ? currArticles.reduce((s, r) => s + r.qualityScore, 0) /
          currArticles.length
        : 0;
    const diff = currAvg - baseAvg;
    const sign = diff >= 0 ? '+' : '';

    console.log(
      `[${bin}] baseline: ${baseAvg.toFixed(1)} -> current: ${currAvg.toFixed(1)} (${sign}${diff.toFixed(1)})`
    );

    for (const b of baseArticles) {
      const c = currArticles.find((r) => r.articleId === b.articleId);
      if (!c) continue;

      console.log(`  ${b.title.substring(0, 50)}`);
      console.log(`    score: ${b.qualityScore} -> ${c.qualityScore}`);
      console.log(
        `    summary len: ${b.summary.length} -> ${c.summary.length}`
      );
      console.log(
        `    detailed len: ${b.detailedSummary.length} -> ${c.detailedSummary.length}`
      );

      if (c.issues.length > 0) {
        console.log(
          `    issues: ${c.issues.map((i) => `${i.severity}:${i.type}`).join(', ')}`
        );
      }
    }
    console.log();
  }

  const baseTotal =
    baseline.length > 0
      ? baseline.reduce((s, r) => s + r.qualityScore, 0) / baseline.length
      : 0;
  const currTotal =
    current.length > 0
      ? current.reduce((s, r) => s + r.qualityScore, 0) / current.length
      : 0;
  const totalDiff = currTotal - baseTotal;
  const totalSign = totalDiff >= 0 ? '+' : '';
  console.log(
    `=== Overall: ${baseTotal.toFixed(1)} -> ${currTotal.toFixed(1)} (${totalSign}${totalDiff.toFixed(1)}) ===`
  );

  // Quality gate check
  const OVERALL_THRESHOLD = -5;
  const INDIVIDUAL_THRESHOLD = -10;

  if (totalDiff < OVERALL_THRESHOLD) {
    console.log(
      `\n[FAIL] Overall quality dropped by ${totalDiff.toFixed(1)} (threshold: ${OVERALL_THRESHOLD})`
    );
    hasFailed = true;
  }

  for (const b of baseline) {
    const c = current.find((r) => r.articleId === b.articleId);
    if (!c) continue;
    const individualDiff = c.qualityScore - b.qualityScore;
    if (individualDiff < INDIVIDUAL_THRESHOLD) {
      console.log(
        `[FAIL] ${b.title.substring(0, 40)}: dropped by ${individualDiff} (threshold: ${INDIVIDUAL_THRESHOLD})`
      );
      hasFailed = true;
    }
  }

  return hasFailed;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const modeIndex = args.indexOf('--mode');
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : 'baseline';

  if (mode !== 'baseline' && mode !== 'compare') {
    console.error('Usage: --mode baseline|compare');
    process.exit(1);
  }

  const articles = await selectAndFixBenchmarkArticles();
  console.error(`Selected ${articles.length} benchmark articles`);

  if (articles.length === 0) {
    console.error(
      'No benchmark articles found. Check database for articles with qualityScore >= 70.'
    );
    process.exit(1);
  }

  const results = await generateAndScore(articles);

  const outputPath = mode === 'baseline' ? BASELINE_FILE : COMPARE_FILE;
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.error(`Results saved to ${outputPath}`);

  if (mode === 'compare') {
    if (fs.existsSync(BASELINE_FILE)) {
      const baseline = JSON.parse(
        fs.readFileSync(BASELINE_FILE, 'utf-8')
      ) as BenchmarkResult[];
      const hasFailed = compareResults(baseline, results);
      if (hasFailed) {
        process.exit(1);
      }
    } else {
      console.error(
        'Baseline not found. Run with --mode baseline first.'
      );
      process.exit(1);
    }
  } else {
    console.log('\n=== Baseline Results ===\n');
    for (const r of results) {
      console.log(
        `[${r.bin}] ${r.title.substring(0, 50)} - score: ${r.qualityScore}, summary: ${r.summary.length}chars, detailed: ${r.detailedSummary.length}chars`
      );
    }
  }

}

main()
  .catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
