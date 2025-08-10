#!/usr/bin/env npx tsx
/**
 * 詳細要約に含まれる * を ・ に修正するスクリプト
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixAsteriskSummaries() {
  console.log('📝 詳細要約の * を ・ に修正します...\n');

  try {
    // summaryVersion 5 の記事で、詳細要約に * が含まれるものを取得
    const articles = await prisma.article.findMany({
      where: {
        summaryVersion: 5,
        detailedSummary: {
          contains: '*'
        }
      },
      select: {
        id: true,
        title: true,
        detailedSummary: true
      }
    });

    if (articles.length === 0) {
      console.log('✅ 修正が必要な記事はありません');
      return;
    }

    console.log(`📊 ${articles.length}件の記事を修正します\n`);

    for (const article of articles) {
      console.log(`処理中: ${article.id}`);
      console.log(`  タイトル: ${article.title.substring(0, 50)}...`);
      
      // * を ・ に置換
      const fixedSummary = article.detailedSummary!.replace(/\*/g, '・');
      
      // データベース更新
      await prisma.article.update({
        where: { id: article.id },
        data: {
          detailedSummary: fixedSummary
        }
      });
      
      console.log(`  ✅ 修正完了\n`);
    }

    console.log('✨ すべての記事の修正が完了しました');
    
    // 修正結果の確認
    const remainingCount = await prisma.article.count({
      where: {
        summaryVersion: 5,
        detailedSummary: {
          contains: '*'
        }
      }
    });
    
    if (remainingCount > 0) {
      console.warn(`⚠️  まだ ${remainingCount}件の記事に * が残っています`);
    } else {
      console.log('✅ すべての * が ・ に修正されました');
    }
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// メイン処理
fixAsteriskSummaries()
  .then(() => {
    console.log('🎉 処理完了');
  })
  .catch((error) => {
    console.error('💥 致命的エラー:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });