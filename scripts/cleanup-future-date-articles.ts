import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupFutureDateArticles(dryRun = true) {
  const now = new Date();
  
  console.log('========================================');
  console.log('AWS記事クリーンアップスクリプト');
  console.log(`実行日時: ${now.toISOString()}`);
  console.log(`モード: ${dryRun ? 'ドライラン' : '本番実行'}`);
  console.log('========================================\n');
  
  try {
    // 未来日付の記事を検索
    console.log('1. 未来日付の記事を検索中...');
    const futureArticles = await prisma.article.findMany({
      where: {
        sourceId: 'cmdq4382o0000tecrle79yxxl', // AWS Source ID
        publishedAt: {
          gt: now
        }
      },
      select: {
        id: true,
        title: true,
        url: true,
        publishedAt: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });

    // URL構造が異常な記事を検索
    console.log('2. URL構造が異常な記事を検索中...');
    const malformedUrlArticles = await prisma.article.findMany({
      where: {
        url: {
          contains: 'https//aws'
        }
      },
      select: {
        id: true,
        title: true,
        url: true,
        publishedAt: true
      }
    });

    // 結果サマリー表示
    console.log('\n========================================');
    console.log('検索結果サマリー');
    console.log('========================================');
    console.log(`未来日付の記事: ${futureArticles.length}件`);
    console.log(`URL異常の記事: ${malformedUrlArticles.length}件`);
    console.log(`合計削除対象: ${futureArticles.length + malformedUrlArticles.length}件`);
    
    // 詳細表示
    if (futureArticles.length > 0) {
      console.log('\n【未来日付の記事（最初の5件）】');
      futureArticles.slice(0, 5).forEach((article, index) => {
        const date = new Date(article.publishedAt);
        console.log(`${index + 1}. ${article.title}`);
        console.log(`   日付: ${date.toISOString()}`);
        console.log(`   URL: ${article.url}`);
      });
      if (futureArticles.length > 5) {
        console.log(`   ... 他${futureArticles.length - 5}件`);
      }
    }
    
    if (malformedUrlArticles.length > 0) {
      console.log('\n【URL構造が異常な記事】');
      malformedUrlArticles.forEach((article, index) => {
        console.log(`${index + 1}. ${article.title}`);
        console.log(`   URL: ${article.url}`);
      });
    }

    if (dryRun) {
      console.log('\n========================================');
      console.log('ドライランモード - 実際の削除は行いません');
      console.log('本番実行する場合は、以下のコマンドを実行してください:');
      console.log('npx tsx scripts/cleanup-future-date-articles.ts --execute');
      console.log('========================================');
      return;
    }

    // 削除実行
    console.log('\n========================================');
    console.log('削除を実行中...');
    console.log('========================================');
    
    const deleteIds = [
      ...futureArticles.map(a => a.id),
      ...malformedUrlArticles.map(a => a.id)
    ];
    
    // 重複を除去
    const uniqueDeleteIds = [...new Set(deleteIds)];
    
    if (uniqueDeleteIds.length === 0) {
      console.log('削除対象の記事がありません。');
      return;
    }

    const result = await prisma.article.deleteMany({
      where: {
        id: {
          in: uniqueDeleteIds
        }
      }
    });

    console.log(`\n削除完了: ${result.count}件の記事を削除しました`);
    
    // 削除後の確認
    const remainingFutureArticles = await prisma.article.count({
      where: {
        sourceId: 'cmdq4382o0000tecrle79yxxl',
        publishedAt: {
          gt: now
        }
      }
    });
    
    const remainingMalformedUrls = await prisma.article.count({
      where: {
        url: {
          contains: 'https//aws'
        }
      }
    });
    
    console.log('\n========================================');
    console.log('削除後の確認');
    console.log('========================================');
    console.log(`残存する未来日付の記事: ${remainingFutureArticles}件`);
    console.log(`残存するURL異常の記事: ${remainingMalformedUrls}件`);
    
  } catch (error) {
    console.error('\nエラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン実行
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--execute');
  
  await cleanupFutureDateArticles(isDryRun);
}

main().catch((error) => {
  console.error('予期しないエラー:', error);
  process.exit(1);
});