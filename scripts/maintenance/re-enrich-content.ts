#!/usr/bin/env npx tsx
/**
 * 既存記事のコンテンツを再取得（エンリッチ）
 * 特にコンテンツが短い記事を対象に、エンリッチャーを使って本文を再取得
 */

import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '../../lib/enrichers';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// 進捗ファイル
const PROGRESS_FILE = '.re-enrich-progress.json';

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
  };
}

// 進捗を保存
function saveProgress(progress: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function reEnrichContent() {
  console.error('========================================');
  console.error('既存記事のコンテンツ再取得');
  console.error('========================================\n');

  const factory = new ContentEnricherFactory();
  const progress = loadProgress();

  // コンテンツが短い記事を優先的に取得
  // 特にZenn、Google AI Blog、Hugging Face、InfoQ、Publickey、Stack Overflowを対象
  const targetSources = [
    'Zenn',
    'Google AI Blog',
    'Google Developers Blog',
    'Hugging Face Blog',
    'InfoQ Japan',
    'Publickey',
    'Stack Overflow Blog',
  ];

  // 対象ソースのIDを取得
  const sources = await prisma.source.findMany({
    where: {
      name: { in: targetSources },
    },
  });

  const sourceIds = sources.map(s => s.id);
  const sourceMap = new Map(sources.map(s => [s.id, s.name]));

  // コンテンツが短い記事を取得（500文字以下）
  const articles = await prisma.article.findMany({
    where: {
      sourceId: { in: sourceIds },
      OR: [
        { content: null },
        { content: '' },
        { content: { lte: String(500) } }, // Prismaの文字列長フィルタは直接使えないので工夫が必要
      ],
      id: { notIn: progress.processedIds }, // 既に処理済みの記事はスキップ
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      url: true,
      content: true,
      sourceId: true,
    },
  });

  // 実際に500文字以下の記事をフィルタ
  const shortArticles = articles.filter(a => {
    const contentLength = a.content?.length || 0;
    return contentLength <= 500;
  });

  console.error(`対象記事数: ${shortArticles.length}件\n`);
  progress.stats.total = shortArticles.length + progress.stats.processed;

  let batchCount = 0;
  const BATCH_SIZE = 10;

  for (const article of shortArticles) {
    const sourceName = sourceMap.get(article.sourceId) || 'Unknown';
    console.error(`\n[${progress.stats.processed + 1}/${progress.stats.total}] ${article.title.substring(0, 50)}...`);
    console.error(`  ソース: ${sourceName}`);
    console.error(`  URL: ${article.url}`);
    console.error(`  現在のコンテンツ: ${article.content?.length || 0}文字`);

    try {
      // エンリッチャーを取得
      const enricher = factory.getEnricher(article.url);
      
      if (!enricher) {
        console.error('  ⚠️ エンリッチャーが見つかりません - スキップ');
        progress.stats.skipped++;
        progress.processedIds.push(article.id);
        progress.stats.processed++;
        continue;
      }

      // エンリッチ実行
      console.error('  エンリッチ中...');
      const enriched = await enricher.enrich(article.url);
      
      if (enriched && enriched.content && enriched.content.length > (article.content?.length || 0)) {
        // コンテンツを更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            content: enriched.content,
            thumbnail: enriched.thumbnail || undefined,
          },
        });
        
        console.error(`  ✅ 成功: ${enriched.content.length}文字に更新`);
        progress.stats.enriched++;
      } else {
        console.error('  ⚠️ 新しいコンテンツが取得できませんでした');
        progress.stats.skipped++;
      }
      
    } catch (error) {
      console.error(`  ❌ エラー: ${error}`);
      progress.stats.failed++;
    }

    // 進捗を更新
    progress.processedIds.push(article.id);
    progress.stats.processed++;
    progress.lastProcessedAt = new Date().toISOString();
    
    // 10件ごとに進捗を保存
    if (++batchCount % BATCH_SIZE === 0) {
      saveProgress(progress);
      console.error('\n--- 進捗を保存しました ---');
      
      // Rate limit対策で少し長めに待機
      console.error('Rate limit対策で10秒待機...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      // 通常の待機
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 最終的な進捗を保存
  saveProgress(progress);

  // 結果サマリー
  console.error('\n========================================');
  console.error('処理完了');
  console.error('========================================\n');
  console.error(`総処理数: ${progress.stats.processed}件`);
  console.error(`エンリッチ成功: ${progress.stats.enriched}件`);
  console.error(`スキップ: ${progress.stats.skipped}件`);
  console.error(`エラー: ${progress.stats.failed}件`);

  // 進捗ファイルを削除するか確認
  if (progress.stats.processed === progress.stats.total) {
    console.error('\n✅ すべての記事の処理が完了しました');
    console.error('進捗ファイルを削除します...');
    fs.unlinkSync(PROGRESS_FILE);
  } else {
    console.error('\n⚠️ 未処理の記事が残っています');
    console.error('再度実行すると続きから処理を再開します');
  }

  await prisma.$disconnect();
}

// エラーハンドリング
process.on('SIGINT', () => {
  console.error('\n\n中断されました。進捗は保存されています。');
  console.error('再実行時は続きから処理を再開します。');
  process.exit(0);
});

// 実行
reEnrichContent().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});