#!/usr/bin/env npx tsx
/**
 * 既存のはてなブックマーク記事のコンテンツをエンリッチメント
 * 短いRSS抜粋を実際の記事コンテンツに置き換える
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
}

async function enrichExistingArticles(limit?: number, testMode: boolean = false): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    total: 0,
    processed: 0,
    enriched: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    // ContentEnricherFactoryのインスタンス作成
    const enricherFactory = new ContentEnricherFactory();
    
    // はてなブックマークのソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'はてなブックマーク' }
    });

    if (!source) {
      console.error('❌ はてなブックマークのソースが見つかりません');
      return result;
    }

    // 対象記事を取得（コンテンツが短い記事を優先）
    const articles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        OR: [
          { content: null },
          { content: '' },
          { content: { contains: '' } } // すべての記事を対象にする場合
        ]
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

    // コンテンツが短い記事のみフィルタリング（500文字未満）
    const targetArticles = articles.filter(article => {
      const contentLength = article.content?.length || 0;
      return contentLength < 500;
    });

    result.total = targetArticles.length;
    
    console.log('='.repeat(60));
    console.log('はてなブックマーク記事エンリッチメント');
    console.log('='.repeat(60));
    console.log(`処理対象: ${result.total}件`);
    console.log(`モード: ${testMode ? 'テスト' : '本番'}`);
    if (limit) console.log(`制限: ${limit}件`);
    console.log('='.repeat(60));
    console.log('');

    // 各記事を処理
    for (let i = 0; i < targetArticles.length; i++) {
      const article = targetArticles[i];
      const currentLength = article.content?.length || 0;
      
      console.log(`[${i + 1}/${result.total}] ${article.title.substring(0, 50)}...`);
      console.log(`  URL: ${article.url}`);
      console.log(`  現在のコンテンツ: ${currentLength}文字`);
      
      result.processed++;

      try {
        // エンリッチャーを取得
        const enricher = enricherFactory.getEnricher(article.url);
        
        if (!enricher) {
          console.log(`  ⚠️  エンリッチャーなし（スキップ）`);
          result.skipped++;
          continue;
        }

        // エンリッチメント実行
        console.log(`  エンリッチメント実行中...`);
        const startTime = Date.now();
        const enrichedData = await enricher.enrich(article.url);
        const endTime = Date.now();
        
        if (enrichedData && enrichedData.content && enrichedData.content.length > currentLength) {
          // より長いコンテンツが取得できた場合のみ更新
          if (!testMode) {
            await prisma.article.update({
              where: { id: article.id },
              data: {
                content: enrichedData.content,
                thumbnail: enrichedData.thumbnail || article.thumbnail
              }
            });
          }
          
          const newLength = enrichedData.content.length;
          const expansion = (newLength / Math.max(currentLength, 1)).toFixed(1);
          
          console.log(`  ✅ 成功: ${currentLength} → ${newLength}文字 (${expansion}倍)`);
          if (enrichedData.thumbnail && !article.thumbnail) {
            console.log(`  📷 サムネイル取得`);
          }
          console.log(`  実行時間: ${endTime - startTime}ms`);
          
          result.enriched++;
        } else {
          console.log(`  ⚠️  コンテンツ改善なし（スキップ）`);
          result.skipped++;
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`  ❌ エラー: ${errorMsg}`);
        result.failed++;
        result.errors.push(`${article.title}: ${errorMsg}`);
      }
      
      // Rate limit対策（本番モードのみ）
      if (!testMode && i < targetArticles.length - 1) {
        console.log(`  待機中... (2秒)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log('');
    }

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
    result.errors.push(`全体エラー: ${error}`);
  }

  return result;
}

async function main() {
  // コマンドライン引数の処理
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

  // 実行
  const result = await enrichExistingArticles(limit, testMode);
  
  // 結果サマリー
  console.log('='.repeat(60));
  console.log('処理結果サマリー');
  console.log('='.repeat(60));
  console.log(`対象記事数: ${result.total}`);
  console.log(`処理済み: ${result.processed}`);
  console.log(`エンリッチメント成功: ${result.enriched}`);
  console.log(`スキップ: ${result.skipped}`);
  console.log(`失敗: ${result.failed}`);
  
  if (result.enriched > 0) {
    const successRate = ((result.enriched / result.processed) * 100).toFixed(1);
    console.log(`成功率: ${successRate}%`);
  }
  
  if (result.errors.length > 0 && result.errors.length <= 5) {
    console.log('\nエラー詳細:');
    result.errors.forEach(err => console.log(`  - ${err}`));
  } else if (result.errors.length > 5) {
    console.log(`\nエラー: ${result.errors.length}件（詳細は省略）`);
  }
  
  if (testMode) {
    console.log('\n⚠️  テストモード: データベースは更新されていません');
  } else if (result.enriched > 0) {
    console.log('\n✅ データベースが更新されました');
  }
  
  console.log('='.repeat(60));
  
  await prisma.$disconnect();
  process.exit(result.failed > result.enriched ? 1 : 0);
}

// 使用方法の表示
if (process.argv.includes('--help')) {
  console.log('使用方法:');
  console.log('  npx tsx scripts/enrich-existing-hatena-articles.ts [オプション]');
  console.log('');
  console.log('オプション:');
  console.log('  --test        テストモード（データベース更新なし）');
  console.log('  --limit=N     処理する記事数を制限');
  console.log('  --help        このヘルプを表示');
  console.log('');
  console.log('例:');
  console.log('  npx tsx scripts/enrich-existing-hatena-articles.ts --test --limit=10');
  console.log('  npx tsx scripts/enrich-existing-hatena-articles.ts --limit=50');
  console.log('  npx tsx scripts/enrich-existing-hatena-articles.ts');
  process.exit(0);
}

main().catch(console.error);