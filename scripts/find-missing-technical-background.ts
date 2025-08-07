#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function findMissingTechnicalBackground() {
  // 詳細要約がある記事を取得
  const articles = await prisma.article.findMany({
    where: {
      detailedSummary: { not: null }
    },
    select: {
      id: true,
      title: true,
      detailedSummary: true,
      source: { select: { name: true } },
      createdAt: true
    },
    orderBy: { createdAt: 'desc' },
    take: 500
  });
  
  console.log('🔍 技術的背景が欠落している記事を検索中...');
  console.log('検査対象: ' + articles.length + '件\n');
  
  const problematicArticles: any[] = [];
  
  articles.forEach(article => {
    if (article.detailedSummary) {
      const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
      
      if (lines.length > 0) {
        const firstLine = lines[0];
        
        // 第1項目が「記事の主題は」で始まっていない場合
        if (!firstLine.includes('記事の主題は')) {
          // 第1項目の内容を確認
          let firstItemType = '不明';
          if (firstLine.includes('具体的な問題')) {
            firstItemType = '問題から開始';
          } else if (firstLine.includes('解決策')) {
            firstItemType = '解決策から開始';
          } else if (firstLine.includes('要約')) {
            firstItemType = '要約の重複';
          } else if (firstLine.includes('実装')) {
            firstItemType = '実装から開始';
          }
          
          problematicArticles.push({
            id: article.id,
            title: article.title?.substring(0, 40),
            source: article.source?.name,
            itemCount: lines.length,
            firstLine: firstLine.substring(0, 60),
            firstItemType: firstItemType
          });
        }
      }
    }
  });
  
  console.log('='.repeat(80));
  console.log('技術的背景が欠落している記事: ' + problematicArticles.length + '件\n');
  
  // 問題のタイプ別に集計
  const issueTypes: Record<string, number> = {};
  problematicArticles.forEach(article => {
    const type = article.firstItemType;
    if (issueTypes[type] === undefined) {
      issueTypes[type] = 0;
    }
    issueTypes[type]++;
  });
  
  console.log('問題のタイプ:');
  Object.entries(issueTypes).forEach(([type, count]) => {
    console.log('- ' + type + ': ' + count + '件');
  });
  
  // 最初の20件を表示
  console.log('\n最初の20件:');
  problematicArticles.slice(0, 20).forEach((article, i) => {
    console.log((i + 1) + '. ' + article.id);
    console.log('   ' + article.title + '...');
    console.log('   ソース: ' + article.source);
    console.log('   項目数: ' + article.itemCount);
    console.log('   第1項目: ' + article.firstLine + '...');
    console.log('   タイプ: ' + article.firstItemType);
    console.log();
  });
  
  // 処理対象IDリストを出力
  console.log('\n処理対象IDリスト（最初の20件）:');
  console.log(JSON.stringify(problematicArticles.slice(0, 20).map(a => a.id), null, 2));
  
  await prisma.$disconnect();
}

findMissingTechnicalBackground().catch(console.error);