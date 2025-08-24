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
    console.error('📊 記事の現在の状態');
    console.error('='.repeat(60));
    console.error('ID:', article.id);
    console.error('ソース:', article.source?.name);
    console.error('作成日:', article.createdAt.toISOString());
    console.error('更新日:', article.updatedAt.toISOString());
    console.error('タイトル:', article.title);
    console.error('コンテンツ長:', (article.content || '').length, '文字');
    console.error('\n📝 要約:');
    console.error(article.summary || '(なし)');
    
    console.error('\n📋 詳細要約:');
    if (article.detailedSummary) {
      const lines = article.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
      console.error('項目数:', lines.length);
      lines.forEach((line, i) => {
        console.error((i + 1) + '.', line.substring(0, 70) + '...');
      });
    } else {
      console.error('(なし)');
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
      console.error('\n⚠️ 問題:', issues.join(', '));
    } else {
      console.error('\n✅ 問題なし');
    }
  } else {
    console.error('記事が見つかりません');
  }
  
  await prisma.$disconnect();
}

// コマンドライン引数から記事IDを取得
const articleId = process.argv[2] || 'cmdq3nww70003tegxm78oydnb';
checkSingleArticle(articleId).catch(console.error);