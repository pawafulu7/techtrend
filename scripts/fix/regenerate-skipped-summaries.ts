#!/usr/bin/env npx tsx
/**
 * 詳細要約がスキップされた記事の再生成スクリプト
 * __SKIP_DETAILED_SUMMARY__となっている記事を再処理
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

interface RegenerateOptions {
  dryRun?: boolean;
  limit?: number;
  continueFrom?: string;
  batchSize?: number;
}

async function getSkippedArticles(continueFrom?: string, limit?: number) {
  const where: any = {
    detailedSummary: '__SKIP_DETAILED_SUMMARY__'
  };
  
  if (continueFrom) {
    where.id = { gt: continueFrom };
  }
  
  return await prisma.article.findMany({
    where,
    include: {
      source: true,
      tags: true
    },
    orderBy: { id: 'asc' },
    take: limit || undefined
  });
}

async function regenerateSummary(article: any, summaryService: UnifiedSummaryService, dryRun: boolean) {
  try {
    console.error(`\n処理中: ${article.id}`);
    console.error(`  タイトル: ${article.title}`);
    console.error(`  コンテンツ長: ${article.content?.length || 0}文字`);
    console.error(`  ソース: ${article.source.name}`);
    
    if (!article.content || article.content.length === 0) {
      console.error('  ⚠️ コンテンツが空のためスキップ');
      return { skipped: true };
    }
    
    if (dryRun) {
      console.error('  🔍 ドライラン - 実際の更新はスキップ');
      return { dryRun: true };
    }
    
    // 要約を再生成
    const result = await summaryService.generate(
      article.title,
      article.content,
      {
        maxRetries: 2,
        retryDelay: 5000,
        minQualityScore: 60
      },
      {
        sourceName: article.source.name,
        url: article.url
      }
    );
    
    // データベースを更新
    await prisma.article.update({
      where: { id: article.id },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        summaryVersion: result.summaryVersion,
        qualityScore: result.qualityScore,
        updatedAt: new Date()
      }
    });
    
    console.error('  ✅ 更新完了');
    console.error(`  一覧要約: ${result.summary.substring(0, 50)}...`);
    console.error(`  詳細要約: ${result.detailedSummary.substring(0, 100)}...`);
    console.error(`  品質スコア: ${result.qualityScore}`);
    
    return { success: true };
  } catch (error) {
    console.error(`  ❌ エラー: ${error instanceof Error ? error.message : error}`);
    return { error: true };
  }
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const options: RegenerateOptions = {
    dryRun: args.includes('--dry-run'),
    limit: args.find(a => a.startsWith('--limit='))?.split('=')[1] ? 
           parseInt(args.find(a => a.startsWith('--limit='))!.split('=')[1]) : undefined,
    continueFrom: args.find(a => a.startsWith('--continue='))?.split('=')[1],
    batchSize: 10
  };
  
  console.error('===================================');
  console.error('詳細要約スキップ記事の再生成');
  console.error('===================================\n');
  
  if (options.dryRun) {
    console.error('🔍 ドライランモード - 実際の更新は行いません\n');
  }
  
  // 対象記事を取得
  const articles = await getSkippedArticles(options.continueFrom, options.limit);
  console.error(`対象記事数: ${articles.length}件\n`);
  
  if (articles.length === 0) {
    console.error('処理対象の記事がありません');
    await prisma.$disconnect();
    return;
  }
  
  // ソース別の統計
  const sourceCounts = articles.reduce((acc, article) => {
    acc[article.source.name] = (acc[article.source.name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.error('ソース別内訳:');
  Object.entries(sourceCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([source, count]) => {
      console.error(`  ${source}: ${count}件`);
    });
  console.error('');
  
  // 確認
  if (!options.dryRun && !args.includes('--yes')) {
    console.error('処理を開始しますか？ (y/n)');
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>(resolve => {
      readline.question('> ', (answer: string) => {
        readline.close();
        resolve(answer);
      });
    });
    
    if (answer.toLowerCase() !== 'y') {
      console.error('処理を中止しました');
      await prisma.$disconnect();
      return;
    }
  }
  
  // 要約サービスの初期化
  const summaryService = new UnifiedSummaryService();
  
  // 処理実行
  const stats = {
    total: articles.length,
    success: 0,
    skipped: 0,
    error: 0,
    dryRun: 0
  };
  
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    
    // 進捗表示
    console.error(`\n[${i + 1}/${articles.length}] 進捗: ${Math.round((i + 1) / articles.length * 100)}%`);
    
    const result = await regenerateSummary(article, summaryService, options.dryRun);
    
    if (result.success) stats.success++;
    else if (result.skipped) stats.skipped++;
    else if (result.error) stats.error++;
    else if (result.dryRun) stats.dryRun++;
    
    // バッチごとに長めの待機
    if ((i + 1) % options.batchSize! === 0 && i < articles.length - 1) {
      console.error(`\n⏸ バッチ完了 - 30秒待機中...`);
      await delay(30000);
    } else if (i < articles.length - 1) {
      // 通常の待機
      await delay(5000);
    }
    
    // 最後に処理したIDを表示（再開用）
    if ((i + 1) % 20 === 0 || i === articles.length - 1) {
      console.error(`\n📌 最後に処理したID: ${article.id}`);
      console.error(`   再開する場合: npm run fix:skipped-summaries -- --continue=${article.id}`);
    }
  }
  
  // 結果サマリー
  console.error('\n===================================');
  console.error('処理結果サマリー');
  console.error('===================================');
  console.error(`総数: ${stats.total}件`);
  if (options.dryRun) {
    console.error(`ドライラン: ${stats.dryRun}件`);
  } else {
    console.error(`成功: ${stats.success}件`);
    console.error(`スキップ: ${stats.skipped}件`);
    console.error(`エラー: ${stats.error}件`);
  }
  
  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  prisma.$disconnect();
  process.exit(1);
});