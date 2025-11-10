#!/usr/bin/env npx tsx
/**
 * Publickey記事のcontent=null問題を修正
 * content=nullまたは空の記事を対象に、ContentEnricherFactoryで再取得
 *
 * Usage:
 *   npx tsx scripts/maintenance/re-enrich-publickey-nulls.ts [options]
 *
 * Options:
 *   --dry-run          DB更新せずにログのみ出力
 *   --delay-ms <ms>    記事間の待機時間（デフォルト: 2000ms）
 *   --batch-sleep-ms <ms>  バッチ間の待機時間（デフォルト: 10000ms）
 *   --limit <n>        処理する記事数の上限
 */

import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '../../lib/enrichers';
import * as fs from 'fs';

const prisma = new PrismaClient();

// 進捗ファイル
const PROGRESS_FILE = '.re-enrich-publickey-progress.json';

// Content thresholds (lib/fetchers/publickey.ts と同じ値)
const RSS_SUFFICIENT_LENGTH = 200;

// デフォルト設定
const DEFAULT_DELAY_MS = 2000;
const DEFAULT_BATCH_SLEEP_MS = 10000;
const BATCH_SIZE = 10;

interface Progress {
  processedIds: string[];
  lastProcessedAt: string;
  stats: {
    total: number;
    processed: number;
    enriched: number;
    failed: number;
    skipped: number;
  };
  failedArticles: Array<{
    id: string;
    title: string;
    url: string;
    error: string;
  }>;
}

interface Options {
  dryRun: boolean;
  delayMs: number;
  batchSleepMs: number;
  limit?: number;
}

// 進捗を読み込み
function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    const data = fs.readFileSync(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return {
    processedIds: [],
    lastProcessedAt: new Date().toISOString(),
    stats: {
      total: 0,
      processed: 0,
      enriched: 0,
      failed: 0,
      skipped: 0,
    },
    failedArticles: [],
  };
}

// 進捗を保存
function saveProgress(progress: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// CLI引数をパース
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: args.includes('--dry-run'),
    delayMs: DEFAULT_DELAY_MS,
    batchSleepMs: DEFAULT_BATCH_SLEEP_MS,
  };

  const delayIndex = args.indexOf('--delay-ms');
  if (delayIndex !== -1 && args[delayIndex + 1]) {
    options.delayMs = parseInt(args[delayIndex + 1], 10);
  }

  const batchSleepIndex = args.indexOf('--batch-sleep-ms');
  if (batchSleepIndex !== -1 && args[batchSleepIndex + 1]) {
    options.batchSleepMs = parseInt(args[batchSleepIndex + 1], 10);
  }

  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    options.limit = parseInt(args[limitIndex + 1], 10);
  }

  return options;
}

// Enrichmentをリトライ付きで実行
async function enrichWithRetry(
  factory: ContentEnricherFactory,
  url: string,
  maxRetries: number = 3
): Promise<{ content?: string; thumbnail?: string } | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const enriched = await factory.trySequential(url);
      return enriched;
    } catch (error) {
      const isNetworkError = error instanceof Error &&
        (error.message.includes('ECONNREFUSED') ||
         error.message.includes('ETIMEDOUT') ||
         error.message.includes('ENOTFOUND'));

      if (isNetworkError && attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.error(`  Retry ${attempt}/${maxRetries} after ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      } else {
        throw error;
      }
    }
  }
  return null;
}

async function main() {
  const options = parseArgs();

  console.error('========================================');
  console.error('Publickey content=null記事 Re-enrichment');
  console.error('========================================\n');

  if (options.dryRun) {
    console.error('[DRY-RUN MODE] DB更新は行いません\n');
  }

  console.error(`設定:`);
  console.error(`  記事間待機: ${options.delayMs}ms`);
  console.error(`  バッチ間待機: ${options.batchSleepMs}ms`);
  console.error(`  処理上限: ${options.limit || '無制限'}`);
  console.error('');

  const factory = new ContentEnricherFactory();
  const progress = loadProgress();
  const processedIdsSet = new Set(progress.processedIds);

  // Publickey sourceを取得
  const publickeySource = await prisma.source.findFirst({
    where: { name: 'Publickey' },
  });

  if (!publickeySource) {
    console.error('Error: Publickey sourceが見つかりません');
    process.exit(1);
  }

  // content=null/''記事を取得（既処理済みを除外）
  const articles = await prisma.article.findMany({
    where: {
      sourceId: publickeySource.id,
      OR: [
        { content: null },
        { content: '' },
      ],
      id: { notIn: Array.from(processedIdsSet) },
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      url: true,
      content: true,
      thumbnail: true,
    },
    take: options.limit,
  });

  if (articles.length === 0) {
    console.error('処理対象の記事がありません');
    saveProgress(progress);
    return;
  }

  // stats.total を初回のみ設定、2回目以降は再計算
  if (progress.stats.processed === 0) {
    progress.stats.total = articles.length;
  } else {
    progress.stats.total = progress.stats.processed + articles.length;
  }

  console.error(`対象記事数: ${articles.length}件\n`);

  let batchCount = 0;

  for (const article of articles) {
    console.error(
      `\n[${progress.stats.processed + 1}/${progress.stats.total}] ${article.title.substring(0, 50)}...`
    );
    console.error(`  URL: ${article.url}`);

    try {
      // Enrichmentをリトライ付きで実行
      const enriched = await enrichWithRetry(factory, article.url);

      if (enriched?.content && enriched.content.length >= RSS_SUFFICIENT_LENGTH) {
        // UPDATE成功
        if (!options.dryRun) {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              content: enriched.content,
              thumbnail: enriched.thumbnail || article.thumbnail,
              updatedAt: new Date(),
            },
          });
        }
        progress.stats.enriched++;
        console.error(`  SUCCESS: ${enriched.content.length} chars`);
      } else {
        // Enrichment失敗（コンテンツ不足）
        progress.stats.failed++;
        progress.failedArticles.push({
          id: article.id,
          title: article.title,
          url: article.url,
          error: `Content length insufficient: ${enriched?.content?.length || 0} chars`,
        });
        console.error(`  FAILED: Content insufficient (${enriched?.content?.length || 0} chars)`);
      }
    } catch (error) {
      // Enrichmentエラー
      progress.stats.failed++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      progress.failedArticles.push({
        id: article.id,
        title: article.title,
        url: article.url,
        error: errorMessage,
      });
      console.error(`  ERROR: ${errorMessage}`);
    }

    // 進捗を更新
    processedIdsSet.add(article.id);
    progress.processedIds = Array.from(processedIdsSet);
    progress.stats.processed++;
    progress.lastProcessedAt = new Date().toISOString();

    // バッチごとに進捗を保存
    if (++batchCount % BATCH_SIZE === 0) {
      saveProgress(progress);
      console.error('\n--- Progress saved ---');

      // バッチ間の長めの休憩
      if (batchCount < articles.length) {
        console.error(`Sleeping for ${options.batchSleepMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, options.batchSleepMs));
      }
    }

    // Rate limiting（記事間）
    if (batchCount % BATCH_SIZE !== 0 && progress.stats.processed < articles.length) {
      await new Promise(resolve => setTimeout(resolve, options.delayMs));
    }
  }

  // 最終進捗を保存
  saveProgress(progress);

  // 最終レポート
  console.error('\n========================================');
  console.error('Re-enrichment Complete');
  console.error('========================================');
  console.error(`Total:     ${progress.stats.total}`);
  console.error(`Processed: ${progress.stats.processed}`);
  console.error(`Enriched:  ${progress.stats.enriched}`);
  console.error(`Failed:    ${progress.stats.failed}`);
  console.error(`Skipped:   ${progress.stats.skipped}`);

  if (progress.failedArticles.length > 0) {
    console.error('\n--- Failed Articles ---');
    console.error(`Count: ${progress.failedArticles.length}`);
    console.error('Details saved in:', PROGRESS_FILE);
    console.error('\nFailed URLs:');
    progress.failedArticles.forEach((article, index) => {
      console.error(`${index + 1}. ${article.title}`);
      console.error(`   URL: ${article.url}`);
      console.error(`   Error: ${article.error}`);
    });
  }

  if (options.dryRun) {
    console.error('\n[DRY-RUN] No database changes were made');
  }
}

// SIGINT handling
process.on('SIGINT', () => {
  console.error('\n\nReceived SIGINT, saving progress...');
  process.exit(0);
});

main()
  .then(() => {
    console.error('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
