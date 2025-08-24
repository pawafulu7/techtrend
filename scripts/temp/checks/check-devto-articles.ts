#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkDevtoArticles() {
  // Dev.toの直近10件を取得
  const articles = await prisma.article.findMany({
    where: {
      source: {
        name: 'Dev.to'
      }
    },
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 10
  });
  
  console.error('📊 Dev.toの直近10件の記事');
  console.error('='.repeat(80));
  console.error('取得件数: ' + articles.length + '件\n');
  
  articles.forEach((article, i) => {
    console.error('\n' + '='.repeat(60));
    console.error('[' + (i + 1) + '] ID: ' + article.id);
    console.error('作成日: ' + article.createdAt.toISOString());
    console.error('更新日: ' + article.updatedAt.toISOString());
    console.error('タイトル: ' + (article.title?.substring(0, 50) || '') + '...');
    
    console.error('\n📝 要約:');
    console.error(article.summary || '(なし)');
    
    // 要約の問題分析
    const summaryIssues = [];
    if (article.summary === null || article.summary === undefined) {
      summaryIssues.push('要約なし');
    } else {
      if (article.summary.startsWith('要約:') || article.summary.startsWith(' 要約:')) {
        summaryIssues.push('プレフィックスあり');
      }
      if (article.summary.includes('**')) {
        summaryIssues.push('Markdown記法');
      }
      if (article.summary.length < 50) {
        summaryIssues.push('短すぎ(' + article.summary.length + '文字)');
      }
      if (article.summary.endsWith('。') === false) {
        summaryIssues.push('句点なし');
      }
    }
    
    console.error('\n📋 詳細要約:');
    if (article.detailedSummary) {
      const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
      console.error('項目数: ' + lines.length);
      
      // 最初の2項目だけ表示
      lines.slice(0, 2).forEach(line => {
        console.error(line.substring(0, 80) + '...');
      });
      
      if (lines.length < 5) {
        summaryIssues.push('詳細要約不完全(' + lines.length + '項目)');
      }
    } else {
      console.error('(なし)');
      summaryIssues.push('詳細要約なし');
    }
    
    if (summaryIssues.length > 0) {
      console.error('\n⚠️ 問題: ' + summaryIssues.join(', '));
    } else {
      console.error('\n✅ 問題なし');
    }
  });
  
  // 問題のある記事のIDリスト
  const problematicIds = articles
    .filter(a => {
      const noSummary = a.summary === null || a.summary === undefined;
      const noDetails = a.detailedSummary === null || a.detailedSummary === undefined;
      const incompleteDetails = a.detailedSummary && 
        a.detailedSummary.split('\n').filter(l => l.trim().startsWith('・')).length < 5;
      return noSummary || noDetails || incompleteDetails;
    })
    .map(a => a.id);
  
  if (problematicIds.length > 0) {
    console.error('\n' + '='.repeat(60));
    console.error('\n🚨 問題のある記事ID:');
    console.error(JSON.stringify(problematicIds, null, 2));
  }
  
  await prisma.$disconnect();
}

checkDevtoArticles().catch(console.error);