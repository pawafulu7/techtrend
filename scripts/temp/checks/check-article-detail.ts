#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkArticleDetail() {
  const articleId = 'cme161hh3000wte0t7lyr8lk9';
  
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        url: true,
        summary: true,
        detailedSummary: true,
        content: true,
        publishedAt: true,
        tags: {
          select: {
            name: true
          }
        }
      }
    });
    
    if (!article) {
      console.error('記事が見つかりません');
      return;
    }
    
    console.error('📄 記事詳細');
    console.error('='.repeat(80));
    console.error(`ID: ${article.id}`);
    console.error(`タイトル: ${article.title}`);
    console.error(`URL: ${article.url}`);
    console.error(`公開日: ${article.publishedAt?.toISOString()}`);
    console.error(`タグ: ${article.tags.map(t => t.name).join(', ')}`);
    
    console.error('\n📝 要約');
    console.error('-'.repeat(80));
    console.error(article.summary);
    
    console.error('\n📋 詳細要約（生データ）');
    console.error('-'.repeat(80));
    console.error(article.detailedSummary);
    
    console.error('\n📄 コンテンツ');
    console.error('-'.repeat(80));
    if (article.content) {
      console.error(`コンテンツ長: ${article.content.length}文字`);
      console.error('\n内容:');
      console.error(article.content);
    } else {
      console.error('(コンテンツなし)');
    }
    
    // 問題の分析
    console.error('\n🔍 問題分析');
    console.error('-'.repeat(80));
    
    // 要約に含まれる問題パターンをチェック
    const issues = [];
    
    if (article.summary?.includes('**')) {
      issues.push('要約にMarkdown記法が含まれている');
    }
    
    if (article.summary?.includes('## ')) {
      issues.push('要約に見出し記法が含まれている');
    }
    
    if (article.detailedSummary?.includes('**要約:**')) {
      issues.push('詳細要約に要約ラベルが重複している');
    }
    
    if (article.detailedSummary?.includes('## ')) {
      issues.push('詳細要約に見出し記法が含まれている');
    }
    
    const lines = article.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
    if (lines.length < 6) {
      issues.push(`詳細要約が${lines.length}項目しかない（6項目必要）`);
    }
    
    if (issues.length > 0) {
      console.error('❌ 発見された問題:');
      issues.forEach(issue => console.error(`  ・${issue}`));
    } else {
      console.error('✅ 形式的な問題は見つかりませんでした');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkArticleDetail().catch(console.error);