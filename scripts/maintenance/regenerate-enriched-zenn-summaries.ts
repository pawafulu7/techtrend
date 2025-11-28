#!/usr/bin/env npx tsx
/**
 * エンリッチメント済みZenn記事の要約を再生成
 * フルコンテンツから高品質な要約を生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

interface RegenerationResult {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: string[];
  stats: {
    avgSummaryLength: number;
    avgDetailedSummaryLength: number;
  };
}

async function regenerateEnrichedZennSummaries(limit?: number, testMode: boolean = false): Promise<RegenerationResult> {
  const result: RegenerationResult = {
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    stats: {
      avgSummaryLength: 0,
      avgDetailedSummaryLength: 0
    }
  };

  const summaryLengths: number[] = [];
  const detailedSummaryLengths: number[] = [];

  try {
    // UnifiedSummaryServiceのインスタンス作成
    const summaryService = new UnifiedSummaryService();
    
    // Zennのソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'Zenn' }
    });

    if (!source) {
      console.error('❌ Zennのソースが見つかりません');
      return result;
    }

    // エンリッチメント済み記事を取得（1000文字以上のコンテンツを持つ記事）
    const articles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        content: {
          not: null
        }
      },
      orderBy: [
        { publishedAt: 'desc' } // 新しい記事から処理
      ],
      take: limit || undefined,
      select: {
        id: true,
        title: true,
        url: true,
        content: true,
        summary: true,
        detailedSummary: true,
        publishedAt: true
      }
    });

    // 1000文字以上のコンテンツを持つ記事のみ対象
    const targetArticles = articles.filter(article => {
      const contentLength = article.content?.length || 0;
      return contentLength >= 1000; // エンリッチメント成功の目安
    });

    result.total = targetArticles.length;
    
    console.error('='.repeat(60));
    console.error('エンリッチメント済みZenn記事の要約再生成');
    console.error('='.repeat(60));
    console.error(`処理対象: ${result.total}件（1000文字以上のコンテンツ）`);
    console.error('='.repeat(60));

    if (testMode) {
      console.error('🧪 テストモード: 実際の更新は行いません');
    }

    // 各記事に対して要約再生成を実行
    for (const article of targetArticles) {
      result.processed++;
      
      console.error(`\n[${result.processed}/${result.total}] ${article.title}`);
      console.error(`  URL: ${article.url}`);
      console.error(`  コンテンツ長: ${article.content?.length || 0}文字`);
      console.error(`  現在の要約長: ${article.summary?.length || 0}文字`);
      console.error(`  現在の詳細要約長: ${article.detailedSummary?.length || 0}文字`);
      
      // コンテンツが不足している場合はスキップ
      if (!article.content || article.content.length < 500) {
        console.error('  ⏭️ スキップ: コンテンツが不十分');
        result.skipped++;
        continue;
      }
      
      try {
        // 要約生成実行
        console.error('  🤖 要約生成中...');
        const summaryResult = await summaryService.generate(
          article.title,
          article.content,
          {
            url: article.url,
            summaryVersion: 7, // 最新バージョン
            articleType: 'unified' // 統一フォーマット
          }
        );
        
        if (summaryResult.summary && summaryResult.detailedSummary) {
          if (!testMode) {
            // データベース更新
            await prisma.article.update({
              where: { id: article.id },
              data: {
                summary: summaryResult.summary,
                detailedSummary: summaryResult.detailedSummary,
                summaryVersion: 7,
                articleType: 'unified'
              }
            });
          }
          
          summaryLengths.push(summaryResult.summary.length);
          detailedSummaryLengths.push(summaryResult.detailedSummary.length);
          
          console.error(`  ✅ 要約再生成成功:`);
          console.error(`     要約: ${article.summary?.length || 0} -> ${summaryResult.summary.length}文字`);
          console.error(`     詳細要約: ${article.detailedSummary?.length || 0} -> ${summaryResult.detailedSummary.length}文字`);
          result.succeeded++;
        } else {
          console.error('  ⚠️ 要約生成に失敗しました');
          result.failed++;
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  ❌ エラー: ${errorMessage}`);
        result.errors.push(`${article.url}: ${errorMessage}`);
        result.failed++;
      }
      
      // API Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機
      
      // 10件ごとに長めの待機
      if (result.processed % 10 === 0) {
        console.error('\n⏸️ Rate limit対策のため30秒待機...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    // 統計情報の計算
    if (summaryLengths.length > 0) {
      result.stats.avgSummaryLength = Math.round(
        summaryLengths.reduce((sum, len) => sum + len, 0) / summaryLengths.length
      );
      result.stats.avgDetailedSummaryLength = Math.round(
        detailedSummaryLengths.reduce((sum, len) => sum + len, 0) / detailedSummaryLengths.length
      );
    }

  } catch (error) {
    console.error('❌ 処理中にエラーが発生しました:', error);
    result.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await prisma.$disconnect();
  }

  return result;
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  console.error('🚀 エンリッチメント済みZenn記事の要約再生成を開始します\n');

  const startTime = Date.now();
  const result = await regenerateEnrichedZennSummaries(limit, testMode);
  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);

  // 結果サマリー
  console.error('\n' + '='.repeat(60));
  console.error('処理結果サマリー');
  console.error('='.repeat(60));
  console.error(`総対象記事数: ${result.total}`);
  console.error(`処理済み: ${result.processed}`);
  console.error(`再生成成功: ${result.succeeded}`);
  console.error(`失敗: ${result.failed}`);
  console.error(`スキップ: ${result.skipped}`);
  console.error(`成功率: ${result.total > 0 ? Math.round((result.succeeded / result.total) * 100) : 0}%`);
  console.error(`処理時間: ${duration}秒`);

  if (result.succeeded > 0) {
    console.error('\n📊 要約統計:');
    console.error(`  平均要約長: ${result.stats.avgSummaryLength}文字`);
    console.error(`  平均詳細要約長: ${result.stats.avgDetailedSummaryLength}文字`);
  }

  if (result.errors.length > 0) {
    console.error('\n⚠️ エラー詳細:');
    result.errors.slice(0, 10).forEach(error => {
      console.error(`  - ${error}`);
    });
    if (result.errors.length > 10) {
      console.error(`  ... 他${result.errors.length - 10}件のエラー`);
    }
  }

  if (testMode) {
    console.error('\n🧪 テストモードで実行されました。実際のデータベース更新は行われていません。');
  }

  console.error('\n💡 注意: Gemini APIのRate limitにより、処理に時間がかかる場合があります。');
  console.error('   エラーが多発する場合は、時間をおいて再実行してください。');

  process.exit(result.failed > 0 ? 1 : 0);
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('❌ 未処理のエラーが発生しました:', error);
  process.exit(1);
});

// 実行
main().catch(console.error);
