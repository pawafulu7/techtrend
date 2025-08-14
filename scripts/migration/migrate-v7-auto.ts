#!/usr/bin/env npx tsx
/**
 * Version 7 自動連続移行スクリプト
 * 50件ずつ処理し、完了まで自動的に続行
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();
const PROGRESS_FILE = '.migration-v7-progress.json';
const BATCH_SIZE = 50;
const RATE_LIMIT_DELAY = 5000; // 5秒
const BATCH_DELAY = 30000; // バッチ間の待機時間（30秒）

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

async function migrateV7Auto() {
  console.log('========================================');
  console.log('Version 7 自動連続移行');
  console.log(`バッチサイズ: ${BATCH_SIZE}件`);
  console.log('全件完了まで自動実行します');
  console.log('========================================\n');

  // 進捗の読み込み
  let progress = await loadProgress();
  
  if (progress) {
    console.log('📂 前回の進捗を読み込みました:');
    console.log(`  処理済み: ${progress.processedCount}件`);
    console.log(`  成功: ${progress.successCount}件`);
    console.log(`  エラー: ${progress.errorCount}件`);
    console.log(`  最終更新: ${progress.updatedAt}\n`);
    console.log('続きから自動実行を開始します...\n');
  } else {
    progress = {
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    console.log('新規実行を開始します...\n');
  }

  const service = new UnifiedSummaryService();
  let totalBatches = 0;
  let continueMigration = true;

  // 全件完了まで自動継続
  while (continueMigration) {
    totalBatches++;
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`バッチ #${totalBatches} 開始`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

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
      continueMigration = false;
      break;
    }

    console.log(`📋 処理対象: ${articles.length}件\n`);
    const batchStartTime = Date.now();

    for (const article of articles) {
      const displayTitle = article.title.length > 50 
        ? article.title.substring(0, 50) + '...'
        : article.title;
      
      process.stdout.write(`[${progress.processedCount + 1}] ${displayTitle}`);

      if (!article.content || article.content.length < 100) {
        console.log(' ⚠️ スキップ（コンテンツ不十分）');
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

        console.log(` ✅ 成功 (v${article.summaryVersion}→v7)`);
        progress.successCount++;
      } catch (error) {
        console.log(` ❌ エラー`);
        progress.errorCount++;
      }

      progress.processedCount++;
      progress.lastProcessedId = article.id;
      progress.updatedAt = new Date().toISOString();

      // 10件ごとに進捗を保存
      if (progress.processedCount % 10 === 0) {
        await saveProgress(progress);
      }

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    // バッチ完了後の進捗保存
    await saveProgress(progress);

    const batchTime = Math.round((Date.now() - batchStartTime) / 1000);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`バッチ #${totalBatches} 完了 (${batchTime}秒)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`処理済み: ${progress.processedCount}件`);
    console.log(`成功: ${progress.successCount}件`);
    console.log(`エラー: ${progress.errorCount}件`);
    console.log(`成功率: ${(progress.successCount / progress.processedCount * 100).toFixed(1)}%`);

    // 残り件数の確認
    const remaining = await prisma.article.count({
      where: {
        summaryVersion: { lte: 6 },
        content: { not: null }
      }
    });

    if (remaining > 0) {
      console.log(`\n📊 残り: ${remaining}件`);
      console.log(`次のバッチを ${BATCH_DELAY / 1000} 秒後に開始します...`);
      
      // プログレスバー表示
      for (let i = 0; i < 30; i++) {
        process.stdout.write('.');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log('\n');
    }
  }

  // 最終統計
  const v7Count = await prisma.article.count({
    where: { summaryVersion: 7 }
  });
  
  console.log('\n========================================');
  console.log('🎉 移行完了！');
  console.log('========================================');
  console.log(`Version 7の記事数: ${v7Count}件`);
  console.log(`処理総数: ${progress.processedCount}件`);
  console.log(`成功: ${progress.successCount}件`);
  console.log(`エラー: ${progress.errorCount}件`);
  console.log(`成功率: ${(progress.successCount / progress.processedCount * 100).toFixed(1)}%`);
  console.log(`開始時刻: ${progress.startedAt}`);
  console.log(`完了時刻: ${new Date().toISOString()}`);
  
  // 進捗ファイルの削除
  await fs.unlink(PROGRESS_FILE).catch(() => {});
  await prisma.$disconnect();
}

// エラーハンドリング
process.on('SIGINT', async () => {
  console.log('\n\n⚠️ 処理を中断しています...');
  console.log('進捗は保存されました。次回実行時に続きから再開できます。');
  console.log('再開コマンド: npm run migrate:v7:auto');
  await prisma.$disconnect();
  process.exit(0);
});

// 実行
migrateV7Auto().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});