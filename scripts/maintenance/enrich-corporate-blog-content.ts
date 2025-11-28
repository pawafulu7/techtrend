#!/usr/bin/env tsx

/**
 * 企業技術ブログの既存記事コンテンツをエンリッチするスクリプト
 * 
 * 使用方法:
 *   npm run enrich:corporate           # 実行
 *   npm run enrich:corporate:dry       # ドライラン
 *   
 * オプション:
 *   --dry-run             実際の更新なし
 *   --limit N             処理する記事数を制限
 *   --company NAME        特定企業のみ処理（GMO, freee）
 */

import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '../lib/enrichers';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const prisma = new PrismaClient();

interface Options {
  dryRun: boolean;
  limit?: number;
  company?: string;
}

// コマンドライン引数をパース
const parseArgs = (): Options => {
  const argv = yargs(hideBin(process.argv))
    .option('dry-run', {
      type: 'boolean',
      default: false,
      description: 'Run without making actual changes',
    })
    .option('limit', {
      type: 'number',
      description: 'Limit number of articles to process',
    })
    .option('company', {
      type: 'string',
      description: 'Process only specific company (GMO, freee)',
    })
    .parseSync();

  return {
    dryRun: argv['dry-run'],
    limit: argv.limit,
    company: argv.company,
  };
};

// 遅延処理
const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// バッチ処理用の配列分割
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

async function main() {
  const options = parseArgs();
  const enricherFactory = new ContentEnricherFactory();

  console.error('=== 企業技術ブログコンテンツエンリッチメント ===');
  console.error(`モード: ${options.dryRun ? 'ドライラン' : '実行'}`);
  if (options.limit) console.error(`処理数制限: ${options.limit}件`);
  if (options.company) console.error(`対象企業: ${options.company}`);
  console.error('');

  try {
    // Corporate Tech Blogソースを取得
    const corporateSource = await prisma.source.findFirst({
      where: { name: 'Corporate Tech Blog' },
    });

    if (!corporateSource) {
      console.error('Corporate Tech Blogソースが見つかりません');
      process.exit(1);
    }

    // 対象記事を取得（コンテンツが500文字以下）
    const whereCondition: any = {
      sourceId: corporateSource.id,
      OR: [
        { content: null },
        { content: '' },
        { 
          content: {
            not: null,
            // Prismaでは文字数での直接フィルタリングができないため、後処理で確認
          }
        }
      ],
    };

    // 企業フィルタリング
    if (options.company) {
      const companyDomain = options.company.toLowerCase() === 'gmo' 
        ? 'developers.gmo.jp'
        : options.company.toLowerCase() === 'freee'
        ? 'developers.freee.co.jp'
        : null;
      
      if (companyDomain) {
        whereCondition.url = { contains: companyDomain };
      }
    }

    const articles = await prisma.article.findMany({
      where: whereCondition,
      orderBy: { publishedAt: 'desc' },
      take: options.limit,
    });

    // コンテンツが500文字以下の記事をフィルタリング
    const targetArticles = articles.filter(article => {
      const contentLength = article.content?.length || 0;
      return contentLength < 500;
    });

    console.error(`対象記事数: ${targetArticles.length}件`);

    if (targetArticles.length === 0) {
      console.error('エンリッチが必要な記事がありません');
      return;
    }

    // 統計情報
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    const improvements: { title: string; before: number; after: number }[] = [];

    // バッチ処理（5件ずつ）
    const batches = chunkArray(targetArticles, 5);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.error(`\nバッチ ${batchIndex + 1}/${batches.length} を処理中...`);

      for (const article of batch) {
        const enricher = enricherFactory.getEnricher(article.url);
        
        if (!enricher) {
          console.error(`[SKIP] ${article.title} - エンリッチャー未対応`);
          skipCount++;
          continue;
        }

        try {
          const beforeLength = article.content?.length || 0;
          console.error(`[処理中] ${article.title}`);
          console.error(`  現在: ${beforeLength}文字`);
          
          if (options.dryRun) {
            console.error(`  [DRY-RUN] ${article.url} をエンリッチします`);
            successCount++;
            continue;
          }

          const enrichedContent = await enricher.enrich(article.url);
          
          if (enrichedContent && enrichedContent.length > beforeLength) {
            // コンテンツを更新し、要約をリセット
            await prisma.article.update({
              where: { id: article.id },
              data: {
                content: enrichedContent,
                summary: null,                // 要約をリセット
                detailedSummary: null,        // 詳細要約もリセット
                summaryVersion: 0,            // バージョンをリセット
                updatedAt: new Date(),
              },
            });
            
            const afterLength = enrichedContent.length;
            console.error(`  成功: ${afterLength}文字 (${Math.round((afterLength / beforeLength - 1) * 100)}%改善)`);
            
            improvements.push({
              title: article.title,
              before: beforeLength,
              after: afterLength,
            });
            
            successCount++;
          } else {
            console.error(`  [FAIL] コンテンツ取得失敗`);
            failCount++;
          }
          
          // レート制限対策
          await delay(1500);
          
        } catch (error) {
          console.error(`  [ERROR] ${article.title}:`, error);
          failCount++;
        }
      }

      // バッチ間の待機
      if (batchIndex < batches.length - 1) {
        console.error('次のバッチまで5秒待機...');
        await delay(5000);
      }
    }

    // 結果サマリー
    console.error('\n=== エンリッチメント完了 ===');
    console.error(`成功: ${successCount}件`);
    console.error(`失敗: ${failCount}件`);
    console.error(`スキップ: ${skipCount}件`);
    
    if (improvements.length > 0 && !options.dryRun) {
      console.error('\n改善された記事:');
      improvements.forEach(imp => {
        const improvement = Math.round((imp.after / imp.before - 1) * 100);
        console.error(`  - ${imp.title}`);
        console.error(`    ${imp.before} → ${imp.after}文字 (${improvement}%改善)`);
      });
      
      const avgImprovement = improvements.reduce((sum, imp) => 
        sum + (imp.after / imp.before - 1), 0) / improvements.length * 100;
      console.error(`\n平均改善率: ${Math.round(avgImprovement)}%`);
      
      console.error('\n注意: 要約がリセットされました。要約生成スクリプトを実行してください:');
      console.error('  npm run scripts:summarize');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// 実行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});