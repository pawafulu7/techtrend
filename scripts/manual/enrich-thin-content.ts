/**
 * 薄いコンテンツの記事をContentEnricherで更新するスクリプト
 * 
 * 使用方法:
 * npx tsx scripts/manual/enrich-thin-content.ts [options]
 * 
 * オプション:
 * --dry-run        実際の更新を行わずにシミュレーション
 * --source=xxx     特定のソースのみ処理
 * --limit=n        処理する記事数を制限
 * --skip=n         最初のn件をスキップ（継続処理用）
 * --skip-summary   要約のリセットをスキップ
 */

import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '../../lib/enrichers';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface Options {
  dryRun: boolean;
  source?: string;
  limit?: number;
  skip?: number;
  skipSummary: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: false,
    skipSummary: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--source=')) {
      options.source = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--skip=')) {
      options.skip = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--skip-summary') {
      options.skipSummary = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  
  console.log('========================================');
  console.log('薄いコンテンツのエンリッチメント');
  console.log('========================================');
  console.log('オプション:', {
    dryRun: options.dryRun ? 'Yes' : 'No',
    source: options.source || 'All',
    limit: options.limit || 'No limit',
    skip: options.skip || 0,
    skipSummary: options.skipSummary ? 'Yes' : 'No',
  });
  console.log('');

  if (options.dryRun) {
    console.log('⚠️  ドライランモード: 実際の更新は行いません');
    console.log('');
  }

  try {
    // 薄いコンテンツの記事を取得
    const whereCondition: any = {
      OR: [
        { content: null },
        { content: '' },
        // SQLiteでは LENGTH 関数を直接使えないため、後でフィルタリング
      ],
    };

    if (options.source) {
      whereCondition.source = {
        name: options.source,
      };
    }

    // 記事を取得
    let articles = await prisma.article.findMany({
      where: whereCondition,
      include: {
        source: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: options.limit || undefined,
    });

    // コンテンツが500文字未満の記事もフィルタリング
    const allThinArticles = await prisma.article.findMany({
      where: options.source ? { source: { name: options.source } } : {},
      include: {
        source: true,
      },
      orderBy: {
        publishedAt: 'desc',
      },
    });

    // 500文字未満の記事を抽出（既に処理済みの記事は除外）
    let thinArticles = allThinArticles.filter(article => {
      // コンテンツが空または500文字未満
      const isThin = !article.content || article.content.length < 500;
      // サムネイルが既に存在する場合は処理済みとみなす（ContentEnricherで取得済み）
      const hasEnrichedThumbnail = article.thumbnail && article.source.name !== 'Speaker Deck';
      return isThin && !hasEnrichedThumbnail;
    });

    // skipを適用
    if (options.skip && options.skip > 0) {
      console.log(`⏭️  最初の${options.skip}件をスキップします`);
      thinArticles = thinArticles.slice(options.skip);
    }

    // limitを適用
    if (options.limit) {
      thinArticles = thinArticles.slice(0, options.limit);
    }

    console.log(`📊 対象記事数: ${thinArticles.length}件`);
    
    if (thinArticles.length === 0) {
      console.log('処理対象の記事がありません。');
      return;
    }

    const enricherFactory = new ContentEnricherFactory();
    
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    let thumbnailCount = 0;

    for (let i = 0; i < thinArticles.length; i++) {
      const article = thinArticles[i];
      const progress = `[${i + 1}/${thinArticles.length}]`;
      
      console.log(`\n${progress} 処理中: ${article.title.substring(0, 50)}...`);
      console.log(`  ソース: ${article.source.name}`);
      console.log(`  現在のコンテンツ: ${article.content?.length || 0}文字`);
      console.log(`  URL: ${article.url}`);

      // エンリッチャーを取得
      const enricher = enricherFactory.getEnricher(article.url);
      
      if (!enricher) {
        console.log(`  ⏭️  スキップ: 対応するEnricherがありません`);
        skipCount++;
        continue;
      }

      try {
        // コンテンツをエンリッチ
        console.log(`  🔄 エンリッチ中...`);
        const enrichedData = await enricher.enrich(article.url);
        
        if (!enrichedData) {
          console.log(`  ❌ エンリッチ失敗: コンテンツを取得できませんでした`);
          failCount++;
          continue;
        }

        const hasNewContent = enrichedData.content && enrichedData.content.length > (article.content?.length || 0);
        const hasNewThumbnail = enrichedData.thumbnail && !article.thumbnail;

        if (!hasNewContent && !hasNewThumbnail) {
          console.log(`  ⏭️  スキップ: 新しいデータがありません`);
          skipCount++;
          continue;
        }

        console.log(`  ✅ エンリッチ成功:`);
        if (hasNewContent) {
          console.log(`    - コンテンツ: ${article.content?.length || 0} → ${enrichedData.content?.length}文字`);
        }
        if (hasNewThumbnail) {
          console.log(`    - サムネイル: 取得成功`);
          thumbnailCount++;
        }

        if (!options.dryRun) {
          // データベースを更新
          const updateData: any = {};
          
          if (hasNewContent) {
            updateData.content = enrichedData.content;
            if (!options.skipSummary) {
              // 要約をリセット（再生成が必要）
              updateData.summary = null;
              updateData.detailedSummary = null;
              // summaryVersionはnullableでないため、0に設定
              updateData.summaryVersion = 0;
              console.log(`    - 要約: リセット（再生成が必要）`);
            }
          }
          
          if (hasNewThumbnail) {
            updateData.thumbnail = enrichedData.thumbnail;
          }

          await prisma.article.update({
            where: { id: article.id },
            data: updateData,
          });
          
          console.log(`  💾 データベース更新完了`);
        }
        
        successCount++;

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        console.error(`  ❌ エラー:`, error);
        failCount++;
      }
    }

    // 結果サマリー
    console.log('\n========================================');
    console.log('処理結果サマリー');
    console.log('========================================');
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`❌ 失敗: ${failCount}件`);
    console.log(`⏭️  スキップ: ${skipCount}件`);
    console.log(`🖼️  サムネイル取得: ${thumbnailCount}件`);
    console.log(`📊 合計: ${thinArticles.length}件`);

    if (options.dryRun) {
      console.log('\n⚠️  ドライランモードのため、実際の更新は行われませんでした。');
      console.log('本番実行するには --dry-run オプションを外してください。');
    } else if (successCount > 0 && !options.skipSummary) {
      console.log('\n📝 要約の再生成が必要です:');
      console.log('   npm run scripts:summarize');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);