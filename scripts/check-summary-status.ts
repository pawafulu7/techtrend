#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSummaryStatus() {
  console.log('📊 詳細要約の状態を確認中...\n');
  
  try {
    // 全記事数
    const totalCount = await prisma.article.count();
    
    // 詳細要約がない記事
    const noSummaryCount = await prisma.article.count({
      where: {
        OR: [
          { detailedSummary: null },
          { detailedSummary: '' }
        ]
      }
    });
    
    // 最近30日の記事で詳細要約をチェック
    const recentArticles = await prisma.article.findMany({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        detailedSummary: true
      }
    });
    
    let sixItemCount = 0;
    let threeItemCount = 0;
    let otherCount = 0;
    let emptyCount = 0;
    
    for (const article of recentArticles) {
      if (!article.detailedSummary) {
        emptyCount++;
        continue;
      }
      
      const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
      
      if (lines.length === 6) {
        sixItemCount++;
      } else if (lines.length === 3) {
        threeItemCount++;
      } else if (lines.length > 0) {
        otherCount++;
      } else {
        emptyCount++;
      }
    }
    
    console.log('='.repeat(60));
    console.log('📈 全体統計');
    console.log('-'.repeat(60));
    console.log(`全記事数: ${totalCount}件`);
    console.log(`詳細要約なし: ${noSummaryCount}件 (${(noSummaryCount/totalCount*100).toFixed(1)}%)`);
    console.log(`詳細要約あり: ${totalCount - noSummaryCount}件 (${((totalCount - noSummaryCount)/totalCount*100).toFixed(1)}%)`);
    
    console.log('\n📅 最近30日間の記事 (${recentArticles.length}件)');
    console.log('-'.repeat(60));
    console.log(`✅ 6項目（正常）: ${sixItemCount}件 (${(sixItemCount/recentArticles.length*100).toFixed(1)}%)`);
    console.log(`⚠️  3項目（簡略）: ${threeItemCount}件 (${(threeItemCount/recentArticles.length*100).toFixed(1)}%)`);
    console.log(`📝 その他の項目数: ${otherCount}件 (${(otherCount/recentArticles.length*100).toFixed(1)}%)`);
    console.log(`❌ 詳細要約なし: ${emptyCount}件 (${(emptyCount/recentArticles.length*100).toFixed(1)}%)`);
    
    // 最近再生成された記事をサンプル表示
    const recentlyUpdated = await prisma.article.findMany({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 1 * 60 * 60 * 1000) // 1時間以内
        }
      },
      select: {
        id: true,
        title: true,
        detailedSummary: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 5
    });
    
    if (recentlyUpdated.length > 0) {
      console.log('\n🔄 最近更新された記事（1時間以内）');
      console.log('-'.repeat(60));
      
      for (const article of recentlyUpdated) {
        const lines = article.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
        console.log(`・${article.title?.substring(0, 50)}...`);
        console.log(`  項目数: ${lines.length} | 更新: ${article.updatedAt.toLocaleTimeString()}`);
      }
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSummaryStatus().catch(console.error);