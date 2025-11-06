#!/usr/bin/env npx tsx
/**
 * Golden Set coverage analyzer.
 *
 * Generates:
 *  - lib/ai/testing/coverage-report.json
 *  - lib/ai/testing/candidate-pool-report.json
 */

import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { loadGoldenSet } from '@/lib/ai/testing/golden-set-loader';
import type { GoldenExample } from '@/lib/ai/testing/types';
import { percentile } from '@/lib/ai/testing/stats';

type Category = 'general' | 'technical' | 'thin_content' | 'multilingual';
type ContentLengthBucket = 'short' | 'medium' | 'long';
type LanguageKey = 'english' | 'japanese' | 'other';

interface CandidateArticle {
  id: string;
  title: string;
  content: string | null;
  enrichedContent: string | null;
  url: string | null;
  qualityScore: number;
  tags: { name: string }[];
}

interface CandidateSummary {
  id: string;
  title: string;
  url: string | null;
  qualityScore: number;
  category: Category;
  language: LanguageKey;
  contentLength: number;
  lengthBucket: ContentLengthBucket;
}

interface CoverageReport {
  existing: {
    total: number;
    byCategory: Record<string, number>;
    byLanguage: Record<string, number>;
    byContentLength: {
      short: number;
      medium: number;
      long: number;
    };
    categoryLanguageMatrix: Record<string, Record<string, number>>;
  };
  candidatePool: {
    total: number;
    byCategory: Record<string, number>;
    byLanguage: Record<string, number>;
    qualityScoreDistribution: {
      min: number;
      max: number;
      avg: number;
      p50: number;
      p90: number;
    };
  };
  gaps: {
    categories: string[];
    languages: string[];
    recommendations: string[];
  };
}

interface CandidatePoolReport {
  total: number;
  filters: {
    qualityScore: { min: number; max: number };
    requiresSummaries: boolean;
  };
  byCategory: Record<string, number>;
  byLanguage: Record<string, number>;
  byContentLength: Record<ContentLengthBucket, number>;
  qualityScoreDistribution: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
  };
  topCandidatesByCategory: Record<Category, CandidateSummary[]>;
}

const OUTPUT_DIR = join(process.cwd(), 'lib/ai/testing');
const COVERAGE_REPORT_PATH = join(OUTPUT_DIR, 'coverage-report.json');
const CANDIDATE_REPORT_PATH = join(OUTPUT_DIR, 'candidate-pool-report.json');

const CATEGORY_KEYS: Category[] = ['general', 'technical', 'thin_content', 'multilingual'];
const CONTENT_BUCKETS: ContentLengthBucket[] = ['short', 'medium', 'long'];

const TARGET_DISTRIBUTION_FOR_50: Record<Category, number> = {
  general: 20,
  technical: 13,
  thin_content: 12,
  multilingual: 5,
};

const TECHNICAL_KEYWORDS: Record<string, string[]> = {
  infrastructure: [
    'kubernetes', 'k8s', 'docker', 'terraform', 'aws', 'gcp', 'azure',
    'cloud', 'serverless', 'lambda', 'vercel', 'netlify',
  ],
  dataAI: [
    'machine learning', 'ml', 'deep learning', 'llm', 'nlp',
    'data pipeline', 'bigquery', 'pytorch', 'tensorflow',
    'ai', 'gemini', 'gpt', 'openai', 'hugging face',
  ],
  securitySRE: [
    'observability', 'prometheus', 'grafana', 'zerotrust',
    'iac', 'security', 'cve', 'ランサムウェア',
    'サイバー攻撃', 'vpn', 'edr',
  ],
  programming: [
    'typescript', 'rust', 'go', 'golang', 'python', 'java',
    'react', 'next.js', 'vue', 'nuxt', 'angular',
    'rails', 'django', 'spring', 'node.js',
  ],
  database: [
    'postgres', 'postgresql', 'mysql', 'mongodb', 'redis',
    'prisma', 'データベース', 'database', 'sql', 'nosql',
  ],
};

const ALL_TECHNICAL_KEYWORDS = Object.values(TECHNICAL_KEYWORDS).flat();

const prisma = new PrismaClient();

function createCountMap<T extends string>(keys: readonly T[]): Record<T, number> {
  return keys.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<T, number>);
}

function detectLanguage(title: string): LanguageKey {
  const trimmed = title.trim();
  if (!trimmed) return 'other';

  const englishTitleRegex = /^[\w\s\d'":;.,!?()[\]/+-]+$/u;
  const containsLatin = /[A-Za-z]/.test(trimmed);
  const containsJapanese = /[ぁ-んァ-ン一-龥]/.test(trimmed);

  if (containsLatin && englishTitleRegex.test(trimmed) && !containsJapanese) {
    return 'english';
  }
  if (containsJapanese) {
    return 'japanese';
  }
  return 'other';
}

function bucketContentLength(length: number): ContentLengthBucket {
  if (length < 500) return 'short';
  if (length <= 2000) return 'medium';
  return 'long';
}

function detectCandidateCategory(article: CandidateArticle): Category {
  const language = detectLanguage(article.title);
  if (language === 'english') {
    return 'multilingual';
  }

  const content = article.enrichedContent ?? article.content ?? '';
  const contentLength = content.length;

  const tags = article.tags?.map(tag => tag.name.toLowerCase()) ?? [];
  const technicalTagCount = tags.filter(tag =>
    ALL_TECHNICAL_KEYWORDS.some(keyword => tag.includes(keyword.toLowerCase()))
  ).length;

  const lowerContent = content.toLowerCase();
  const keywordMatches = ALL_TECHNICAL_KEYWORDS.filter(keyword =>
    lowerContent.includes(keyword.toLowerCase())
  ).length;

  if (technicalTagCount >= 1 && keywordMatches >= 3) {
    return 'technical';
  }

  if (contentLength < 500) {
    return 'thin_content';
  }

  return 'general';
}

function summarizeExisting(examples: GoldenExample[]) {
  const byCategory = createCountMap(CATEGORY_KEYS);
  const byLanguage: Record<string, number> = {};
  const byContentLength: Record<ContentLengthBucket, number> = createCountMap(CONTENT_BUCKETS);
  const categoryLanguageMatrix: Record<string, Record<string, number>> = {};

  for (const category of CATEGORY_KEYS) {
    categoryLanguageMatrix[category] = {};
  }

  for (const example of examples) {
    const category = example.metadata.category;
    const language = detectLanguage(example.article.title);
    const contentLength = example.article.content.length;
    const lengthBucket = bucketContentLength(contentLength);

    byCategory[category] += 1;
    byLanguage[language] = (byLanguage[language] ?? 0) + 1;
    byContentLength[lengthBucket] += 1;

    const matrixRow = categoryLanguageMatrix[category];
    matrixRow[language] = (matrixRow[language] ?? 0) + 1;
  }

  return {
    total: examples.length,
    byCategory,
    byLanguage,
    byContentLength,
    categoryLanguageMatrix,
  };
}

async function fetchCandidateArticles(): Promise<CandidateArticle[]> {
  const articles = await prisma.article.findMany({
    where: {
      qualityScore: { gte: 80, lt: 90 },
      summary: { not: null },
      detailedSummary: { not: null },
    },
    select: {
      id: true,
      title: true,
      content: true,
      enrichedContent: true,
      url: true,
      qualityScore: true,
      tags: { select: { name: true } },
    },
  });

  return articles.map(article => ({
    ...article,
    id: String(article.id),
  }));
}

function analyzeCandidatePool(articles: CandidateArticle[]) {
  const byCategory = createCountMap(CATEGORY_KEYS);
  const byLanguage: Record<string, number> = {};
  const byContentLength: Record<ContentLengthBucket, number> = createCountMap(CONTENT_BUCKETS);
  const summaries: CandidateSummary[] = [];
  const candidatesByCategory: Record<Category, CandidateSummary[]> = {
    general: [],
    technical: [],
    thin_content: [],
    multilingual: [],
  };

  const qualityScores: number[] = [];

  for (const article of articles) {
    const language = detectLanguage(article.title);
    const category = detectCandidateCategory(article);
    const content = article.enrichedContent ?? article.content ?? '';
    const contentLength = content.length;
    const lengthBucket = bucketContentLength(contentLength);

    byCategory[category] += 1;
    byLanguage[language] = (byLanguage[language] ?? 0) + 1;
    byContentLength[lengthBucket] += 1;

    qualityScores.push(article.qualityScore);

    const summary: CandidateSummary = {
      id: article.id,
      title: article.title,
      url: article.url,
      qualityScore: article.qualityScore,
      category,
      language,
      contentLength,
      lengthBucket,
    };

    summaries.push(summary);
    candidatesByCategory[category].push(summary);
  }

  qualityScores.sort((a, b) => a - b);
  const total = articles.length;
  const min = total ? qualityScores[0] : 0;
  const max = total ? qualityScores[qualityScores.length - 1] : 0;
  const avg = total
    ? Number((qualityScores.reduce((sum, score) => sum + score, 0) / total).toFixed(2))
    : 0;
  const p50 = total ? Number(percentile(qualityScores, 50).toFixed(2)) : 0;
  const p90 = total ? Number(percentile(qualityScores, 90).toFixed(2)) : 0;

  const topCandidatesByCategory: Record<Category, CandidateSummary[]> = {
    general: [],
    technical: [],
    thin_content: [],
    multilingual: [],
  };

  for (const category of CATEGORY_KEYS) {
    topCandidatesByCategory[category] = candidatesByCategory[category]
      .slice()
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, 5);
  }

  return {
    report: {
      total,
      byCategory,
      byLanguage,
      qualityScoreDistribution: { min, max, avg, p50, p90 },
    },
    details: {
      byContentLength,
      summaries,
      candidatesByCategory,
      topCandidatesByCategory,
    },
  };
}

function analyzeGaps(
  existing: CoverageReport['existing'],
  candidateDetails: {
    summaries: CandidateSummary[];
    candidatesByCategory: Record<Category, CandidateSummary[]>;
    topCandidatesByCategory: Record<Category, CandidateSummary[]>;
  }
) {
  const categoryGaps: string[] = [];
  const languageGaps: string[] = [];
  const recommendations: string[] = [];

  for (const category of CATEGORY_KEYS) {
    const current = existing.byCategory[category] ?? 0;
    const target = TARGET_DISTRIBUTION_FOR_50[category];
    const deficit = Math.max(0, target - current);

    if (deficit > 0) {
      categoryGaps.push(`${category} (+${deficit})`);

      const available = candidateDetails.candidatesByCategory[category]?.length ?? 0;
      const topCandidates = candidateDetails.topCandidatesByCategory[category]
        .slice(0, Math.min(deficit, 3))
        .map(candidate => `${candidate.id} (${candidate.qualityScore.toFixed(1)})`);

      const recommendation = topCandidates.length
        ? `Increase ${category} coverage by +${deficit}. ${available} candidates available. Top picks: ${topCandidates.join(', ')}`
        : `Increase ${category} coverage by +${deficit}, but no suitable candidates identified in the QS 80-89 pool.`;

      recommendations.push(recommendation);
    }
  }

  const englishCount = existing.byLanguage.english ?? 0;
  const englishTarget = TARGET_DISTRIBUTION_FOR_50.multilingual;
  if (englishCount < englishTarget) {
    languageGaps.push(`english (+${englishTarget - englishCount})`);

    const multilingualCandidates = candidateDetails.candidatesByCategory.multilingual
      .slice()
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, 3)
      .map(candidate => `${candidate.id} (${candidate.qualityScore.toFixed(1)})`);

    if (multilingualCandidates.length) {
      recommendations.push(
        `Boost multilingual coverage by selecting ${englishTarget - englishCount} English-title articles. Top multilingual candidates: ${multilingualCandidates.join(', ')}`
      );
    } else {
      recommendations.push(
        `Multilingual coverage is short by ${englishTarget - englishCount}, but QS 80-89 pool has no strong multilingual candidates.`
      );
    }
  }

  return { categories: categoryGaps, languages: languageGaps, recommendations };
}

async function writeJson(path: string, data: unknown) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function main() {
  console.log('========================================');
  console.log('Golden Set Coverage Analysis');
  console.log('========================================\n');

  const goldenSet = await loadGoldenSet();
  const existing = summarizeExisting(goldenSet.examples);

  console.log(`Existing examples: ${existing.total}`);
  console.log(`Category distribution: ${JSON.stringify(existing.byCategory)}`);
  console.log(`Language distribution: ${JSON.stringify(existing.byLanguage)}\n`);

  const candidateArticles = await fetchCandidateArticles();
  console.log(`Candidate pool (QS 80-89, with summaries): ${candidateArticles.length}`);

  const candidateAnalysis = analyzeCandidatePool(candidateArticles);

  const gaps = analyzeGaps(existing, candidateAnalysis.details);

  const coverageReport: CoverageReport = {
    existing,
    candidatePool: candidateAnalysis.report,
    gaps,
  };

  const candidatePoolReport: CandidatePoolReport = {
    total: candidateAnalysis.report.total,
    filters: {
      qualityScore: { min: 80, max: 89 },
      requiresSummaries: true,
    },
    byCategory: candidateAnalysis.report.byCategory,
    byLanguage: candidateAnalysis.report.byLanguage,
    byContentLength: candidateAnalysis.details.byContentLength,
    qualityScoreDistribution: candidateAnalysis.report.qualityScoreDistribution,
    topCandidatesByCategory: candidateAnalysis.details.topCandidatesByCategory,
  };

  await writeJson(COVERAGE_REPORT_PATH, coverageReport);
  await writeJson(CANDIDATE_REPORT_PATH, candidatePoolReport);

  console.log(`Coverage report saved to: ${COVERAGE_REPORT_PATH}`);
  console.log(`Candidate pool report saved to: ${CANDIDATE_REPORT_PATH}\n`);
  console.log('Analysis complete.');
}

main()
  .catch(error => {
    console.error('Failed to analyze Golden Set coverage:');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {
      // ignore disconnect errors
    });
  });

