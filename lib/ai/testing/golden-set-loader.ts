import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import type { GoldenExample, GoldenSetMetadata } from './types';

const GoldenExampleSchema = z.object({
  id: z.string(),
  article: z.object({
    title: z.string(),
    content: z.string(),
    url: z.string().url(),
  }),
  expectedOutput: z.object({
    summary: z.string(),
    detailedSummary: z.string(),
    tags: z.array(z.string()),
  }),
  metadata: z.object({
    category: z.enum(['general', 'technical', 'thin_content', 'multilingual']),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    categoryConfidence: z.number().min(0).max(1),
    needsHumanReview: z.boolean(),
    categoryReason: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  acceptanceThreshold: z.object({
    semanticSimilarity: z.number().min(0).max(1),
    minimumQuality: z.number().min(0).max(1),
  }),
  sourceArticleId: z.string(),
});

const GoldenSetMetadataSchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  totalExamples: z.number(),
  categoryDistribution: z.object({
    general: z.number(),
    technical: z.number(),
    thin_content: z.number(),
    multilingual: z.number(),
  }),
  qualityScoreRange: z.object({
    min: z.number(),
    max: z.number(),
    avg: z.number(),
  }),
  thresholdCalibration: z.object({
    percentile95: z.number(),
    byCategory: z.record(z.number()),
  }),
});

const GoldenSetSchema = z.object({
  metadata: GoldenSetMetadataSchema,
  examples: z.array(GoldenExampleSchema),
});

export class GoldenSetError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'GoldenSetError';
  }
}

export class GoldenSetLoadError extends GoldenSetError {
  constructor(path: string, cause?: Error) {
    super(`Failed to load Golden Set from ${path}`, cause);
    this.name = 'GoldenSetLoadError';
  }
}

export class GoldenSetParseError extends GoldenSetError {
  constructor(path: string, cause?: Error) {
    super(`Failed to parse Golden Set JSON from ${path}`, cause);
    this.name = 'GoldenSetParseError';
  }
}

export class GoldenSetValidationError extends GoldenSetError {
  constructor(path: string, issues: z.ZodIssue[]) {
    const issueMessages = issues
      .map(i => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    super(`Golden Set validation failed for ${path}:\n${issueMessages}`);
    this.name = 'GoldenSetValidationError';
  }
}

export interface GoldenSetData {
  metadata: GoldenSetMetadata;
  examples: GoldenExample[];
}

export async function loadGoldenSet(
  filePath?: string
): Promise<GoldenSetData> {
  const path =
    filePath || join(process.cwd(), 'lib/ai/testing/golden-set.json');

  try {
    const rawData = await readFile(path, 'utf-8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch (error) {
      throw new GoldenSetParseError(path, error as Error);
    }

    const result = GoldenSetSchema.safeParse(parsed);
    if (!result.success) {
      throw new GoldenSetValidationError(path, result.error.issues);
    }

    console.log(`Loaded Golden Set: ${result.data.examples.length} examples`);
    console.log(`Version: ${result.data.metadata.version}`);

    return result.data;
  } catch (error) {
    if (error instanceof GoldenSetError) {
      throw error;
    }

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new GoldenSetLoadError(
        path,
        new Error(
          'File not found. Please run: npx tsx scripts/ci/select-golden-set.ts'
        )
      );
    }

    throw new GoldenSetLoadError(path, error as Error);
  }
}

export async function loadGoldenExamples(
  filePath?: string
): Promise<GoldenExample[]> {
  const data = await loadGoldenSet(filePath);
  return data.examples;
}

export async function loadGoldenMetadata(
  filePath?: string
): Promise<GoldenSetMetadata> {
  const data = await loadGoldenSet(filePath);
  return data.metadata;
}
