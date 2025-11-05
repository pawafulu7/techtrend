import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

import { loadGoldenSet } from '@/lib/ai/testing/golden-set-loader';
import type { GoldenSetMetadata } from '@/lib/ai/testing/types';
import { percentiles } from '@/lib/ai/testing/stats';
import {
  CalibrationCache,
  buildPrompt,
  hashPrompt,
  CACHE_PATH,
  type CalibrationMetrics,
} from '@/lib/ai/testing/calibration-cache';
import { buildAppDependencies } from '@/lib/di/bootstrap';
import { EmbeddingService } from '@/lib/rag/embedding-service';
import { cosineSimilarity } from '@/lib/utils/vector-math';
import type { SummaryServiceResult } from '@/lib/ai/service/unified-summary-service.interface';

type CalibrationMode = 'apply' | 'dry-run';

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;
const SIDECAR_PATH = join(process.cwd(), 'lib/ai/testing/golden-set-calibrated.json');
const GOLDEN_SET_PATH = join(process.cwd(), 'lib/ai/testing/golden-set.json');
const PERCENTILES = [50, 90, 95] as const;

interface RetryOptions {
  timeoutMs: number;
  baseDelayMs: number;
  jitterMs: number;
  maxAttempts: number;
}

interface CalibrationMetrics {
  summary: string;
  detailedSummary: string;
  semanticSimilarity: number;
  qualityScore: number;
  processingTimeMs: number;
  completedAt: string;
}

interface CacheEntry {
  promptHash: string;
  modelVersion: string;
  metrics: CalibrationMetrics;
  updatedAt: string;
}

interface CalibrationExampleResult extends CalibrationMetrics {
  exampleId: string;
  category: string;
  promptHash: string;
  modelVersion: string;
  attempts: number;
  cached: boolean;
}

interface CalibrationSummary {
  generatedAt: string;
  modelVersion: string;
  sampleCount: number;
  concurrency: number;
  percentiles: Record<string, number>;
  byCategory: Record<string, Record<string, number>>;
  examples: Array<Omit<CalibrationExampleResult, 'summary' | 'detailedSummary'>>;
}

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Calibration task timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

class PromisePool<T> {
  private readonly tasks: Array<() => Promise<T>>;
  private readonly concurrency: number;

  constructor(tasks: Array<() => Promise<T>>, concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error(`Invalid concurrency value: ${concurrency}`);
    }
    this.tasks = tasks;
    this.concurrency = concurrency;
  }

  async run(): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];
    let rejection: Error | null = null;

    for (const task of this.tasks) {
      if (rejection) {
        break;
      }

      const taskRunner = async (): Promise<void> => {
        try {
          const result = await task();
          results.push(result);
        } catch (error) {
          if (!rejection) {
            rejection = error as Error;
          }
          throw error;
        }
      };

      let trackedPromise: Promise<void>;
      trackedPromise = taskRunner().finally(() => {
        const index = executing.indexOf(trackedPromise);
        if (index >= 0) {
          executing.splice(index, 1);
        }
      });

      executing.push(trackedPromise);

      if (executing.length >= this.concurrency) {
        try {
          await Promise.race(executing);
        } catch {
          // Failure handled via rejection flag; allow loop to exit.
        }
      }
    }

    try {
      await Promise.allSettled(executing);
    } catch {
      // Individual errors handled below.
    }

    if (rejection) {
      throw rejection;
    }

    return results;
  }
}


async function withTimeout<T>(task: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);

    task()
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => clearTimeout(timer));
  });
}

async function retryWithBackoff<T>(
  task: () => Promise<T>,
  options: RetryOptions
): Promise<{ result: T; attempts: number }> {
  const { timeoutMs, baseDelayMs, jitterMs, maxAttempts } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      const result = await withTimeout(task, timeoutMs);
      return { result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt >= maxAttempts) {
        throw lastError instanceof Error
          ? lastError
          : new Error(`Calibration failed after ${attempt} attempts: ${String(lastError)}`);
      }

      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterOffset = Math.random() * jitterMs;
      await sleep(backoff + jitterOffset);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Calibration failed: ${String(lastError)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseConcurrency(): number {
  const raw = process.env.CALIBRATION_CONCURRENCY;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_CONCURRENCY;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}

function parseTimeout(): number {
  const raw = process.env.CALIBRATION_TIMEOUT;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_TIMEOUT_MS;
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_TIMEOUT_MS;
}

function parseMode(): CalibrationMode {
  const raw = (process.env.CALIBRATION_MODE || 'dry-run').toLowerCase();
  return raw === 'apply' ? 'apply' : 'dry-run';
}

function sanitize(text: string | undefined | null): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

async function calculateSemanticSimilarity(
  embeddingService: EmbeddingService,
  expected: string,
  actual: string
): Promise<number> {
  const expectedText = expected.trim();
  const actualText = actual.trim();

  if (!expectedText || !actualText) {
    return 0;
  }

  const [expectedEmbedding, actualEmbedding] = await Promise.all([
    embeddingService.embedText(expectedText),
    embeddingService.embedText(actualText),
  ]);

  const similarity = cosineSimilarity(expectedEmbedding, actualEmbedding);

  if (!Number.isFinite(similarity)) {
    return 0;
  }

  return Math.max(0, Math.min(1, similarity));
}

async function calibrateExample(
  example: GoldenExample,
  modelVersion: string,
  serviceRunner: (params: { title: string; content: string }) => Promise<SummaryServiceResult>,
  embeddingService: EmbeddingService,
  cache: CalibrationCache,
  retryOptions: RetryOptions
): Promise<CalibrationExampleResult> {
  const prompt = buildPrompt(example);
  const promptHash = hashPrompt(prompt);

  const cached = cache.get(promptHash, modelVersion);
  if (cached) {
    return {
      exampleId: example.id,
      category: example.metadata.category,
      promptHash,
      modelVersion,
      attempts: 0,
      cached: true,
      ...cached.metrics,
    };
  }

  const { result, attempts } = await retryWithBackoff(async () => {
    const start = Date.now();
    const output = await serviceRunner({
      title: example.article.title,
      content: example.article.content,
    });

    const expectedText = [
      sanitize(example.expectedOutput.summary),
      sanitize(example.expectedOutput.detailedSummary),
    ]
      .filter(Boolean)
      .join(' ');

    const actualText = [sanitize(output.summary), sanitize(output.detailedSummary)]
      .filter(Boolean)
      .join(' ');

    const semanticSimilarity = await calculateSemanticSimilarity(embeddingService, expectedText, actualText);

    if (Number.isNaN(output.qualityScore)) {
      throw new Error('Quality score returned NaN');
    }

    const metrics: CalibrationMetrics = {
      summary: output.summary,
      detailedSummary: output.detailedSummary,
      qualityScore: output.qualityScore,
      semanticSimilarity,
      processingTimeMs: output.processingTimeMs ?? Date.now() - start,
      completedAt: new Date().toISOString(),
    };

    return metrics;
  }, retryOptions);

  cache.set({
    promptHash,
    modelVersion,
    metrics: result,
    updatedAt: new Date().toISOString(),
  });

  return {
    exampleId: example.id,
    category: example.metadata.category,
    promptHash,
    modelVersion,
    attempts,
    cached: false,
    ...result,
  };
}

function buildSummary(
  results: CalibrationExampleResult[],
  modelVersion: string,
  concurrency: number
): CalibrationSummary {
  const similarities = results.map((r) => r.semanticSimilarity);
  const percentilesToCompute = Array.from(PERCENTILES);
  const percentilesGlobal = percentiles(similarities, percentilesToCompute);

  const byCategoryValues: Record<string, number[]> = {};
  for (const result of results) {
    byCategoryValues[result.category] ||= [];
    byCategoryValues[result.category].push(result.semanticSimilarity);
  }

  const byCategory: Record<string, Record<string, number>> = {};
  for (const [category, values] of Object.entries(byCategoryValues)) {
    byCategory[category] = percentiles(values, percentilesToCompute);
  }

  return {
    generatedAt: new Date().toISOString(),
    modelVersion,
    sampleCount: results.length,
    concurrency,
    percentiles: percentilesGlobal,
    byCategory,
    examples: results.map(({ summary: _summary, detailedSummary: _details, ...rest }) => rest),
  };
}

function buildUpdatedGoldenSet(
  originalMetadata: GoldenSetMetadata,
  originalExamples: GoldenExample[],
  summary: CalibrationSummary
): { metadata: GoldenSetMetadata; examples: GoldenExample[] } {
  const SAFETY_MARGINS = {
    general: 0.90,
    technical: 0.90,
    thin_content: 0.85,
    multilingual: 0.90,
  };
  const fallbackP90 = summary.percentiles.p90 ?? 0;
  const categoryThresholds = {
    general: (summary.byCategory.general?.p90 ?? fallbackP90) * SAFETY_MARGINS.general,
    technical: (summary.byCategory.technical?.p90 ?? fallbackP90) * SAFETY_MARGINS.technical,
    thin_content: (summary.byCategory.thin_content?.p90 ?? fallbackP90) * SAFETY_MARGINS.thin_content,
    multilingual: (summary.byCategory.multilingual?.p90 ?? fallbackP90) * SAFETY_MARGINS.multilingual,
  };
  const defaultSemanticThreshold = fallbackP90 * SAFETY_MARGINS.general;

  const updatedMetadata: GoldenSetMetadata = {
    ...originalMetadata,
    thresholdCalibration: {
      percentile95: summary.percentiles.p95 ?? 0,
      byCategory: categoryThresholds,
    },
  };

  const updatedExamples = originalExamples.map((example) => {
    const category = example.metadata.category as keyof typeof categoryThresholds;
    const semanticThreshold = categoryThresholds[category] ?? defaultSemanticThreshold;
    return {
      ...example,
      acceptanceThreshold: {
        ...example.acceptanceThreshold,
        semanticSimilarity: semanticThreshold,
      },
    };
  });

  return {
    metadata: updatedMetadata,
    examples: updatedExamples,
  };
}

async function main(): Promise<void> {
  const concurrency = parseConcurrency();
  const timeoutMs = parseTimeout();
  const mode = parseMode();

  const cache = await CalibrationCache.load(CACHE_PATH);
  const { service, config } = buildAppDependencies({
    translation: { enabled: false },
  });

  const embeddingService = new EmbeddingService();
  const modelVersion = config.gemini.model;
  const { metadata, examples } = await loadGoldenSet();

  console.log('='.repeat(72));
  console.log('Calibrating acceptance thresholds');
  console.log('='.repeat(72));
  console.log(`Mode          : ${mode}`);
  console.log(`Model version : ${modelVersion}`);
  console.log(`Concurrency   : ${concurrency}`);
  console.log(`Timeout (ms)  : ${timeoutMs}`);
  console.log(`Samples       : ${examples.length}`);
  console.log('');

  const retryOptions: RetryOptions = {
    timeoutMs,
    baseDelayMs: 1_000,
    jitterMs: 500,
    maxAttempts: MAX_ATTEMPTS,
  };

  const serviceRunner = async (params: { title: string; content: string }) => {
    return service.generateSummary({
      title: params.title,
      content: params.content,
      qualityThreshold: undefined,
    });
  };

  const tasks = examples.map(
    (example) => () =>
      calibrateExample(example, modelVersion, serviceRunner, embeddingService, cache, retryOptions)
  );

  const pool = new PromisePool(tasks, concurrency);
  const results = await pool.run();

  const summary = buildSummary(results, modelVersion, concurrency);
  const updatedGoldenSet = buildUpdatedGoldenSet(metadata, examples, summary);

  console.log('Calibration results (semantic similarity):');
  console.table(
    Object.entries(summary.percentiles).map(([k, value]) => ({
      percentile: k,
      value: value.toFixed(4),
    }))
  );

  console.log('\nCategory breakdown (semantic similarity):');
  for (const [category, stats] of Object.entries(summary.byCategory)) {
    console.log(`  ${category}`);
    for (const [key, value] of Object.entries(stats)) {
      console.log(`    ${key}: ${value.toFixed(4)}`);
    }
  }

  if (mode === 'dry-run') {
    await writeFile(SIDECAR_PATH, JSON.stringify(updatedGoldenSet, null, 2), 'utf-8');
    console.log('\nDry-run mode: Review golden-set-calibrated.json');
    console.log('To apply: npm run calibrate:promote');
    return;
  }

  await cache.persist();
  await writeFile(GOLDEN_SET_PATH, JSON.stringify(updatedGoldenSet, null, 2), 'utf-8');
  console.log('\nApply mode: golden-set.json updated');

  console.log('\nCalibration data saved to:');
  console.log(`  Cache    : ${CACHE_PATH}`);
  console.log(`  Golden Set: ${GOLDEN_SET_PATH}`);
}

main().catch((error) => {
  console.error('Calibration failed:', error);
  process.exitCode = 1;
});
