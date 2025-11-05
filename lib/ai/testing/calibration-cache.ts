import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import { dirname, join } from 'path';
import type { GoldenExample } from './types';

export const CACHE_PATH = join(process.cwd(), 'lib/ai/testing/calibration-cache.json');

export interface CalibrationMetrics {
  summary: string;
  detailedSummary: string;
  semanticSimilarity: number;
  qualityScore: number;
  processingTimeMs: number;
  completedAt: string;
}

export interface CacheEntry {
  promptHash: string;
  modelVersion: string;
  metrics: CalibrationMetrics;
  updatedAt: string;
}

export function buildPrompt(example: GoldenExample): string {
  const blocks = [
    `Title: ${example.article.title}`,
    `URL: ${example.article.url}`,
    '---',
    example.article.content,
  ];

  return blocks.join('\n');
}

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}

export class CalibrationCache {
  private readonly path: string;
  private readonly entries: Map<string, CacheEntry>;
  private dirty = false;

  static async load(path: string = CACHE_PATH): Promise<CalibrationCache> {
    if (!existsSync(path)) {
      return new CalibrationCache(path, new Map());
    }

    const raw = await readFile(path, 'utf-8');
    const parsed: CacheEntry[] = JSON.parse(raw);
    const map = new Map<string, CacheEntry>();

    for (const entry of parsed) {
      map.set(CalibrationCache.key(entry.promptHash, entry.modelVersion), entry);
    }

    return new CalibrationCache(path, map);
  }

  private static key(promptHash: string, modelVersion: string): string {
    return `${promptHash}:${modelVersion}`;
  }

  private constructor(path: string, entries: Map<string, CacheEntry>) {
    this.path = path;
    this.entries = entries;
  }

  get(promptHash: string, modelVersion: string): CacheEntry | undefined {
    return this.entries.get(CalibrationCache.key(promptHash, modelVersion));
  }

  set(entry: CacheEntry): void {
    this.entries.set(CalibrationCache.key(entry.promptHash, entry.modelVersion), entry);
    this.dirty = true;
  }

  async persist(): Promise<void> {
    if (!this.dirty) {
      return;
    }

    const serialized = JSON.stringify(Array.from(this.entries.values()), null, 2);
    const directory = dirname(this.path);

    if (!existsSync(directory)) {
      await mkdir(directory, { recursive: true });
    }

    await writeFile(this.path, serialized, 'utf-8');
    this.dirty = false;
  }
}
