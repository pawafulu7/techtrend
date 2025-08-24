#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDbDirect() {
  const articleId = 'cme161hh3000wte0t7lyr8lk9';
  
  console.error('📊 データベースから直接確認\n');
  console.error('='.repeat(80));
  
  try {
    // データベースから直接取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
        updatedAt: true
      }
    });
    
    if (!article) {
      console.error('記事が見つかりません');
      return;
    }
    
    console.error(`ID: ${article.id}`);
    console.error(`タイトル: ${article.title}`);
    console.error(`最終更新: ${article.updatedAt.toISOString()}`);
    
    console.error('\n📝 要約（データベースの値）');
    console.error('-'.repeat(80));
    console.error(article.summary);
    
    console.error('\n📋 詳細要約（データベースの値）');
    console.error('-'.repeat(80));
    console.error(article.detailedSummary);
    
    console.error('\n🔍 分析');
    console.error('-'.repeat(80));
    
    // Markdown記法のチェック
    const hasMarkdown = article.summary?.includes('**');
    console.error(`要約にMarkdown記法: ${hasMarkdown ? '❌ あり' : '✅ なし'}`);
    
    // 詳細要約の項目数
    const lines = article.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
    console.error(`詳細要約の項目数: ${lines.length}`);
    
    // 詳細要約に要約が含まれているかチェック
    const firstLine = lines[0] || '';
    const hasEmbeddedSummary = firstLine.includes('**要約:**') || firstLine.includes('要約:');
    console.error(`詳細要約に要約ラベル: ${hasEmbeddedSummary ? '❌ あり' : '✅ なし'}`);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDbDirect().catch(console.error);