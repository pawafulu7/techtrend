#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRecentSummaries() {
  console.error('🔍 最近の記事の要約状態を確認中...\n');
  
  try {
    // 最新の10件の記事を取得
    const recentArticles = await prisma.article.findMany({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24時間以内
        }
      },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
        publishedAt: true,
        sourceId: true
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 20
    });
    
    console.error(`過去24時間の記事数: ${recentArticles.length}\n`);
    
    let invalidCount = 0;
    
    for (const article of recentArticles) {
      const lines = article.detailedSummary?.split('\n').filter(l => l.trim()) || [];
      const bulletPoints = lines.filter(l => l.trim().startsWith('・'));
      
      // 要約と詳細要約の最初の部分が同じかチェック
      const summaryInDetailed = article.detailedSummary?.includes(article.summary || '') || false;
      
      // 問題がある記事を表示
      if (bulletPoints.length < 6 || summaryInDetailed) {
        invalidCount++;
        console.error(`❌ 問題のある記事 #${invalidCount}`);
        console.error(`ID: ${article.id}`);
        console.error(`タイトル: ${article.title?.substring(0, 60)}...`);
        console.error(`公開日: ${article.publishedAt?.toISOString()}`);
        console.error(`項目数: ${bulletPoints.length}`);
        console.error(`要約が詳細要約に含まれる: ${summaryInDetailed ? 'はい' : 'いいえ'}`);
        
        if (article.summary) {
          console.error(`要約: ${article.summary.substring(0, 80)}...`);
        }
        
        if (bulletPoints.length > 0) {
          console.error(`詳細要約の最初の項目: ${bulletPoints[0].substring(0, 80)}...`);
        }
        
        console.error('-'.repeat(80));
      }
    }
    
    if (invalidCount === 0) {
      console.error('✅ 過去24時間の記事に問題は見つかりませんでした');
    } else {
      console.error(`\n⚠️ 問題のある記事: ${invalidCount}件`);
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecentSummaries().catch(console.error);