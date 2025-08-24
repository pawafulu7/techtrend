#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findMalformedSummaries() {
  console.error('🔍 不正な形式の要約を検索中...\n');
  
  try {
    // 最近の記事を取得
    const articles = await prisma.article.findMany({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30日以内
        }
      },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
        publishedAt: true
      }
    });
    
    const malformedArticles = [];
    
    for (const article of articles) {
      const issues = [];
      
      // Markdown記法のチェック
      if (article.summary?.includes('**')) {
        issues.push('Markdown記法');
      }
      
      if (article.summary?.includes('## ')) {
        issues.push('見出し記法');
      }
      
      // 詳細要約の問題チェック
      if (article.detailedSummary?.includes('**要約:**') || 
          article.detailedSummary?.includes('**要約：**')) {
        issues.push('要約ラベル重複');
      }
      
      if (article.detailedSummary?.includes('## ')) {
        issues.push('詳細要約に見出し');
      }
      
      // 要約が詳細要約の最初の項目と同じ
      const firstLine = article.detailedSummary?.split('\n')[0];
      if (firstLine && article.summary && firstLine.includes(article.summary.substring(0, 50))) {
        issues.push('要約と詳細要約が重複');
      }
      
      // 3項目以下で、かつ「記事内のコード例や手順を参照してください」を含む
      const lines = article.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
      if (lines.length === 3 && article.detailedSummary?.includes('記事内のコード例や手順を参照してください')) {
        issues.push('簡略化された3項目形式');
      }
      
      if (issues.length > 0) {
        malformedArticles.push({
          id: article.id,
          title: article.title,
          issues: issues,
          publishedAt: article.publishedAt
        });
      }
    }
    
    console.error(`検査した記事: ${articles.length}件`);
    console.error(`問題のある記事: ${malformedArticles.length}件\n`);
    
    // 問題タイプ別に集計
    const issueStats: Record<string, number> = {};
    for (const article of malformedArticles) {
      for (const issue of article.issues) {
        issueStats[issue] = (issueStats[issue] || 0) + 1;
      }
    }
    
    console.error('📊 問題タイプ別統計');
    console.error('-'.repeat(60));
    for (const [issue, count] of Object.entries(issueStats)) {
      console.error(`${issue}: ${count}件`);
    }
    
    // 最初の10件を表示
    console.error('\n📝 問題のある記事（最初の10件）');
    console.error('-'.repeat(60));
    
    const displayArticles = malformedArticles.slice(0, 10);
    for (const article of displayArticles) {
      console.error(`\nID: ${article.id}`);
      console.error(`タイトル: ${article.title?.substring(0, 50)}...`);
      console.error(`問題: ${article.issues.join(', ')}`);
    }
    
    // IDリストを出力（再生成用）
    if (malformedArticles.length > 0) {
      console.error('\n📋 再生成用IDリスト（最初の20件）:');
      const ids = malformedArticles.slice(0, 20).map(a => a.id);
      console.error(ids.join(' '));
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findMalformedSummaries().catch(console.error);