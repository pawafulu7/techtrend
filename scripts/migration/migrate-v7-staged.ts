#!/usr/bin/env npx tsx
/**
 * Version 7 段階的移行スクリプト
 * 50件ずつ、20分タイムアウトで実行
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();
const PROGRESS_FILE = '.migration-v7-progress.json';
const BATCH_SIZE = 50;
const TIMEOUT_MS = 20 * 60 * 1000; // 20分
const RATE_LIMIT_DELAY = 5000; // 5秒

interface Progress {
  lastProcessedId?: string;
  processedCount: number;
  successCount: number;
  errorCount: number;
  startedAt: string;
  updatedAt: string;
}

async function loadProgress(): Promise<Progress | null> {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveProgress(progress: Progress) {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function migrateV7Staged() {
  console.log('========================================');
  console.log('Version 7 段階的移行');
  console.log(`バッチサイズ: ${BATCH_SIZE}件`);
  console.log(`タイムアウト: ${TIMEOUT_MS / 1000 / 60}分`);
  console.log('========================================\n');

  // 進捗の読み込み
  let progress = await loadProgress();
  
  if (progress) {
    console.log('📂 前回の進捗を読み込みました:');
    console.log(`  処理済み: ${progress.processedCount}件`);
    console.log(`  成功: ${progress.successCount}件`);
    console.log(`  エラー: ${progress.errorCount}件`);
    console.log(`  最終更新: ${progress.updatedAt}\n`);
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>(resolve => {
      readline.question('前回の続きから実行しますか？ (y/n): ', resolve);
    });
    readline.close();
    
    if (answer.toLowerCase() !== 'y') {
      progress = null;
      await fs.unlink(PROGRESS_FILE).catch(() => {});
      console.log('新規実行を開始します\n');
    }
  }
  
  if (!progress) {
    progress = {
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  const service = new UnifiedSummaryService();
  const startTime = Date.now();

  // 移行対象の取得
  const whereClause: any = {
    summaryVersion: { lte: 6 },
    content: { not: null }
  };
  
  if (progress.lastProcessedId) {
    whereClause.id = { gt: progress.lastProcessedId };
  }

  const articles = await prisma.article.findMany({
    where: whereClause,
    take: BATCH_SIZE,
    orderBy: { id: 'asc' },
    include: { source: true }
  });

  if (articles.length === 0) {
    console.log('✨ すべての記事の移行が完了しました！');
    
    // 最終統計
    const v7Count = await prisma.article.count({
      where: { summaryVersion: 7 }
    });
    
    console.log('\n========================================');
    console.log('最終統計');
    console.log('========================================');
    console.log(`Version 7の記事数: ${v7Count}件`);
    console.log(`処理総数: ${progress.processedCount}件`);
    console.log(`成功: ${progress.successCount}件`);
    console.log(`エラー: ${progress.errorCount}件`);
    console.log(`成功率: ${(progress.successCount / progress.processedCount * 100).toFixed(1)}%`);
    
    // 進捗ファイルの削除
    await fs.unlink(PROGRESS_FILE).catch(() => {});
    await prisma.$disconnect();
    return;
  }

  console.log(`\n📋 今回の処理: ${articles.length}件\n`);

  for (const article of articles) {
    // タイムアウトチェック
    if (Date.now() - startTime > TIMEOUT_MS) {
      console.log('\n⏰ タイムアウトに達しました。進捗を保存して終了します。');
      break;
    }

    const displayTitle = article.title.length > 50 
      ? article.title.substring(0, 50) + '...'
      : article.title;
    
    console.log(`[${progress.processedCount + 1}] ${displayTitle}`);
    console.log(`  ソース: ${article.source.name}`);
    console.log(`  コンテンツ: ${article.content?.length || 0}文字`);

    if (!article.content || article.content.length < 100) {
      console.log('  ⚠️ コンテンツ不十分 - スキップ\n');
      progress.processedCount++;
      progress.lastProcessedId = article.id;
      continue;
    }

    try {
      const result = await service.generate(
        article.title,
        article.content,
        { maxRetries: 2 },
        { sourceName: article.source.name, url: article.url }
      );

      // タグの処理
      const existingTags = await prisma.tag.findMany({
        where: { name: { in: result.tags } }
      });
      
      const existingTagNames = existingTags.map(t => t.name);
      const newTagNames = result.tags.filter(t => !existingTagNames.includes(t));
      
      // 新しいタグを作成
      for (const tagName of newTagNames) {
        await prisma.tag.create({
          data: { name: tagName }
        });
      }

      // 記事を更新
      await prisma.article.update({
        where: { id: article.id },
        data: {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          summaryVersion: result.summaryVersion,
          articleType: result.articleType,
          qualityScore: result.qualityScore || 0,
          tags: {
            set: result.tags.map(name => ({ name }))
          }
        }
      });

      console.log(`  ✅ 成功 (v${article.summaryVersion}→v${result.summaryVersion})`);
      console.log(`  要約: ${result.summary.length}文字`);
      console.log(`  詳細: ${result.detailedSummary === '__SKIP_DETAILED_SUMMARY__' ? 'スキップ' : result.detailedSummary.length + '文字'}\n`);
      
      progress.successCount++;
    } catch (error) {
      console.error(`  ❌ エラー: ${error instanceof Error ? error.message : error}\n`);
      progress.errorCount++;
    }

    progress.processedCount++;
    progress.lastProcessedId = article.id;
    progress.updatedAt = new Date().toISOString();

    // 10件ごとに進捗を保存
    if (progress.processedCount % 10 === 0) {
      await saveProgress(progress);
      console.log(`💾 進捗保存 (${progress.processedCount}件処理済み)\n`);
    }

    // Rate limit対策
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
  }

  // 最終進捗の保存
  await saveProgress(progress);

  console.log('\n========================================');
  console.log('今回のバッチ処理完了');
  console.log('========================================');
  console.log(`処理件数: ${articles.length}件`);
  console.log(`累計処理: ${progress.processedCount}件`);
  console.log(`累計成功: ${progress.successCount}件`);
  console.log(`累計エラー: ${progress.errorCount}件`);
  console.log(`成功率: ${progress.successCount > 0 ? (progress.successCount / progress.processedCount * 100).toFixed(1) : 0}%`);

  // 残り件数の確認
  const remaining = await prisma.article.count({
    where: {
      summaryVersion: { lte: 6 },
      content: { not: null }
    }
  });

  if (remaining > 0) {
    console.log(`\n📊 残り: ${remaining}件`);
    console.log('次回実行時は自動的に続きから処理されます。');
    console.log('再実行コマンド: npm run migrate:v7:staged');
  }

  await prisma.$disconnect();
}

// エラーハンドリング
process.on('SIGINT', async () => {
  console.log('\n\n⚠️ 処理を中断しています...');
  console.log('進捗は保存されました。次回実行時に続きから再開できます。');
  await prisma.$disconnect();
  process.exit(0);
});

// 実行
migrateV7Staged().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});