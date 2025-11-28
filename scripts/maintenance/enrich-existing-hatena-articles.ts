#!/usr/bin/env npx tsx
/**
 * 既存のはてなブックマーク記事のコンテンツをエンリッチメント
 * 短いRSS抜粋を実際の記事コンテンツに置き換える
 */

import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '../../lib/enrichers';

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
    
    console.error('='.repeat(60));
    console.error('はてなブックマーク記事エンリッチメント');
    console.error('='.repeat(60));
    console.error(`処理対象: ${result.total}件`);
    console.error(`モード: ${testMode ? 'テスト' : '本番'}`);
    if (limit) console.error(`制限: ${limit}件`);
    console.error('='.repeat(60));
    console.error('');

    // 各記事を処理
    for (let i = 0; i < targetArticles.length; i++) {
      const article = targetArticles[i];
      const currentLength = article.content?.length || 0;
      
      console.error(`[${i + 1}/${result.total}] ${article.title.substring(0, 50)}...`);
      console.error(`  URL: ${article.url}`);
      console.error(`  現在のコンテンツ: ${currentLength}文字`);
      
      result.processed++;

      try {
        // エンリッチャーを取得
        const enricher = enricherFactory.getEnricher(article.url);
        
        if (!enricher) {
          console.error(`  ⚠️  エンリッチャーなし（スキップ）`);
          result.skipped++;
          continue;
        }

        // エンリッチメント実行
        console.error(`  エンリッチメント実行中...`);
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
          
          console.error(`  ✅ 成功: ${currentLength} → ${newLength}文字 (${expansion}倍)`);
          if (enrichedData.thumbnail && !article.thumbnail) {
            console.error(`  📷 サムネイル取得`);
          }
          console.error(`  実行時間: ${endTime - startTime}ms`);
          
          result.enriched++;
        } else {
          console.error(`  ⚠️  コンテンツ改善なし（スキップ）`);
          result.skipped++;
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`  ❌ エラー: ${errorMsg}`);
        result.failed++;
        result.errors.push(`${article.title}: ${errorMsg}`);
      }
      
      // Rate limit対策（本番モードのみ）
      if (!testMode && i < targetArticles.length - 1) {
        console.error(`  待機中... (2秒)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.error('');
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
  console.error('='.repeat(60));
  console.error('処理結果サマリー');
  console.error('='.repeat(60));
  console.error(`対象記事数: ${result.total}`);
  console.error(`処理済み: ${result.processed}`);
  console.error(`エンリッチメント成功: ${result.enriched}`);
  console.error(`スキップ: ${result.skipped}`);
  console.error(`失敗: ${result.failed}`);
  
  if (result.enriched > 0) {
    const successRate = ((result.enriched / result.processed) * 100).toFixed(1);
    console.error(`成功率: ${successRate}%`);
  }
  
  if (result.errors.length > 0 && result.errors.length <= 5) {
    console.error('\nエラー詳細:');
    result.errors.forEach(err => console.error(`  - ${err}`));
  } else if (result.errors.length > 5) {
    console.error(`\nエラー: ${result.errors.length}件（詳細は省略）`);
  }
  
  if (testMode) {
    console.error('\n⚠️  テストモード: データベースは更新されていません');
  } else if (result.enriched > 0) {
    console.error('\n✅ データベースが更新されました');
  }
  
  console.error('='.repeat(60));
  
  await prisma.$disconnect();
  process.exit(result.failed > result.enriched ? 1 : 0);
}

// 使用方法の表示
if (process.argv.includes('--help')) {
  console.error('使用方法:');
  console.error('  npx tsx scripts/enrich-existing-hatena-articles.ts [オプション]');
  console.error('');
  console.error('オプション:');
  console.error('  --test        テストモード（データベース更新なし）');
  console.error('  --limit=N     処理する記事数を制限');
  console.error('  --help        このヘルプを表示');
  console.error('');
  console.error('例:');
  console.error('  npx tsx scripts/enrich-existing-hatena-articles.ts --test --limit=10');
  console.error('  npx tsx scripts/enrich-existing-hatena-articles.ts --limit=50');
  console.error('  npx tsx scripts/enrich-existing-hatena-articles.ts');
  process.exit(0);
}

main().catch(console.error);