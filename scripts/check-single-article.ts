#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkSingleArticle(articleId: string) {
  // 特定の記事を確認
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true,
      content: true,
      source: { select: { name: true } },
      createdAt: true,
      updatedAt: true
    }
  });
  
  if (article) {
    console.log('📊 記事の現在の状態');
    console.log('='.repeat(60));
    console.log('ID:', article.id);
    console.log('ソース:', article.source?.name);
    console.log('作成日:', article.createdAt.toISOString());
    console.log('更新日:', article.updatedAt.toISOString());
    console.log('タイトル:', article.title);
    console.log('コンテンツ長:', (article.content || '').length, '文字');
    console.log('\n📝 要約:');
    console.log(article.summary || '(なし)');
    
    console.log('\n📋 詳細要約:');
    if (article.detailedSummary) {
      const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
      console.log('項目数:', lines.length);
      lines.forEach((line, i) => {
        console.log((i + 1) + '.', line.substring(0, 70) + '...');
      });
    } else {
      console.log('(なし)');
    }
    
    // 問題の分析
    const issues = [];
    if (article.summary?.startsWith('要約:')) issues.push('プレフィックスあり');
    if (article.summary?.includes('**')) issues.push('Markdown記法');
    if (article.summary && article.summary.length < 60) issues.push('要約が短い');
    const detailLines = article.detailedSummary ? 
      article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・')).length : 0;
    if (detailLines < 6) {
      issues.push(`詳細要約不完全(${detailLines}項目)`);
    }
    
    if (issues.length > 0) {
      console.log('\n⚠️ 問題:', issues.join(', '));
    } else {
      console.log('\n✅ 問題なし');
    }
  } else {
    console.log('記事が見つかりません');
  }
  
  await prisma.$disconnect();
}

// コマンドライン引数から記事IDを取得
const articleId = process.argv[2] || 'cmdq3nww70003tegxm78oydnb';
checkSingleArticle(articleId).catch(console.error);