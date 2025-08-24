#!/usr/bin/env npx tsx
/**
 * 既存のZenn記事のコンテンツをエンリッチメント
 * 300文字に切り詰められたRSS抜粋を実際の記事コンテンツに置き換える
 */

import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '../lib/enrichers';

const prisma = new PrismaClient();

interface EnrichmentResult {
  total: number;
  processed: number;
  enriched: number;
  failed: number;
  skipped: number;
  errors: string[];
  stats: {
    minLength: number;
    maxLength: number;
    avgLength: number;
  };
}

async function enrichExistingZennArticles(limit?: number, testMode: boolean = false): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    total: 0,
    processed: 0,
    enriched: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    stats: {
      minLength: 0,
      maxLength: 0,
      avgLength: 0
    }
  };

  const enrichedLengths: number[] = [];

  try {
    // ContentEnricherFactoryのインスタンス作成
    const enricherFactory = new ContentEnricherFactory();
    
    // Zennのソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'Zenn' }
    });

    if (!source) {
      console.error('❌ Zennのソースが見つかりません');
      return result;
    }

    // 対象記事を取得（300文字ちょうどの記事を優先）
    const articles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        content: {
          not: null
        }
      },
      orderBy: [
        { createdAt: 'desc' } // 新しい記事から処理
      ],
      take: limit || undefined,
      select: {
        id: true,
        title: true,
        url: true,
        content: true,
        thumbnail: true,
        createdAt: true
      }
    });

    // コンテンツが300文字ちょうどの記事をフィルタリング
    const targetArticles = articles.filter(article => {
      const contentLength = article.content?.length || 0;
      return contentLength === 300; // RSS-parserの切り詰め長
    });

    result.total = targetArticles.length;
    
    console.error('='.repeat(60));
    console.error('Zenn記事エンリッチメント');
    console.error('='.repeat(60));
    console.error(`処理対象: ${result.total}件（300文字ちょうどの記事）`);
    console.error('='.repeat(60));

    if (testMode) {
      console.error('🧪 テストモード: 実際の更新は行いません');
    }

    // 各記事に対してエンリッチメント実行
    for (const article of targetArticles) {
      result.processed++;
      
      console.error(`\n[${result.processed}/${result.total}] ${article.title}`);
      console.error(`  URL: ${article.url}`);
      console.error(`  現在のコンテンツ長: ${article.content?.length || 0}文字`);
      
      // エンリッチャーを取得
      const enricher = enricherFactory.getEnricher(article.url);
      
      if (!enricher) {
        console.error('  ⚠️ エンリッチャーが見つかりません');
        result.skipped++;
        continue;
      }
      
      try {
        // エンリッチメント実行
        console.error('  📥 コンテンツ取得中...');
        const enrichedData = await enricher.enrich(article.url);
        
        if (enrichedData && enrichedData.content) {
          const newContentLength = enrichedData.content.length;
          
          // より長いコンテンツが取得できた場合のみ更新
          if (newContentLength > (article.content?.length || 0)) {
            if (!testMode) {
              // データベース更新
              await prisma.article.update({
                where: { id: article.id },
                data: {
                  content: enrichedData.content,
                  thumbnail: enrichedData.thumbnail || article.thumbnail
                }
              });
            }
            
            enrichedLengths.push(newContentLength);
            console.error(`  ✅ エンリッチメント成功: ${article.content?.length || 0} -> ${newContentLength}文字`);
            result.enriched++;
          } else {
            console.error(`  ⏭️ スキップ: 既存コンテンツの方が長い`);
            result.skipped++;
          }
        } else {
          console.error('  ⚠️ コンテンツが取得できませんでした');
          result.failed++;
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  ❌ エラー: ${errorMessage}`);
        result.errors.push(`${article.url}: ${errorMessage}`);
        result.failed++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 統計情報の計算
    if (enrichedLengths.length > 0) {
      result.stats.minLength = Math.min(...enrichedLengths);
      result.stats.maxLength = Math.max(...enrichedLengths);
      result.stats.avgLength = Math.round(
        enrichedLengths.reduce((sum, len) => sum + len, 0) / enrichedLengths.length
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

  console.error('🚀 Zenn記事エンリッチメントを開始します\n');

  const startTime = Date.now();
  const result = await enrichExistingZennArticles(limit, testMode);
  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);

  // 結果サマリー
  console.error('\n' + '='.repeat(60));
  console.error('処理結果サマリー');
  console.error('='.repeat(60));
  console.error(`総対象記事数: ${result.total}`);
  console.error(`処理済み: ${result.processed}`);
  console.error(`エンリッチメント成功: ${result.enriched}`);
  console.error(`失敗: ${result.failed}`);
  console.error(`スキップ: ${result.skipped}`);
  console.error(`成功率: ${result.total > 0 ? Math.round((result.enriched / result.total) * 100) : 0}%`);
  console.error(`処理時間: ${duration}秒`);

  if (result.enriched > 0) {
    console.error('\n📊 エンリッチメント統計:');
    console.error(`  最小文字数: ${result.stats.minLength.toLocaleString()}文字`);
    console.error(`  最大文字数: ${result.stats.maxLength.toLocaleString()}文字`);
    console.error(`  平均文字数: ${result.stats.avgLength.toLocaleString()}文字`);
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

  process.exit(result.failed > 0 ? 1 : 0);
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('❌ 未処理のエラーが発生しました:', error);
  process.exit(1);
});

// 実行
main().catch(console.error);