#!/usr/bin/env npx tsx
/**
 * 項目数が不足している長文記事の要約を再生成するバッチスクリプト
 *
 * 実行例:
 *   npx tsx scripts/fix/regenerate-low-item-summaries.ts --limit 20
 *   npx tsx scripts/fix/regenerate-low-item-summaries.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';
import {
  preparePrismaUpdateData,
  validateGenerationResult,
  normalizeLineBreaks
} from '../utils/version8-validation';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();
const summaryService = new UnifiedSummaryService();

const PROGRESS_FILE = path.join(process.cwd(), '.regenerate-low-item-summaries-progress.json');
const SCRIPT_ID = 'regenerate-low-item-summaries';

const RATE_LIMIT_DELAY_MS = 5000; // 成功時
const ERROR_DELAY_MS = 60000; // 失敗時
const COOLDOWN_AFTER_COUNT = 100;
const COOLDOWN_DELAY_MS = 30000;
const MAX_ATTEMPTS_PER_ARTICLE = 3;

interface CliOptions {
  dryRun: boolean;
  limit?: number;
}

interface TargetArticle {
  id: string;
  title: string;
  url: string;
  content: string | null;
  detailedSummary: string | null;
  summary: string | null;
  sourceName: string | null;
  contentLength: number;
  itemCount: number;
  summaryVersion: number | null;
}

interface ProgressEntry {
  attempts: number;
  status: 'success' | 'failed';
  lastAttemptAt: string;
  error?: string;
}

interface ProgressData {
  version: number;
  script: string;
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  processed: Record<string, ProgressEntry>;
  lastUpdated: string;
}

interface RuntimeStats {
  totalCandidates: number;
  attempted: number;
  success: number;
  failed: number;
  skipped: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress(): ProgressData {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) as ProgressData;
      if (parsed.script === SCRIPT_ID && parsed.version === 1 && parsed.processed) {
        return parsed;
      }
      console.error('⚠️ 既存の進捗ファイルが不正な形式のためリセットします');
    } catch (error) {
      console.error('⚠️ 進捗ファイルの読み込みに失敗したためリセットします:', error);
    }
  }

  return {
    version: 1,
    script: SCRIPT_ID,
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
    processed: {},
    lastUpdated: new Date().toISOString()
  };
}

function saveProgress(progress: ProgressData): void {
  try {
    progress.lastUpdated = new Date().toISOString();
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    console.error(`💾 進捗を保存しました: ${PROGRESS_FILE}`);
  } catch (error) {
    console.error('⚠️ 進捗ファイルの保存に失敗しました:', error);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return Number(value);
}

function countDetailedItems(detailedSummary: string | null | undefined): number {
  if (!detailedSummary) return 0;
  const normalized = normalizeLineBreaks(detailedSummary);
  return normalized
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('・'))
    .length;
}

function determineRequiredItemCount(contentLength: number): number {
  if (contentLength >= 10000) {
    return 6;
  }
  return 5;
}

async function fetchTargetArticles(): Promise<TargetArticle[]> {
  const rows = await prisma.$queryRaw<TargetArticle[]>`
    SELECT
      a.id,
      a.title,
      a.url,
      a.content,
      a."detailedSummary",
      a.summary,
      s.name AS "sourceName",
      LENGTH(a.content) AS "contentLength",
      LENGTH(a."detailedSummary") - LENGTH(REPLACE(a."detailedSummary", '・', '')) AS "itemCount",
      a."summaryVersion"
    FROM "Article" a
    LEFT JOIN "Source" s ON a."sourceId" = s.id
    WHERE a.content IS NOT NULL
      AND LENGTH(a.content) >= 5000
      AND a."detailedSummary" IS NOT NULL
      AND a."detailedSummary" != ''
      AND a."detailedSummary" LIKE '%・%'
      AND LENGTH(a."detailedSummary") - LENGTH(REPLACE(a."detailedSummary", '・', '')) <= 4
    ORDER BY LENGTH(a.content) DESC
  `;

  return rows.map(row => ({
    ...row,
    contentLength: toNumber(row.contentLength),
    itemCount: toNumber(row.itemCount)
  }));
}

function selectArticles(
  articles: TargetArticle[],
  progress: ProgressData,
  limit?: number
): TargetArticle[] {
  const pending = articles.filter(article => {
    const entry = progress.processed[article.id];
    if (!entry) return true;
    if (entry.status === 'success') return false;
    if (entry.status === 'failed' && entry.attempts >= MAX_ATTEMPTS_PER_ARTICLE) {
      return false;
    }
    return true;
  });

  if (typeof limit === 'number' && limit > 0) {
    return pending.slice(0, limit);
  }

  return pending;
}

async function processArticle(
  article: TargetArticle,
  progress: ProgressData,
  stats: RuntimeStats,
  options: CliOptions
): Promise<void> {
  const existingEntry = progress.processed[article.id];
  const attempts = existingEntry?.attempts ?? 0;

  const prefix = `[${stats.attempted + stats.skipped + 1}/${stats.totalCandidates}]`;
  console.log(`\n${prefix} 処理対象: ${article.title.substring(0, 80)}...`);
  console.log(`   ID: ${article.id}`);
  console.log(`   本文文字数: ${article.contentLength.toLocaleString()} / 項目数: ${article.itemCount}`);

  if (options.dryRun) {
    stats.skipped += 1;
    return;
  }

  stats.attempted += 1;

  try {
    const content = article.content;
    if (!content || content.trim().length === 0) {
      throw new Error('記事本文が存在しないため再生成できません');
    }

    console.log('🤖 要約を再生成しています...');
    const result = await summaryService.generate(
      article.title,
      content,
      undefined,
      { sourceName: article.sourceName ?? undefined, url: article.url }
    );

    const validation = validateGenerationResult(result);
    if (!validation.isValid) {
      throw new Error(`生成結果の検証に失敗: ${validation.errors.join('; ')}`);
    }

    const newItemCount = countDetailedItems(result.detailedSummary);
    const requiredItemCount = determineRequiredItemCount(article.contentLength);
    if (newItemCount < requiredItemCount) {
      throw new Error(`項目数が不足: ${newItemCount}項目 (必要: ${requiredItemCount}項目以上)`);
    }

    const updateData = preparePrismaUpdateData({
      summary: result.summary,
      detailedSummary: result.detailedSummary,
      summaryVersion: result.summaryVersion,
      articleType: result.articleType,
      qualityScore: result.qualityScore
    });

    await prisma.article.update({
      where: { id: article.id },
      data: updateData
    });

    await cacheInvalidator.onArticleUpdated(article.id);

    progress.processed[article.id] = {
      attempts: attempts + 1,
      status: 'success',
      lastAttemptAt: new Date().toISOString()
    };
    progress.totalProcessed += 1;
    progress.totalSuccess += 1;
    saveProgress(progress);

    stats.success += 1;
    console.log(`✅ 再生成完了 (項目数: ${newItemCount})`);

    await delay(RATE_LIMIT_DELAY_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ 再生成に失敗: ${message}`);

    // 一時的なエラー（Rate Limit、ネットワーク等）かどうかを判定
    const isTransientError = /(?:429|rate|quota|timeout|ECONNRESET|ENETUNREACH|503)/i.test(message);

    progress.processed[article.id] = {
      attempts: attempts + 1,
      status: 'failed',
      lastAttemptAt: new Date().toISOString(),
      error: message
    };
    progress.totalProcessed += 1;
    progress.totalFailed += 1;
    saveProgress(progress);

    stats.failed += 1;

    // 一時的エラーの場合は長い待機、それ以外は短い待機
    const waitMs = isTransientError ? ERROR_DELAY_MS : 2000;
    console.log(`⏱️ エラーのため${waitMs / 1000}秒待機します...`);
    await delay(waitMs);
  }
}

async function main() {
  const program = new Command();
  program
    .option('--dry-run', '対象記事を一覧表示し、再生成は実行しない', false)
    .option('--limit <number>', '処理する記事数の上限', (value) => parseInt(value, 10));

  program.parse(process.argv);
  const options = program.opts<CliOptions>();

  const progress = loadProgress();
  console.log(`進捗ファイル: ${PROGRESS_FILE}`);
  console.log(`これまでの処理: 成功 ${progress.totalSuccess}件 / 失敗 ${progress.totalFailed}件`);

  const allArticles = await fetchTargetArticles();
  const targetArticles = selectArticles(allArticles, progress, options.limit);

  const stats: RuntimeStats = {
    totalCandidates: targetArticles.length,
    attempted: 0,
    success: 0,
    failed: 0,
    skipped: 0
  };

  if (targetArticles.length === 0) {
    console.log('🎉 再生成が必要な記事はありません');
    return;
  }

  console.log(`対象記事数: ${targetArticles.length}件`);
  if (options.dryRun) {
    console.log('\n--- ドライラン結果 ---');
    targetArticles.forEach((article, index) => {
      console.log(`\n[${index + 1}] ${article.title.substring(0, 100)}...`);
      console.log(`    ID: ${article.id}`);
      console.log(`    文字数: ${article.contentLength.toLocaleString()} / 項目数: ${article.itemCount}`);
      console.log(`    URL: ${article.url}`);
    });
    console.log('\nドライランが完了しました。進捗ファイルは更新されていません。');
    return;
  }

  console.log('\n処理を開始します...');
  let processedSinceCooldown = 0;

  for (const article of targetArticles) {
    const entry = progress.processed[article.id];
    if (entry && entry.status === 'success') {
      stats.skipped += 1;
      continue;
    }
    if (entry && entry.status === 'failed' && entry.attempts >= MAX_ATTEMPTS_PER_ARTICLE) {
      console.log(`⚠️ 最大試行回数(${MAX_ATTEMPTS_PER_ARTICLE})に達したためスキップ: ${article.id}`);
      stats.skipped += 1;
      continue;
    }

    await processArticle(article, progress, stats, options);
    processedSinceCooldown += 1;

    if (processedSinceCooldown > 0 && processedSinceCooldown % COOLDOWN_AFTER_COUNT === 0) {
      console.log(`\n⏸️ ${COOLDOWN_AFTER_COUNT}件処理したため${COOLDOWN_DELAY_MS / 1000}秒の休憩を挟みます...`);
      await delay(COOLDOWN_DELAY_MS);
    }
  }

  console.log('\n--- 処理結果 ---');
  console.log(`成功: ${stats.success}件`);
  console.log(`失敗: ${stats.failed}件`);
  console.log(`スキップ: ${stats.skipped}件`);
  console.log(`総対象: ${stats.totalCandidates}件`);
  console.log(`進捗ファイルに結果を保存しました: ${PROGRESS_FILE}`);
}

main()
  .catch(error => {
    console.error('致命的なエラーが発生しました:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
