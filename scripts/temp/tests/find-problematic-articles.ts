#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function findProblematicArticles() {
  // プレフィックスやMarkdown記法を含む記事を検索
  const allArticles = await prisma.article.findMany({
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true,
      source: { select: { name: true } },
      createdAt: true
    },
    orderBy: { createdAt: 'desc' },
    take: 500  // 直近500件をチェック
  });
  
  console.error('🔍 問題のある記事を検索中...');
  console.error('検査対象: ' + allArticles.length + '件\n');
  
  const problematicArticles: any[] = [];
  
  allArticles.forEach(article => {
    const issues: string[] = [];
    
    // 要約の問題チェック
    if (article.summary) {
      if (article.summary.match(/^\s*要約[:：]/i) || 
          article.summary.match(/^\s*\*\*要約/i) ||
          article.summary.includes('**') ||
          article.summary.includes('##')) {
        issues.push('要約にプレフィックス/Markdown');
      }
    }
    
    // 詳細要約の問題チェック
    if (article.detailedSummary) {
      const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
      if (lines.length < 6) {
        issues.push('詳細要約' + lines.length + '項目');
      }
      // 詳細要約内のMarkdown記法チェック
      if (article.detailedSummary.includes('**') || 
          article.detailedSummary.includes('##')) {
        issues.push('詳細にMarkdown');
      }
    } else {
      issues.push('詳細要約なし');
    }
    
    if (issues.length > 0) {
      problematicArticles.push({
        id: article.id,
        title: article.title?.substring(0, 40),
        source: article.source?.name,
        issues: issues,
        summary: article.summary?.substring(0, 50)
      });
    }
  });
  
  console.error('='.repeat(80));
  console.error('問題のある記事: ' + problematicArticles.length + '件\n');
  
  // 問題別に集計
  const issueTypes: Record<string, number> = {};
  problematicArticles.forEach(article => {
    article.issues.forEach((issue: string) => {
      if (issueTypes[issue] === undefined) {
        issueTypes[issue] = 0;
      }
      issueTypes[issue]++;
    });
  });
  
  console.error('問題の内訳:');
  Object.entries(issueTypes).forEach(([issue, count]) => {
    console.error('- ' + issue + ': ' + count + '件');
  });
  
  // 最初の20件を表示
  console.error('\n最初の20件:');
  problematicArticles.slice(0, 20).forEach((article, i) => {
    console.error((i + 1) + '. ' + article.id);
    console.error('   ' + article.title + '...');
    console.error('   問題: ' + article.issues.join(', '));
    if (article.summary) {
      console.error('   要約: ' + article.summary + '...');
    }
    console.error();
  });
  
  // IDリストを出力（処理用）
  console.error('\n処理対象IDリスト（最初の30件）:');
  console.error(JSON.stringify(problematicArticles.slice(0, 30).map(a => a.id), null, 2));
  
  await prisma.$disconnect();
}

findProblematicArticles().catch(console.error);